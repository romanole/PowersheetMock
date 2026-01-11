import { useState, useEffect } from 'react';
import { ChevronRight, ChevronLeft, X, Check, Database } from 'lucide-react';

interface ColumnConfig {
    name: string;
    type: 'VARCHAR' | 'INTEGER' | 'DOUBLE' | 'BOOLEAN' | 'DATE' | 'TIMESTAMP';
    include: boolean;
    detectedType: string;
}

interface ImportWizardProps {
    file: File;
    onConfirm: (columnConfigs: ColumnConfig[]) => Promise<void>;
    onCancel: () => void;
}

const DATA_TYPES = [
    { value: 'VARCHAR', label: 'Text' },
    { value: 'INTEGER', label: 'Integer' },
    { value: 'DOUBLE', label: 'Decimal' },
    { value: 'BOOLEAN', label: 'Boolean' },
    { value: 'DATE', label: 'Date' },
    { value: 'TIMESTAMP', label: 'Timestamp' },
] as const;

export function ImportWizard({ file, onConfirm, onCancel }: ImportWizardProps) {
    const [step, setStep] = useState<'preview' | 'configure' | 'confirm'>('preview');
    const [previewData, setPreviewData] = useState<string[][]>([]);
    const [columnConfigs, setColumnConfigs] = useState<ColumnConfig[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [importing, setImporting] = useState(false);

    // Parse CSV preview
    useEffect(() => {
        const reader = new FileReader();

        reader.onload = (e) => {
            const text = e.target?.result as string;
            const lines = text.split('\n').filter(line => line.trim()).slice(0, 6); // Header + 5 rows

            // Auto-detect delimiter (comma or semicolon)
            const firstLine = lines[0] || '';
            const commaCount = (firstLine.match(/,/g) || []).length;
            const semicolonCount = (firstLine.match(/;/g) || []).length;
            const delimiter = semicolonCount > commaCount ? ';' : ',';

            console.log(`[Import Wizard] Detected delimiter: "${delimiter}" (commas: ${commaCount}, semicolons: ${semicolonCount})`);

            const rows = lines.map(line => {
                // Parse with detected delimiter and remove quotes
                return line.split(delimiter).map(cell => cell.trim().replace(/^"|"$/g, ''));
            });

            setPreviewData(rows);

            // Initialize column configs from header
            if (rows.length > 0) {
                const headers = rows[0];
                const dataRows = rows.slice(1);

                const configs: ColumnConfig[] = headers.map((header, idx) => {
                    // Detect type from first few values
                    const detectedType = detectColumnType(dataRows.map(row => row[idx]));

                    return {
                        name: header || `Column_${idx + 1}`,
                        type: detectedType as any,
                        include: true,
                        detectedType,
                    };
                });

                setColumnConfigs(configs);
            }

            setIsLoading(false);
        };

        reader.readAsText(file);
    }, [file]);

    const detectColumnType = (values: string[]): string => {
        const samples = values.filter(v => v && v.trim()).slice(0, 5);

        if (samples.length === 0) return 'VARCHAR';

        // Check if all are integers
        if (samples.every(v => /^-?\d+$/.test(v))) return 'INTEGER';

        // Check if all are numbers
        if (samples.every(v => /^-?\d*\.?\d+$/.test(v))) return 'DOUBLE';

        // Check if all are booleans
        if (samples.every(v => /^(true|false|yes|no|1|0)$/i.test(v))) return 'BOOLEAN';

        // Check if all are dates
        if (samples.every(v => !isNaN(Date.parse(v)))) return 'DATE';

        return 'VARCHAR';
    };

    const handleTypeChange = (index: number, type: ColumnConfig['type']) => {
        setColumnConfigs(prev => {
            const updated = [...prev];
            updated[index] = { ...updated[index], type };
            return updated;
        });
    };

    const handleIncludeToggle = (index: number) => {
        setColumnConfigs(prev => {
            const updated = [...prev];
            updated[index] = { ...updated[index], include: !updated[index].include };
            return updated;
        });
    };

    const handleConfirm = async () => {
        setImporting(true);
        try {
            await onConfirm(columnConfigs);
        } finally {
            setImporting(false);
        }
    };

    if (isLoading) {
        return (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-white rounded-xl p-8">
                    <div className="animate-spin text-emerald-600 mb-4">
                        <Database size={32} />
                    </div>
                    <p className="text-slate-700">Analyzing file...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="p-6 border-b border-slate-200 flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800">Import CSV</h2>
                        <p className="text-sm text-slate-500 mt-1">{file.name}</p>
                    </div>
                    <button
                        onClick={onCancel}
                        className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                        <X size={20} className="text-slate-500" />
                    </button>
                </div>

                {/* Steps Indicator */}
                <div className="px-6 py-4 border-b border-slate-200">
                    <div className="flex items-center justify-center gap-2">
                        <Step number={1} label="Preview" active={step === 'preview'} completed={step !== 'preview'} />
                        <ChevronRight size={16} className="text-slate-300" />
                        <Step number={2} label="Configure" active={step === 'configure'} completed={step === 'confirm'} />
                        <ChevronRight size={16} className="text-slate-300" />
                        <Step number={3} label="Confirm" active={step === 'confirm'} completed={false} />
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-6">
                    {step === 'preview' && (
                        <div>
                            <h3 className="font-semibold text-slate-800 mb-4">Data Preview</h3>
                            <div className="border border-slate-200 rounded-lg overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead className="bg-slate-50">
                                            <tr>
                                                {previewData[0]?.map((header, idx) => (
                                                    <th key={idx} className="px-4 py-2 text-left font-semibold text-slate-700 border-b border-slate-200">
                                                        {header || `Column ${idx + 1}`}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {previewData.slice(1).map((row, rowIdx) => (
                                                <tr key={rowIdx} className="border-b border-slate-100 hover:bg-slate-50">
                                                    {row.map((cell, cellIdx) => (
                                                        <td key={cellIdx} className="px-4 py-2 text-slate-600">
                                                            {cell}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            <p className="text-xs text-slate-500 mt-3">
                                Showing first 5 rows • {columnConfigs.length} columns detected
                            </p>
                        </div>
                    )}

                    {step === 'configure' && (
                        <div>
                            <h3 className="font-semibold text-slate-800 mb-2">Configure Columns</h3>
                            <p className="text-sm text-slate-600 mb-4">
                                Select data types and choose which columns to import
                            </p>

                            <div className="space-y-2">
                                {columnConfigs.map((config, idx) => (
                                    <div
                                        key={idx}
                                        className={`
                      flex items-center gap-4 p-4 border rounded-lg transition-all
                      ${config.include ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50 opacity-60'}
                    `}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={config.include}
                                            onChange={() => handleIncludeToggle(idx)}
                                            className="w-5 h-5 text-emerald-600 rounded focus:ring-emerald-500"
                                        />

                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium text-slate-800 truncate">{config.name}</p>
                                            <p className="text-xs text-slate-500">Auto-detected: {config.detectedType}</p>
                                        </div>

                                        <select
                                            value={config.type}
                                            onChange={(e) => handleTypeChange(idx, e.target.value as ColumnConfig['type'])}
                                            disabled={!config.include}
                                            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {DATA_TYPES.map(type => (
                                                <option key={type.value} value={type.value}>
                                                    {type.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {step === 'confirm' && (
                        <div>
                            <h3 className="font-semibold text-slate-800 mb-4">Review Import Settings</h3>

                            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 mb-6">
                                <div className="flex items-start gap-3">
                                    <Check className="text-emerald-600 flex-shrink-0 mt-0.5" size={20} />
                                    <div>
                                        <p className="font-medium text-emerald-900 mb-1">Ready to import</p>
                                        <p className="text-sm text-emerald-700">
                                            {columnConfigs.filter(c => c.include).length} of {columnConfigs.length} columns will be imported
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Selected Columns</h4>
                                {columnConfigs.filter(c => c.include).map((config, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                                        <span className="font-medium text-slate-800">{config.name}</span>
                                        <span className="text-sm text-slate-600 bg-white px-3 py-1 rounded-full border border-slate-200">
                                            {DATA_TYPES.find(t => t.value === config.type)?.label}
                                        </span>
                                    </div>
                                ))}
                            </div>

                            {columnConfigs.some(c => !c.include) && (
                                <div className="mt-6">
                                    <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Excluded Columns</h4>
                                    <div className="flex flex-wrap gap-2">
                                        {columnConfigs.filter(c => !c.include).map((config, idx) => (
                                            <span key={idx} className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded">
                                                {config.name}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-slate-200 flex items-center justify-between">
                    <button
                        onClick={() => {
                            if (step === 'configure') setStep('preview');
                            else if (step === 'confirm') setStep('configure');
                        }}
                        disabled={step === 'preview' || importing}
                        className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        <ChevronLeft size={16} />
                        Back
                    </button>

                    <div className="flex gap-3">
                        <button
                            onClick={onCancel}
                            disabled={importing}
                            className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors disabled:opacity-50"
                        >
                            Cancel
                        </button>

                        {step !== 'confirm' ? (
                            <button
                                onClick={() => {
                                    if (step === 'preview') setStep('configure');
                                    else if (step === 'configure') setStep('confirm');
                                }}
                                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                            >
                                Next
                                <ChevronRight size={16} />
                            </button>
                        ) : (
                            <button
                                onClick={handleConfirm}
                                disabled={importing || columnConfigs.filter(c => c.include).length === 0}
                                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {importing ? (
                                    <>
                                        <div className="animate-spin">⏳</div>
                                        Importing...
                                    </>
                                ) : (
                                    <>
                                        <Database size={16} />
                                        Import Data
                                    </>
                                )}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function Step({ number, label, active, completed }: { number: number; label: string; active: boolean; completed: boolean }) {
    return (
        <div className="flex items-center gap-2">
            <div className={`
        w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm transition-all
        ${active ? 'bg-emerald-600 text-white' : completed ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}
      `}>
                {completed ? <Check size={16} /> : number}
            </div>
            <span className={`text-sm font-medium ${active ? 'text-slate-800' : 'text-slate-500'}`}>
                {label}
            </span>
        </div>
    );
}
