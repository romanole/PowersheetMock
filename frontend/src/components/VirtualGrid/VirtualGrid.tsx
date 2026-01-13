import { useState, useEffect, useRef } from 'react';
import type { TableSchema } from '../../types/database';
import { FormulaEngine } from '../../services/FormulaEngine';
import { 
    createCellAddress, 
    parseCellAddress, 
    createRangeFromCoords, 
    numberToColumn,
    type ExcelCellAddress,
    type ExcelRange 
} from '../../lib/excel-coordinates';

interface VirtualGridProps {
    schema: TableSchema;
    data: any[][];
    isLoading?: boolean;
    onCellEdit?: (cellAddress: string, newValue: string) => void;
    onColumnTypeChange?: (colIndex: number, newType: string) => void;
    onInsertRow?: (rowIndex: number, position: 'above' | 'below') => void;
    onDeleteRow?: (rowIndex: number) => void;
    onInsertColumn?: (colIndex: number) => void;
    onDeleteColumn?: (colIndex: number) => void;
    sheetId: string | null;
    selectedCell?: ExcelCellAddress | null;
    selectedRange?: ExcelRange | null;
    onCellSelect?: (cell: ExcelCellAddress) => void;
    onRangeSelect?: (range: ExcelRange) => void;
}

interface EditingCell {
    address: ExcelCellAddress;
    value: string;
}

interface ContextMenu {
    x: number;
    y: number;
    type: 'row' | 'column' | 'cell';
    index: number;
    cellAddress?: ExcelCellAddress;
}

const COLUMN_TYPES = [
    'VARCHAR',
    'INTEGER',
    'BIGINT',
    'DOUBLE',
    'BOOLEAN',
    'DATE',
    'TIMESTAMP',
];

export function VirtualGrid({
    schema,
    data,
    isLoading = false,
    onCellEdit,
    onColumnTypeChange,
    onInsertRow,
    onDeleteRow,
    onInsertColumn,
    onDeleteColumn,
    sheetId,
    selectedCell,
    selectedRange,
    onCellSelect,
    onRangeSelect,
}: VirtualGridProps) {
    const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
    const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
    const gridRef = useRef<HTMLDivElement>(null);

    const COLUMN_WIDTH = 120;
    const ROW_NUMBER_WIDTH = 50;

    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState<ExcelCellAddress | null>(null);
    const [dragEnd, setDragEnd] = useState<ExcelCellAddress | null>(null);
    const [copiedCell, setCopiedCell] = useState<ExcelCellAddress | null>(null);

    // Close context menu on click outside
    useEffect(() => {
        const handleClick = () => setContextMenu(null);
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, []);

    // Drag to fill logic
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging || !dragStart || !gridRef.current) return;

            // Calculate which cell we are over
            // This is a simplified version; ideally we'd use elementFromPoint or similar
            // For now, let's just rely on mouse events on cells if possible, but global mouse move is better for dragging outside
            // A better approach for this mock:
            // We'll rely on onMouseEnter of cells to update dragEnd
        };

        const handleMouseUp = async () => {
            if (!isDragging || !dragStart || !dragEnd || !sheetId) {
                setIsDragging(false);
                setDragStart(null);
                setDragEnd(null);
                return;
            }

            // Apply fill using Excel coordinates
            const startCoords = parseCellAddress(dragStart.display);
            const endCoords = parseCellAddress(dragEnd.display);
            
            const startRow = Math.min(startCoords.rowIndex, endCoords.rowIndex);
            const endRow = Math.max(startCoords.rowIndex, endCoords.rowIndex);
            const startCol = Math.min(startCoords.colIndex, endCoords.colIndex);
            const endCol = Math.max(startCoords.colIndex, endCoords.colIndex);

            const sourceValue = data[startCoords.rowIndex][startCoords.colIndex];
            const sourceFormula = FormulaEngine.getInstance().getFormula(sheetId, startCoords.rowIndex, startCoords.colIndex);

            // For now, simple fill: copy source to all cells in range
            for (let r = startRow; r <= endRow; r++) {
                for (let c = startCol; c <= endCol; c++) {
                    if (r === startCoords.rowIndex && c === startCoords.colIndex) continue;

                    const cellAddress = createCellAddress(r, c);
                    if (sourceFormula) {
                        // TODO: Adjust relative references
                        // For Phase 1, we just copy the formula exactly (absolute ref behavior)
                        if (onCellEdit) onCellEdit(cellAddress.display, sourceFormula);
                    } else {
                        if (onCellEdit) onCellEdit(cellAddress.display, String(sourceValue));
                    }
                }
            }

            setIsDragging(false);
            setDragStart(null);
            setDragEnd(null);
        };

        if (isDragging) {
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, dragStart, dragEnd, data, sheetId, onCellEdit]);

    // Excel-style editing
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!selectedCell || editingCell) return;

            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                e.preventDefault();
                const coords = parseCellAddress(selectedCell.display);
                let newRow = coords.rowIndex;
                let newCol = coords.colIndex;

                if (e.key === 'ArrowUp') newRow = Math.max(0, coords.rowIndex - 1);
                if (e.key === 'ArrowDown') newRow = Math.min(data.length - 1, coords.rowIndex + 1);
                if (e.key === 'ArrowLeft') newCol = Math.max(0, coords.colIndex - 1);
                if (e.key === 'ArrowRight') newCol = Math.min(schema.columns.length - 1, coords.colIndex + 1);

                const newAddress = createCellAddress(newRow, newCol);
                onCellSelect?.(newAddress);
                return;
            }

            if (e.key === 'F2') {
                e.preventDefault();
                const coords = parseCellAddress(selectedCell.display);
                const currentValue = data[coords.rowIndex][coords.colIndex];
                const formula = sheetId ? FormulaEngine.getInstance().getFormula(sheetId, coords.rowIndex, coords.colIndex) : null;
                setEditingCell({
                    address: selectedCell,
                    value: formula || (currentValue !== null && currentValue !== undefined ? String(currentValue) : ''),
                });
                return;
            }

            if (e.key === 'Delete') {
                e.preventDefault();
                setEditingCell({
                    address: selectedCell,
                    value: '',
                });
                return;
            }

            if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault();
                setEditingCell({
                    address: selectedCell,
                    value: e.key,
                });
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedCell, editingCell, data, schema]);

    const handleCellBlur = () => {
        if (editingCell && onCellEdit) {
            onCellEdit(editingCell.address.display, editingCell.value);
        }
        setEditingCell(null);
    };

    const handleCellKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleCellBlur();
            if (selectedCell && onCellSelect) {
                const coords = parseCellAddress(selectedCell.display);
                const newRow = Math.min(data.length - 1, coords.rowIndex + 1);
                const newAddress = createCellAddress(newRow, coords.colIndex);
                onCellSelect(newAddress);
            }
        } else if (e.key === 'Escape') {
            setEditingCell(null);
        } else if (e.key === 'Tab') {
            e.preventDefault();
            handleCellBlur();
            if (selectedCell && onCellSelect) {
                const coords = parseCellAddress(selectedCell.display);
                const newCol = coords.colIndex + 1;
                if (newCol >= schema.columns.length) {
                    const newAddress = createCellAddress(coords.rowIndex + 1, 0);
                    onCellSelect(newAddress);
                } else {
                    const newAddress = createCellAddress(coords.rowIndex, newCol);
                    onCellSelect(newAddress);
                }
            }
        }
    };

    const handleRowContextMenu = (e: React.MouseEvent, rowIdx: number) => {
        e.preventDefault();
        setContextMenu({
            x: e.clientX,
            y: e.clientY,
            type: 'row',
            index: rowIdx,
        });
    };

    const handleColumnContextMenu = (e: React.MouseEvent, colIdx: number) => {
        e.preventDefault();
        setContextMenu({
            x: e.clientX,
            y: e.clientY,
            type: 'column',
            index: colIdx,
        });
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-4 bg-white">
                <div className="text-6xl">⏳</div>
                <p className="text-lg font-medium text-slate-700">Loading data...</p>
            </div>
        );
    }

    if (!data || data.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-4 bg-white">
                <div className="text-6xl">📊</div>
                <p className="text-lg font-medium text-slate-700">No data to display</p>
            </div>
        );
    }

    return (
        <div ref={gridRef} className="h-full overflow-auto bg-slate-100" tabIndex={0}>
            <div className="inline-block min-h-full min-w-full">
                <table className="border-collapse" style={{ tableLayout: 'fixed' }}>
                    <thead className="sticky top-0 z-20">
                        <tr>
                            <th
                                className="bg-slate-200 border border-slate-400 sticky left-0 z-30"
                                style={{ width: `${ROW_NUMBER_WIDTH}px`, minWidth: `${ROW_NUMBER_WIDTH}px` }}
                            ></th>

                            {schema.columns.map((col, idx) => (
                                <th
                                    key={idx}
                                    className="bg-slate-200 border border-slate-400 px-2 py-1 text-xs font-bold text-slate-700 select-none group"
                                    style={{ width: `${COLUMN_WIDTH}px`, minWidth: `${COLUMN_WIDTH}px` }}
                                    onContextMenu={(e) => handleColumnContextMenu(e, idx)}
                                >
                                    <div className="text-[10px] text-slate-500 font-mono mb-0.5">
                                        {numberToColumn(idx)}
                                    </div>
                                    <div className="truncate font-semibold text-center">{col.name}</div>

                                    <select
                                        value={col.type.toUpperCase()}
                                        onChange={(e) => onColumnTypeChange?.(idx, e.target.value)}
                                        className="w-full mt-1 text-[9px] bg-white border border-slate-300 rounded px-1 py-0.5 cursor-pointer hover:bg-slate-50"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        {COLUMN_TYPES.map(type => (
                                            <option key={type} value={type}>
                                                {type.toLowerCase()}
                                            </option>
                                        ))}
                                    </select>
                                </th>
                            ))}
                        </tr>
                    </thead>

                    <tbody>
                        {data.map((row, rowIdx) => (
                            <tr key={rowIdx} className="group">
                                <td
                                    className="bg-slate-200 border border-slate-400 text-center text-xs font-semibold text-slate-700 select-none sticky left-0 z-10 group-hover:bg-slate-300 cursor-context-menu"
                                    style={{ width: `${ROW_NUMBER_WIDTH}px`, minWidth: `${ROW_NUMBER_WIDTH}px` }}
                                    onContextMenu={(e) => handleRowContextMenu(e, rowIdx)}
                                >
                                    {rowIdx + 1}
                                </td>

                                {row.map((cell, cellIdx) => {
                                    const colType = schema.columns[cellIdx]?.type.toLowerCase();
                                    const isNumeric = colType.includes('int') || colType.includes('float') ||
                                        colType.includes('double') || colType.includes('decimal');
                                    const isEditing = editingCell?.row === rowIdx && editingCell?.col === cellIdx;
                                    const isSelected = selectedCell?.row === rowIdx && selectedCell?.col === cellIdx;

                                    // Check if in drag range
                                    let isInDragRange = false;
                                    if (isDragging && dragStart && dragEnd) {
                                        const minRow = Math.min(dragStart.row, dragEnd.row);
                                        const maxRow = Math.max(dragStart.row, dragEnd.row);
                                        const minCol = Math.min(dragStart.col, dragEnd.col);
                                        const maxCol = Math.max(dragStart.col, dragEnd.col);
                                        isInDragRange = rowIdx >= minRow && rowIdx <= maxRow && cellIdx >= minCol && cellIdx <= maxCol;
                                    }

                                    return (
                                        <td
                                            key={cellIdx}
                                            className={`border border-slate-300 px-0 py-0 text-sm cursor-cell
                        ${isSelected && !isEditing ? 'ring-2 ring-blue-500 z-20' : ''}
                        ${isInDragRange ? 'bg-blue-100' : 'bg-white hover:bg-blue-50'}
                      `}
                                            style={{
                                                width: `${COLUMN_WIDTH}px`,
                                                minWidth: `${COLUMN_WIDTH}px`,
                                            }}
                                            onMouseEnter={() => {
                                                if (isDragging) {
                                                    setDragEnd({ row: rowIdx, col: cellIdx });
                                                }
                                            }}
                                            onContextMenu={(e) => {
                                                e.preventDefault();
                                                setContextMenu({
                                                    x: e.clientX,
                                                    y: e.clientY,
                                                    type: 'cell',
                                                    index: -1, // Not used for cell type
                                                    row: rowIdx,
                                                    col: cellIdx
                                                });
                                            }}
                                            onDoubleClick={() => {
                                                const currentValue = data[rowIdx][cellIdx];
                                                const formula = sheetId ? FormulaEngine.getInstance().getFormula(sheetId, rowIdx, cellIdx) : null;
                                                setEditingCell({
                                                    row: rowIdx,
                                                    col: cellIdx,
                                                    value: formula || (currentValue !== null && currentValue !== undefined ? String(currentValue) : ''),
                                                });
                                            }}
                                            onClick={() => {
                                                setSelectedCell({ row: rowIdx, col: cellIdx });
                                                gridRef.current?.focus();
                                            }}
                                        >
                                            {isEditing ? (
                                                <input
                                                    type="text"
                                                    value={editingCell.value}
                                                    onChange={(e) => setEditingCell({ ...editingCell, value: e.target.value })}
                                                    onBlur={handleCellBlur}
                                                    onKeyDown={handleCellKeyDown}
                                                    className="w-full h-full px-2 py-1 outline-none border-2 border-blue-500"
                                                    autoFocus
                                                    style={{ textAlign: isNumeric ? 'right' : 'left' }}
                                                />
                                            ) : (
                                                <div
                                                    className={`px-2 py-1 truncate ${isNumeric ? 'text-right font-mono' : 'text-left'}`}
                                                    title={String(cell)}
                                                >
                                                    {(() => {
                                                        if (sheetId && typeof cell === 'string' && cell.startsWith('=')) {
                                                            const result = FormulaEngine.getInstance().getCellValue(sheetId, rowIdx, cellIdx);
                                                            return result !== null ? String(result) : '#ERROR';
                                                        }
                                                        return cell !== null && cell !== undefined ? String(cell) : '';
                                                    })()}
                                                </div>
                                            )}
                                            {isSelected && !isEditing && (
                                                <div
                                                    className="absolute bottom-[-4px] right-[-4px] w-3 h-3 bg-blue-500 border-2 border-white cursor-crosshair z-30"
                                                    onMouseDown={(e) => {
                                                        e.stopPropagation();
                                                        setIsDragging(true);
                                                        setDragStart({ row: rowIdx, col: cellIdx });
                                                        setDragEnd({ row: rowIdx, col: cellIdx });
                                                    }}
                                                />
                                            )}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Context Menu */}
            {contextMenu && (
                <div
                    className="fixed bg-white border-2 border-slate-400 shadow-2xl rounded-md py-1 min-w-[180px]"
                    style={{ left: contextMenu.x, top: contextMenu.y, zIndex: 99999 }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {contextMenu.type === 'row' ? (
                        <>
                            <button
                                className="w-full text-left px-3 py-1.5 text-sm hover:bg-blue-50 flex items-center gap-2"
                                onClick={() => {
                                    onInsertRow?.(contextMenu.index, 'above');
                                    setContextMenu(null);
                                }}
                            >
                                <span>➕</span> Insert Row Above
                            </button>
                            <button
                                className="w-full text-left px-3 py-1.5 text-sm hover:bg-blue-50 flex items-center gap-2"
                                onClick={() => {
                                    onInsertRow?.(contextMenu.index, 'below');
                                    setContextMenu(null);
                                }}
                            >
                                <span>➕</span> Insert Row Below
                            </button>
                            <div className="border-t border-slate-200 my-1"></div>
                            <button
                                className="w-full text-left px-3 py-1.5 text-sm hover:bg-red-50 text-red-600 flex items-center gap-2"
                                onClick={() => {
                                    onDeleteRow?.(contextMenu.index);
                                    setContextMenu(null);
                                }}
                            >
                                <span>🗑️</span> Delete Row
                            </button>
                        </>
                    ) : contextMenu.type === 'column' ? (
                        <>
                            <button
                                className="w-full text-left px-3 py-1.5 text-sm hover:bg-blue-50 flex items-center gap-2"
                                onClick={() => {
                                    onInsertColumn?.(contextMenu.index);
                                    setContextMenu(null);
                                }}
                            >
                                <span>➕</span> Insert Column
                            </button>
                            <div className="border-t border-slate-200 my-1"></div>
                            <button
                                className="w-full text-left px-3 py-1.5 text-sm hover:bg-red-50 text-red-600 flex items-center gap-2"
                                onClick={() => {
                                    onDeleteColumn?.(contextMenu.index);
                                    setContextMenu(null);
                                }}
                            >
                                <span>🗑️</span> Delete Column
                            </button>
                        </>
                    ) : (
                        <>
                            <button
                                className="w-full text-left px-3 py-1.5 text-sm hover:bg-blue-50 flex items-center gap-2"
                                onClick={() => {
                                    if (contextMenu.row !== undefined && contextMenu.col !== undefined && sheetId && onCellEdit) {
                                        const sourceFormula = FormulaEngine.getInstance().getFormula(sheetId, contextMenu.row, contextMenu.col);
                                        const sourceValue = data[contextMenu.row][contextMenu.col];
                                        const content = sourceFormula || String(sourceValue);

                                        // Apply to all rows in this column
                                        // TODO: This should ideally be a batch update or SQL operation
                                        // For now, loop through client data (limited to loaded rows)
                                        // WARNING: This only updates loaded rows!
                                        for (let r = 0; r < data.length; r++) {
                                            if (r !== contextMenu.row) {
                                                onCellEdit(r, contextMenu.col, content);
                                            }
                                        }
                                    }
                                    setContextMenu(null);
                                }}
                            >
                                <span>🚀</span> Apply to Column
                            </button>
                        </>
                    )}
                </div>
            )}

            {/* Status footer */}
            <div className="fixed bottom-0 left-0 right-0 h-6 bg-slate-200 border-t border-slate-400 flex items-center px-3 text-[10px] text-slate-700 font-medium z-10">
                <div className="flex gap-4">
                    <span>📊 Ready</span>
                    <span>|</span>
                    <span>Rows: {data.length} of {schema.rowCount.toLocaleString()}</span>
                    <span>|</span>
                    <span>Columns: {schema.columns.length}</span>
                    {selectedCell && (
                        <>
                            <span>|</span>
                            <span className="text-blue-600 font-semibold">
                                {schema.columns[selectedCell.col]?.name} • Row {selectedCell.row + 1}
                            </span>
                        </>
                    )}
                    {!editingCell && selectedCell && (
                        <>
                            <span>|</span>
                            <span className="text-slate-500 text-[9px]">
                                Type to edit • F2 to edit • Del to clear • Right-click for options
                            </span>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
