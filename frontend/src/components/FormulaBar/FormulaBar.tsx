import { useState, useRef, useEffect } from 'react';
import { Calculator, FunctionSquare } from 'lucide-react';
import type { ExcelCellAddress, ExcelRange } from '../../lib/excel-coordinates';

interface FormulaBarProps {
    selectedCell?: ExcelCellAddress | null;
    selectedRange?: ExcelRange | null;
    formula: string;
    onFormulaChange: (formula: string) => void;
    onFormulaSubmit: (formula: string) => void;
    isReadOnly?: boolean;
}

export function FormulaBar({
    selectedCell,
    selectedRange,
    formula,
    onFormulaChange,
    onFormulaSubmit,
    isReadOnly = false
}: FormulaBarProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [editingFormula, setEditingFormula] = useState(formula);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!isEditing) {
            setEditingFormula(formula);
        }
    }, [formula, isEditing]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSubmit();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            handleCancel();
        }
    };

    const handleSubmit = () => {
        onFormulaSubmit(editingFormula);
        setIsEditing(false);
    };

    const handleCancel = () => {
        setEditingFormula(formula);
        setIsEditing(false);
    };

    const handleClick = () => {
        if (!isReadOnly) {
            setIsEditing(true);
            setTimeout(() => {
                inputRef.current?.focus();
                inputRef.current?.select();
            }, 0);
        }
    };

    const displayAddress = () => {
        if (selectedRange) {
            return selectedRange.display;
        } else if (selectedCell) {
            return selectedCell.display;
        }
        return '';
    };

    return (
        <div className="h-8 bg-white border-b border-slate-200 flex items-center px-2 gap-2 text-sm z-10">
            {/* Name Box - Shows selected cell/range address */}
            <div className="flex items-center gap-2">
                <div className="min-w-[80px] h-6 px-2 border border-slate-300 rounded text-center text-xs font-mono bg-slate-50 flex items-center justify-center">
                    {displayAddress() || 'A1'}
                </div>
                
                {/* Function button */}
                <button 
                    className="w-6 h-6 flex items-center justify-center text-slate-500 hover:bg-slate-100 rounded border border-slate-300"
                    title="Insert Function"
                >
                    <FunctionSquare size={14} />
                </button>
            </div>

            {/* Separator */}
            <div className="h-4 w-px bg-slate-300"></div>

            {/* Formula Input */}
            <div className="flex-1 flex items-center">
                {isEditing ? (
                    <input 
                        ref={inputRef}
                        type="text" 
                        value={editingFormula}
                        onChange={(e) => {
                            setEditingFormula(e.target.value);
                            onFormulaChange(e.target.value);
                        }}
                        onKeyDown={handleKeyDown}
                        onBlur={handleSubmit}
                        className="w-full h-6 px-2 outline-none text-slate-700 font-mono text-sm border border-blue-500 rounded"
                        placeholder="Enter formula or value..."
                    />
                ) : (
                    <div 
                        onClick={handleClick}
                        className="w-full h-6 px-2 flex items-center text-slate-700 font-mono text-sm cursor-text hover:bg-slate-50 rounded"
                        title="Click to edit or press F2"
                    >
                        {formula || (
                            <span className="text-slate-400">
                                {selectedCell ? `Enter formula for ${selectedCell.display}...` : 'Select a cell to edit'}
                            </span>
                        )}
                    </div>
                )}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1">
                {isEditing && (
                    <>
                        <button 
                            onClick={handleCancel}
                            className="w-6 h-6 flex items-center justify-center text-slate-500 hover:bg-red-100 rounded text-sm font-bold"
                            title="Cancel (Esc)"
                        >
                            ✕
                        </button>
                        <button 
                            onClick={handleSubmit}
                            className="w-6 h-6 flex items-center justify-center text-slate-500 hover:bg-green-100 rounded text-sm font-bold"
                            title="Accept (Enter)"
                        >
                            ✓
                        </button>
                    </>
                )}
                
                <button 
                    className="w-6 h-6 flex items-center justify-center text-slate-500 hover:bg-slate-100 rounded"
                    title="Function wizard"
                >
                    <Calculator size={14} />
                </button>
            </div>
        </div>
    );
}