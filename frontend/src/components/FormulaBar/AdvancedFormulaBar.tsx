import { useState } from 'react';
import { Calculator, Columns, Hash } from 'lucide-react';
import type { TableSchema } from '../../types/database';
import { numberToColumn, columnToNumber } from '../../lib/excel-coordinates';

interface AdvancedFormulaBarProps {
    schema: TableSchema | null;
    onColumnFormula: (column: string, formula: string) => void;
    onNamedCellFormula: (cellName: string, formula: string) => void;
}

export function AdvancedFormulaBar({ schema, onColumnFormula, onNamedCellFormula }: AdvancedFormulaBarProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [formulaMode, setFormulaMode] = useState<'column' | 'named'>('column');
    const [targetColumn, setTargetColumn] = useState('');
    const [cellName, setCellName] = useState('');
    const [formula, setFormula] = useState('');

    const handleApplyColumnFormula = () => {
        if (!targetColumn || !formula) return;
        
        // Convert column name/letter to standard format
        let columnId = targetColumn;
        
        // If it's a column name (like "Total"), find the matching column
        if (schema) {
            const namedColumn = schema.columns.find(col => 
                col.name.toLowerCase() === targetColumn.toLowerCase()
            );
            if (namedColumn) {
                const colIndex = schema.columns.indexOf(namedColumn);
                columnId = numberToColumn(colIndex);
            }
        }
        
        onColumnFormula(columnId, formula);
        
        // Reset form
        setTargetColumn('');
        setFormula('');
        setIsExpanded(false);
    };

    const handleApplyNamedFormula = () => {
        if (!cellName || !formula) return;
        onNamedCellFormula(cellName, formula);
        
        // Reset form  
        setCellName('');
        setFormula('');
        setIsExpanded(false);
    };

    if (!isExpanded) {
        return (
            <div className="flex items-center gap-2 px-2 py-1 bg-slate-50 border-b border-slate-200">
                <button
                    onClick={() => setIsExpanded(true)}
                    className="flex items-center gap-2 px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                >
                    <Calculator size={14} />
                    Advanced Formulas
                </button>
                <span className="text-xs text-slate-500">
                    Apply formulas to entire columns or use named references
                </span>
            </div>
        );
    }

    return (
        <div className="bg-slate-50 border-b border-slate-200 p-3">
            <div className="flex items-center gap-4 mb-3">
                <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <Calculator size={16} />
                    Advanced Formula Options
                </h3>
                <div className="flex gap-2">
                    <button
                        onClick={() => setFormulaMode('column')}
                        className={`px-3 py-1 text-xs rounded border transition-colors ${
                            formulaMode === 'column' 
                                ? 'bg-blue-600 text-white border-blue-600' 
                                : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                        }`}
                    >
                        <Columns size={12} className="inline mr-1" />
                        Column Formula
                    </button>
                    <button
                        onClick={() => setFormulaMode('named')}
                        className={`px-3 py-1 text-xs rounded border transition-colors ${
                            formulaMode === 'named' 
                                ? 'bg-blue-600 text-white border-blue-600' 
                                : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                        }`}
                    >
                        <Hash size={12} className="inline mr-1" />
                        Named Reference
                    </button>
                </div>
                <button
                    onClick={() => setIsExpanded(false)}
                    className="ml-auto text-slate-400 hover:text-slate-600"
                >
                    ✕
                </button>
            </div>

            {formulaMode === 'column' && (
                <div className="space-y-3">
                    <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                            Target Column (A, B, C... or column name like "Total")
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={targetColumn}
                                onChange={(e) => setTargetColumn(e.target.value)}
                                placeholder="e.g., A, Total, Price"
                                className="flex-1 px-3 py-1 text-sm border border-slate-300 rounded focus:outline-none focus:border-blue-500"
                            />
                            {schema && (
                                <select
                                    value=""
                                    onChange={(e) => setTargetColumn(e.target.value)}
                                    className="px-3 py-1 text-sm border border-slate-300 rounded focus:outline-none"
                                >
                                    <option value="">Select column...</option>
                                    {schema.columns.map((col, index) => (
                                        <option key={index} value={col.name}>
                                            {numberToColumn(index)} - {col.name}
                                        </option>
                                    ))}
                                </select>
                            )}
                        </div>
                    </div>
                    
                    <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                            Formula (will be applied to ALL rows in this column)
                        </label>
                        <input
                            type="text"
                            value={formula}
                            onChange={(e) => setFormula(e.target.value)}
                            placeholder="e.g., =A1*B1, =VLOOKUP(A1,Sheet2!A:B,2,FALSE)"
                            className="w-full px-3 py-1 text-sm border border-slate-300 rounded focus:outline-none focus:border-blue-500 font-mono"
                        />
                    </div>

                    <div className="flex gap-2">
                        <button
                            onClick={handleApplyColumnFormula}
                            disabled={!targetColumn || !formula}
                            className="px-4 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
                        >
                            Apply to Column
                        </button>
                        <div className="text-xs text-amber-600 flex items-center">
                            ⚠️ This will update ALL {schema?.rowCount.toLocaleString()} rows
                        </div>
                    </div>
                </div>
            )}

            {formulaMode === 'named' && (
                <div className="space-y-3">
                    <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                            Cell Name/Reference
                        </label>
                        <input
                            type="text"
                            value={cellName}
                            onChange={(e) => setCellName(e.target.value)}
                            placeholder="e.g., Total, SalesSum, TaxRate"
                            className="w-full px-3 py-1 text-sm border border-slate-300 rounded focus:outline-none focus:border-blue-500"
                        />
                    </div>
                    
                    <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                            Formula
                        </label>
                        <input
                            type="text"
                            value={formula}
                            onChange={(e) => setFormula(e.target.value)}
                            placeholder="e.g., =SUM(A:A), =MAX(B1:B1000)"
                            className="w-full px-3 py-1 text-sm border border-slate-300 rounded focus:outline-none focus:border-blue-500 font-mono"
                        />
                    </div>

                    <div className="flex gap-2">
                        <button
                            onClick={handleApplyNamedFormula}
                            disabled={!cellName || !formula}
                            className="px-4 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
                        >
                            Create Named Reference
                        </button>
                        <div className="text-xs text-slate-500">
                            This creates a reusable named formula
                        </div>
                    </div>
                </div>
            )}

            <div className="mt-3 p-2 bg-blue-50 rounded-md text-xs text-blue-800">
                <strong>Examples:</strong><br/>
                • Column Formula: Target "D" with "=A1*B1" → applies to D1, D2, D3... for all rows<br/>
                • Named Reference: "TotalSales" with "=SUM(D:D)" → creates a reusable calculation
            </div>
        </div>
    );
}