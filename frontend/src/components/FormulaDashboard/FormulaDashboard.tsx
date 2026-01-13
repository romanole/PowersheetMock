import { useState, useEffect } from 'react';
import { X, RefreshCw } from 'lucide-react';
import { FormulaEngine, FormulaEntry } from '../../services/FormulaEngine';

interface FormulaDashboardProps {
    isOpen: boolean;
    onClose: () => void;
    sheetId: string | null;
}

export function FormulaDashboard({ isOpen, onClose, sheetId }: FormulaDashboardProps) {
    const [formulas, setFormulas] = useState<FormulaEntry[]>([]);

    const loadFormulas = () => {
        if (!sheetId) return;
        const allFormulas = FormulaEngine.getInstance().getAllFormulas(sheetId);
        setFormulas(allFormulas);
    };

    useEffect(() => {
        if (isOpen && sheetId) {
            loadFormulas();
        }
    }, [isOpen, sheetId]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-3/4 h-3/4 flex flex-col">
                <div className="flex justify-between items-center p-4 border-b">
                    <h2 className="text-xl font-semibold flex items-center gap-2">
                        <span>ƒx</span> Formula Dashboard
                    </h2>
                    <div className="flex gap-2">
                        <button
                            onClick={loadFormulas}
                            className="p-2 hover:bg-slate-100 rounded-full"
                            title="Refresh"
                        >
                            <RefreshCw size={20} />
                        </button>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-slate-100 rounded-full"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-auto p-4">
                    {formulas.length === 0 ? (
                        <div className="text-center text-slate-500 mt-10">
                            No formulas found in this sheet.
                        </div>
                    ) : (
                        <table className="w-full border-collapse">
                            <thead className="bg-slate-50 sticky top-0">
                                <tr>
                                    <th className="text-left p-3 border-b font-medium text-slate-600">Location</th>
                                    <th className="text-left p-3 border-b font-medium text-slate-600">Formula</th>
                                    <th className="text-left p-3 border-b font-medium text-slate-600">Current Value</th>
                                </tr>
                            </thead>
                            <tbody>
                                {formulas.map((f, i) => (
                                    <tr key={i} className="hover:bg-slate-50 border-b">
                                        <td className="p-3 font-mono text-sm text-blue-600">
                                            R{f.row + 1}C{f.col + 1}
                                        </td>
                                        <td className="p-3 font-mono text-sm bg-slate-50 rounded">
                                            {f.formula}
                                        </td>
                                        <td className="p-3 text-sm">
                                            {String(f.value)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                <div className="p-4 border-t bg-slate-50 text-sm text-slate-500">
                    Total Formulas: {formulas.length}
                </div>
            </div>
        </div>
    );
}
