import { useState, useEffect, useRef } from 'react';
import type { TableSchema } from '../../types/database';
import { 
    createCellAddress, 
    parseCellAddress, 
    createRangeFromCoords, 
    numberToColumn,
    type ExcelCellAddress,
    type ExcelRange 
} from '../../lib/excel-coordinates';
import { useGridStore } from '../../store/gridStore';

interface ExcelGridProps {
    schema: TableSchema;
    data: any[][];
    isLoading?: boolean;
    onCellEdit?: (cellAddress: string, newValue: string) => void;
    onColumnTypeChange?: (colIndex: number, newType: string) => void;
    sheetId: string | null;
}

interface EditingCell {
    address: ExcelCellAddress;
    value: string;
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

export function ExcelGrid({
    schema,
    data,
    isLoading = false,
    onCellEdit,
    onColumnTypeChange,
    sheetId,
}: ExcelGridProps) {
    const gridRef = useRef<HTMLDivElement>(null);
    const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
    
    // Get state from store
    const { 
        selectedCell, 
        selectedCells,
        setSelectedCell, 
        setSelectedCells,
        currentFormula,
        setCurrentFormula
    } = useGridStore();

    const COLUMN_WIDTH = 120;
    const ROW_NUMBER_WIDTH = 50;

    // Handle cell selection
    const handleCellClick = (rowIndex: number, colIndex: number) => {
        const address = createCellAddress(rowIndex, colIndex);
        setSelectedCell(address);
        
        // Update formula bar with current cell value/formula
        const cellValue = data[rowIndex]?.[colIndex];
        // TODO: Get formula from formula engine if exists
        setCurrentFormula(cellValue ? String(cellValue) : '');
        
        gridRef.current?.focus();
    };

    // Handle cell editing
    const handleCellDoubleClick = (rowIndex: number, colIndex: number) => {
        const address = createCellAddress(rowIndex, colIndex);
        const currentValue = data[rowIndex]?.[colIndex];
        // TODO: Get formula from formula engine if exists
        
        setEditingCell({
            address,
            value: currentValue ? String(currentValue) : '',
        });
    };

    // Handle keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!selectedCell || editingCell) return;

            // Arrow key navigation
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                e.preventDefault();
                const coords = parseCellAddress(selectedCell.display);
                let newRow = coords.rowIndex;
                let newCol = coords.colIndex;

                switch (e.key) {
                    case 'ArrowUp':
                        newRow = Math.max(0, coords.rowIndex - 1);
                        break;
                    case 'ArrowDown':
                        newRow = Math.min(data.length - 1, coords.rowIndex + 1);
                        break;
                    case 'ArrowLeft':
                        newCol = Math.max(0, coords.colIndex - 1);
                        break;
                    case 'ArrowRight':
                        newCol = Math.min(schema.columns.length - 1, coords.colIndex + 1);
                        break;
                }

                const newAddress = createCellAddress(newRow, newCol);
                setSelectedCell(newAddress);
                
                // Update formula bar
                const cellValue = data[newRow]?.[newCol];
                setCurrentFormula(cellValue ? String(cellValue) : '');
                return;
            }

            // F2 to edit
            if (e.key === 'F2') {
                e.preventDefault();
                const coords = parseCellAddress(selectedCell.display);
                handleCellDoubleClick(coords.rowIndex, coords.colIndex);
                return;
            }

            // Delete to clear
            if (e.key === 'Delete') {
                e.preventDefault();
                const coords = parseCellAddress(selectedCell.display);
                setEditingCell({
                    address: selectedCell,
                    value: '',
                });
                return;
            }

            // Type to edit
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
    }, [selectedCell, editingCell, data, schema, setSelectedCell, setCurrentFormula]);

    // Handle cell edit completion
    const handleEditComplete = (save: boolean = true) => {
        if (editingCell && save && onCellEdit) {
            onCellEdit(editingCell.address.display, editingCell.value);
        }
        setEditingCell(null);
    };

    // Handle edit input key events
    const handleEditKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleEditComplete(true);
            
            // Move to next row
            if (selectedCell) {
                const coords = parseCellAddress(selectedCell.display);
                const newRow = Math.min(data.length - 1, coords.rowIndex + 1);
                const newAddress = createCellAddress(newRow, coords.colIndex);
                setSelectedCell(newAddress);
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            handleEditComplete(false);
        } else if (e.key === 'Tab') {
            e.preventDefault();
            handleEditComplete(true);
            
            // Move to next column
            if (selectedCell) {
                const coords = parseCellAddress(selectedCell.display);
                const newCol = coords.colIndex + 1;
                if (newCol >= schema.columns.length) {
                    const newAddress = createCellAddress(coords.rowIndex + 1, 0);
                    setSelectedCell(newAddress);
                } else {
                    const newAddress = createCellAddress(coords.rowIndex, newCol);
                    setSelectedCell(newAddress);
                }
            }
        }
    };

    // Check if cell is selected
    const isCellSelected = (rowIndex: number, colIndex: number): boolean => {
        if (!selectedCell) return false;
        const coords = parseCellAddress(selectedCell.display);
        return coords.rowIndex === rowIndex && coords.colIndex === colIndex;
    };

    // Check if cell is being edited
    const isCellEditing = (rowIndex: number, colIndex: number): boolean => {
        if (!editingCell) return false;
        const coords = parseCellAddress(editingCell.address.display);
        return coords.rowIndex === rowIndex && coords.colIndex === colIndex;
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
                    {/* Column Headers */}
                    <thead className="sticky top-0 z-20">
                        <tr>
                            {/* Row selector corner */}
                            <th
                                className="bg-slate-200 border border-slate-400 sticky left-0 z-30"
                                style={{ width: `${ROW_NUMBER_WIDTH}px`, minWidth: `${ROW_NUMBER_WIDTH}px` }}
                            ></th>
                            
                            {/* Column headers */}
                            {schema.columns.map((col, colIndex) => (
                                <th
                                    key={colIndex}
                                    className="bg-slate-200 border border-slate-400 px-2 py-1 text-xs font-bold text-slate-700 select-none"
                                    style={{ width: `${COLUMN_WIDTH}px`, minWidth: `${COLUMN_WIDTH}px` }}
                                >
                                    {/* Excel column letter */}
                                    <div className="text-[10px] text-slate-500 font-mono mb-0.5">
                                        {numberToColumn(colIndex)}
                                    </div>
                                    
                                    {/* Column name */}
                                    <div className="truncate font-semibold text-center">{col.name}</div>

                                    {/* Column type selector */}
                                    <select
                                        value={col.type.toUpperCase()}
                                        onChange={(e) => onColumnTypeChange?.(colIndex, e.target.value)}
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

                    {/* Data rows */}
                    <tbody>
                        {data.map((row, rowIndex) => (
                            <tr key={rowIndex} className="group">
                                {/* Row number */}
                                <td
                                    className="bg-slate-200 border border-slate-400 text-center text-xs font-semibold text-slate-700 select-none sticky left-0 z-10 group-hover:bg-slate-300"
                                    style={{ width: `${ROW_NUMBER_WIDTH}px`, minWidth: `${ROW_NUMBER_WIDTH}px` }}
                                >
                                    {rowIndex + 1}
                                </td>

                                {/* Data cells */}
                                {row.map((cellValue, colIndex) => {
                                    const isSelected = isCellSelected(rowIndex, colIndex);
                                    const isEditing = isCellEditing(rowIndex, colIndex);
                                    const colType = schema.columns[colIndex]?.type.toLowerCase();
                                    const isNumeric = colType.includes('int') || colType.includes('float') ||
                                        colType.includes('double') || colType.includes('decimal');

                                    return (
                                        <td
                                            key={colIndex}
                                            className={`border border-slate-300 px-0 py-0 text-sm cursor-cell
                                                ${isSelected && !isEditing ? 'ring-2 ring-blue-500 z-20' : ''}
                                                ${isSelected ? 'bg-blue-50' : 'bg-white hover:bg-blue-50'}
                                            `}
                                            style={{
                                                width: `${COLUMN_WIDTH}px`,
                                                minWidth: `${COLUMN_WIDTH}px`,
                                            }}
                                            onClick={() => handleCellClick(rowIndex, colIndex)}
                                            onDoubleClick={() => handleCellDoubleClick(rowIndex, colIndex)}
                                        >
                                            {isEditing ? (
                                                <input
                                                    type="text"
                                                    value={editingCell?.value || ''}
                                                    onChange={(e) => setEditingCell(prev => 
                                                        prev ? { ...prev, value: e.target.value } : null
                                                    )}
                                                    onBlur={() => handleEditComplete(true)}
                                                    onKeyDown={handleEditKeyDown}
                                                    className="w-full h-full px-2 py-1 outline-none border-2 border-blue-500"
                                                    autoFocus
                                                    style={{ textAlign: isNumeric ? 'right' : 'left' }}
                                                />
                                            ) : (
                                                <div
                                                    className={`px-2 py-1 truncate ${isNumeric ? 'text-right font-mono' : 'text-left'}`}
                                                    title={String(cellValue)}
                                                >
                                                    {cellValue !== null && cellValue !== undefined ? String(cellValue) : ''}
                                                </div>
                                            )}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Status bar */}
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
                                {selectedCell.display} • {schema.columns[parseCellAddress(selectedCell.display).colIndex]?.name}
                            </span>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}