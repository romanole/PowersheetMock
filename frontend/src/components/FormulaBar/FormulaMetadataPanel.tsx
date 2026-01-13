import { useState, useMemo } from 'react';
import { 
    FileSpreadsheet, 
    Search, 
    Download, 
    Upload, 
    Trash2, 
    AlertCircle, 
    CheckCircle, 
    Clock,
    Filter,
    X
} from 'lucide-react';
import type { FormulaMetadata } from '../../types/formula-metadata';
import { useFormulaMetadataStore } from '../../store/formulaMetadataStore';

interface FormulaMetadataPanelProps {
    isOpen: boolean;
    onClose: () => void;
    currentSheetId?: string;
}

export function FormulaMetadataPanel({ isOpen, onClose, currentSheetId }: FormulaMetadataPanelProps) {
    const {
        formulas,
        removeFormula,
        exportMetadata,
        importMetadata,
        getFormulasForSheet
    } = useFormulaMetadataStore();

    const [searchTerm, setSearchTerm] = useState('');
    const [filterSheet, setFilterSheet] = useState<'all' | 'current'>('all');
    const [filterType, setFilterType] = useState<'all' | 'cell' | 'column' | 'named'>('all');
    const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'error' | 'deprecated'>('all');

    // Get unique sheets
    const sheets = useMemo(() => {
        const sheetMap = new Map<string, string>();
        formulas.forEach(f => {
            if (!sheetMap.has(f.sheetId)) {
                sheetMap.set(f.sheetId, f.sheetName);
            }
        });
        return Array.from(sheetMap.entries()).map(([id, name]) => ({ id, name }));
    }, [formulas]);

    // Filter formulas
    const filteredFormulas = useMemo(() => {
        let filtered = formulas;

        // Filter by sheet
        if (filterSheet === 'current' && currentSheetId) {
            filtered = filtered.filter(f => f.sheetId === currentSheetId);
        }

        // Filter by type
        if (filterType !== 'all') {
            filtered = filtered.filter(f => f.formulaType === filterType);
        }

        // Filter by status
        if (filterStatus !== 'all') {
            filtered = filtered.filter(f => f.status === filterStatus);
        }

        // Search
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            filtered = filtered.filter(f => 
                f.formula.toLowerCase().includes(term) ||
                f.sheetName.toLowerCase().includes(term) ||
                (f.cellAddress && f.cellAddress.toLowerCase().includes(term)) ||
                (f.columnId && f.columnId.toLowerCase().includes(term)) ||
                (f.description && f.description.toLowerCase().includes(term))
            );
        }

        return filtered.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    }, [formulas, searchTerm, filterSheet, filterType, filterStatus, currentSheetId]);

    const handleExport = () => {
        try {
            const data = exportMetadata();
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `formula-metadata-${new Date().toISOString().split('T')[0]}.json`;
            link.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            alert('Failed to export metadata');
        }
    };

    const handleImport = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const data = e.target?.result as string;
                        importMetadata(data);
                        alert('Metadata imported successfully');
                    } catch (error) {
                        alert('Failed to import metadata: Invalid format');
                    }
                };
                reader.readAsText(file);
            }
        };
        input.click();
    };

    const getStatusIcon = (status: FormulaMetadata['status']) => {
        switch (status) {
            case 'active': return <CheckCircle size={16} className="text-green-500" />;
            case 'error': return <AlertCircle size={16} className="text-red-500" />;
            case 'deprecated': return <Clock size={16} className="text-yellow-500" />;
        }
    };

    const getTypeColor = (type: FormulaMetadata['formulaType']) => {
        switch (type) {
            case 'cell': return 'bg-blue-100 text-blue-800';
            case 'column': return 'bg-purple-100 text-purple-800';
            case 'named': return 'bg-green-100 text-green-800';
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex">
            {/* Backdrop */}
            <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose} />
            
            {/* Panel */}
            <div className="relative ml-auto w-2/3 max-w-4xl bg-white shadow-2xl flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-200">
                    <div className="flex items-center gap-3">
                        <FileSpreadsheet size={20} className="text-blue-600" />
                        <h2 className="text-lg font-semibold text-slate-800">Formula Metadata</h2>
                        <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded-full text-xs">
                            {filteredFormulas.length} formulas
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleExport}
                            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                            <Download size={14} />
                            Export
                        </button>
                        <button
                            onClick={handleImport}
                            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700"
                        >
                            <Upload size={14} />
                            Import
                        </button>
                        <button
                            onClick={onClose}
                            className="p-2 text-slate-400 hover:text-slate-600 rounded"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Filters */}
                <div className="p-4 border-b border-slate-200 space-y-3">
                    {/* Search */}
                    <div className="relative">
                        <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Search formulas, cells, or descriptions..."
                            className="w-full pl-10 pr-4 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:border-blue-500"
                        />
                    </div>

                    {/* Filter buttons */}
                    <div className="flex flex-wrap gap-2">
                        <div className="flex items-center gap-1">
                            <Filter size={14} className="text-slate-500" />
                            <span className="text-xs text-slate-500">Filters:</span>
                        </div>
                        
                        <select
                            value={filterSheet}
                            onChange={(e) => setFilterSheet(e.target.value as any)}
                            className="px-2 py-1 text-xs border border-slate-300 rounded"
                        >
                            <option value="all">All Sheets</option>
                            <option value="current">Current Sheet</option>
                        </select>

                        <select
                            value={filterType}
                            onChange={(e) => setFilterType(e.target.value as any)}
                            className="px-2 py-1 text-xs border border-slate-300 rounded"
                        >
                            <option value="all">All Types</option>
                            <option value="cell">Cell</option>
                            <option value="column">Column</option>
                            <option value="named">Named</option>
                        </select>

                        <select
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value as any)}
                            className="px-2 py-1 text-xs border border-slate-300 rounded"
                        >
                            <option value="all">All Status</option>
                            <option value="active">Active</option>
                            <option value="error">Error</option>
                            <option value="deprecated">Deprecated</option>
                        </select>
                    </div>
                </div>

                {/* Formula List */}
                <div className="flex-1 overflow-auto">
                    {filteredFormulas.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full p-8 text-slate-500">
                            <FileSpreadsheet size={48} className="mb-4 text-slate-300" />
                            <p className="text-lg font-medium">No formulas found</p>
                            <p className="text-sm">Start by creating formulas in your sheets</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-200">
                            {filteredFormulas.map((formula) => (
                                <div key={formula.id} className="p-4 hover:bg-slate-50">
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1 min-w-0">
                                            {/* Header */}
                                            <div className="flex items-center gap-3 mb-2">
                                                {getStatusIcon(formula.status)}
                                                <span className={`px-2 py-1 rounded text-xs font-medium ${getTypeColor(formula.formulaType)}`}>
                                                    {formula.formulaType}
                                                </span>
                                                <span className="text-sm font-medium text-slate-700">
                                                    {formula.sheetName}
                                                </span>
                                                <span className="text-sm text-slate-500">
                                                    {formula.cellAddress || formula.columnId || 'Named'}
                                                </span>
                                            </div>

                                            {/* Formula */}
                                            <div className="mb-2">
                                                <code className="bg-slate-100 text-slate-800 px-2 py-1 rounded text-sm font-mono">
                                                    {formula.formula}
                                                </code>
                                            </div>

                                            {/* Description */}
                                            {formula.description && (
                                                <p className="text-sm text-slate-600 mb-2">
                                                    {formula.description}
                                                </p>
                                            )}

                                            {/* Error message */}
                                            {formula.status === 'error' && formula.errorMessage && (
                                                <div className="flex items-center gap-2 text-red-600 text-sm">
                                                    <AlertCircle size={14} />
                                                    {formula.errorMessage}
                                                </div>
                                            )}

                                            {/* Timestamps */}
                                            <div className="flex items-center gap-4 text-xs text-slate-500">
                                                <span>Created: {formula.createdAt.toLocaleDateString()} {formula.createdAt.toLocaleTimeString()}</span>
                                                <span>Updated: {formula.updatedAt.toLocaleDateString()} {formula.updatedAt.toLocaleTimeString()}</span>
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div className="flex items-center gap-1 ml-4">
                                            <button
                                                onClick={() => removeFormula(formula.id)}
                                                className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"
                                                title="Remove formula"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}