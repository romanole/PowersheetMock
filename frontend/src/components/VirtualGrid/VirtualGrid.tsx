import { useState, useEffect, useRef } from 'react';
import type { TableSchema } from '../../types/database';
import { FormulaEngine } from '../../services/FormulaEngine';

interface VirtualGridProps {
    schema: TableSchema;
    data: any[][];
    isLoading?: boolean;
    onCellEdit?: (rowIndex: number, colIndex: number, newValue: string) => void;
    onColumnTypeChange?: (colIndex: number, newType: string) => void;
    onInsertRow?: (rowIndex: number, position: 'above' | 'below') => void;
    onDeleteRow?: (rowIndex: number) => void;
    onInsertColumn?: (colIndex: number) => void;
    onDeleteColumn?: (colIndex: number) => void;
    sheetId: string | null;
}

interface EditingCell {
    row: number;
    col: number;
    value: string;
}

interface ContextMenu {
    x: number;
    y: number;
    type: 'row' | 'column' | 'cell';
    index: number;
    row?: number;
    col?: number;
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
}: VirtualGridProps) {
    const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
    const [selectedCell, setSelectedCell] = useState<{ row: number; col: number } | null>(null);
    const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
    const gridRef = useRef<HTMLDivElement>(null);

    const COLUMN_WIDTH = 120;
    const ROW_NUMBER_WIDTH = 50;

    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState<{ row: number; col: number } | null>(null);
    const [dragEnd, setDragEnd] = useState<{ row: number; col: number } | null>(null);
    const [copiedCell, setCopiedCell] = useState<{ row: number; col: number } | null>(null);

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

            // Apply fill
            const startRow = Math.min(dragStart.row, dragEnd.row);
            const endRow = Math.max(dragStart.row, dragEnd.row);
            const startCol = Math.min(dragStart.col, dragEnd.col);
            const endCol = Math.max(dragStart.col, dragEnd.col);

            const sourceValue = data[dragStart.row][dragStart.col];
            const sourceFormula = FormulaEngine.getInstance().getFormula(sheetId, dragStart.row, dragStart.col);

            // Determine direction (only vertical or horizontal supported for simplicity)
            // If dragging both ways, prioritize vertical

            // For now, simple fill: copy source to all cells in range
            for (let r = startRow; r <= endRow; r++) {
                for (let c = startCol; c <= endCol; c++) {
                    if (r === dragStart.row && c === dragStart.col) continue;

                    if (sourceFormula) {
                        // TODO: Adjust relative references
                        // For Phase 1, we just copy the formula exactly (absolute ref behavior)
                        // Implementing relative ref adjustment requires parsing
                        if (onCellEdit) onCellEdit(r, c, sourceFormula);
                    } else {
                        if (onCellEdit) onCellEdit(r, c, String(sourceValue));
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
                const { row, col } = selectedCell;
                let newRow = row;
                let newCol = col;

                if (e.key === 'ArrowUp') newRow = Math.max(0, row - 1);
                if (e.key === 'ArrowDown') newRow = Math.min(data.length - 1, row + 1);
                if (e.key === 'ArrowLeft') newCol = Math.max(0, col - 1);
                if (e.key === 'ArrowRight') newCol = Math.min(schema.columns.length - 1, col + 1);

                setSelectedCell({ row: newRow, col: newCol });
                return;
            }

            if (e.key === 'F2') {
                e.preventDefault();
                const currentValue = data[selectedCell.row][selectedCell.col];
                const formula = sheetId ? FormulaEngine.getInstance().getFormula(sheetId, selectedCell.row, selectedCell.col) : null;
                setEditingCell({
                    row: selectedCell.row,
                    col: selectedCell.col,
                    value: formula || (currentValue !== null && currentValue !== undefined ? String(currentValue) : ''),
                });
                return;
            }

            if (e.key === 'Delete') {
                e.preventDefault();
                setEditingCell({
                    row: selectedCell.row,
                    col: selectedCell.col,
                    value: '',
                });
                return;
            }

            if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault();
                setEditingCell({
                    row: selectedCell.row,
                    col: selectedCell.col,
                    value: e.key,
                });
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedCell, editingCell, data, schema]);

    const handleCellBlur = () => {
        if (editingCell && onCellEdit) {
            onCellEdit(editingCell.row, editingCell.col, editingCell.value);
        }
        setEditingCell(null);
    };

    const handleCellKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleCellBlur();
            if (selectedCell) {
                setSelectedCell({
                    row: Math.min(data.length - 1, selectedCell.row + 1),
                    col: selectedCell.col
                });
            }
        } else if (e.key === 'Escape') {
            setEditingCell(null);
        } else if (e.key === 'Tab') {
            e.preventDefault();
            handleCellBlur();
            if (selectedCell) {
                const newCol = selectedCell.col + 1;
                if (newCol >= schema.columns.length) {
                    setSelectedCell({ row: selectedCell.row + 1, col: 0 });
                } else {
                    setSelectedCell({ row: selectedCell.row, col: newCol });
                }
            }
        }
    };

    const handleRowContextMenu = (e: React.MouseEvent, rowIdx: number) => {
        e.preventDefault();
        console.log('🔍 [CONTEXT MENU] Row context menu triggered:', rowIdx);
        setContextMenu({
            x: e.clientX,
            y: e.clientY,
            type: 'row',
            index: rowIdx,
        });
        console.log('🔍 [CONTEXT MENU] Set context menu state:', { x: e.clientX, y: e.clientY, type: 'row', index: rowIdx });
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
                                        {(() => {
                                            let temp, letter = '';
                                            let colIndex = idx;
                                            while (colIndex >= 0) {
                                                temp = (colIndex) % 26;
                                                letter = String.fromCharCode(temp + 65) + letter;
                                                colIndex = (colIndex - temp - 1) / 26;
                                            }
                                            return letter;
                                        })()}
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
