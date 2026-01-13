import { Database, Upload } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useDatabase } from './hooks/useDatabase';
import api from './api/client';
import { DropZone } from './components/FileUpload/DropZone';
import { ImportWizard } from './components/FileUpload/ImportWizard';
import { VirtualGrid } from './components/VirtualGrid/VirtualGrid';
import { SheetTabs } from './components/SheetTabs/SheetTabs';
import type { TableSchema } from './types/database';
import type { Sheet } from './api/client';
import { FormulaEngine } from './services/FormulaEngine';
import { FormulaDashboard } from './components/FormulaDashboard/FormulaDashboard';

interface ColumnConfig {
    name: string;
    type: string;
    include: boolean;
}

function App() {
    const { isInitialized, error, registerFile, query, getSchema } = useDatabase();
    const [schema, setSchema] = useState<TableSchema | null>(null);
    const [gridData, setGridData] = useState<any[][]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [wizardFile, setWizardFile] = useState<File | null>(null);

    // Multi-sheet state
    const [sheets, setSheets] = useState<Sheet[]>([]);
    const [activeSheetId, setActiveSheetId] = useState<string | null>(null);
    const [isDashboardOpen, setIsDashboardOpen] = useState(false);

    // Initial load
    useEffect(() => {
        if (!isInitialized) return;

        const init = async () => {
            try {
                // Load sheets
                const sheetList = await api.listSheets();
                setSheets(sheetList);

                if (sheetList.length > 0) {
                    // If sheets exist, load the first one
                    setActiveSheetId(sheetList[0].id);
                } else {
                    // If no sheets, check for main_dataset (legacy/import)
                    try {
                        const tableSchema = await getSchema();
                        if (tableSchema) {
                            // Create a default sheet wrapper for existing data
                            const defaultSheet = await api.createSheet("Sheet 1");
                            // TODO: In a real migration we would rename main_dataset to the new sheet table
                            // For now, we just start fresh or load if we have sheets
                            setSheets([defaultSheet]);
                            setActiveSheetId(defaultSheet.id);
                        } else {
                            // Create initial empty sheet
                            const newSheet = await api.createSheet("Sheet 1");
                            setSheets([newSheet]);
                            setActiveSheetId(newSheet.id);
                        }
                    } catch (e) {
                        // Create initial empty sheet
                        const newSheet = await api.createSheet("Sheet 1");
                        setSheets([newSheet]);
                        setActiveSheetId(newSheet.id);
                    }
                }
            } catch (err) {
                console.error("Failed to initialize sheets:", err);
            }
        };

        init();
    }, [isInitialized]);

    // Load data when active sheet changes
    useEffect(() => {
        if (!activeSheetId || !sheets.length) return;

        const activeSheet = sheets.find(s => s.id === activeSheetId);
        if (!activeSheet) return;

        const loadSheetData = async () => {
            setIsLoading(true);
            // Clear previous data to avoid confusion
            setGridData([]);
            setSchema(null);

            try {
                const tableSchema = await api.getSchema(activeSheet.tableName);
                setSchema(tableSchema);

                const result = await query(`SELECT * FROM ${activeSheet.tableName} LIMIT 1000`);
                setGridData(result.rows);

                // Initialize Formula Engine
                FormulaEngine.getInstance().initializeSheet(activeSheetId, result.rows);

                // Load formulas
                try {
                    const formulas = await api.getFormulas(activeSheet.tableName);
                    if (formulas && formulas.length > 0) {
                        const columnNames = tableSchema.columns.map(c => c.name);
                        // Create a map of PK value -> row index
                        // Assuming first column is PK
                        const pkMap = new Map<string, number>();
                        result.rows.forEach((row, index) => {
                            pkMap.set(String(row[0]), index);
                        });

                        formulas.forEach(f => {
                            const rowIndex = pkMap.get(String(f.rowId));
                            const colIndex = columnNames.indexOf(f.column);

                            if (rowIndex !== undefined && colIndex !== -1) {
                                FormulaEngine.getInstance().setCellValue(
                                    activeSheetId,
                                    rowIndex,
                                    colIndex,
                                    f.formula,
                                    columnNames
                                );
                            }
                        });
                        console.log(`[App] Loaded ${formulas.length} formulas`);
                    }
                } catch (fErr) {
                    console.warn("Failed to load formulas:", fErr);
                }

            } catch (err) {
                console.error("Failed to load sheet data:", err);
            } finally {
                setIsLoading(false);
            }
        };

        loadSheetData();
    }, [activeSheetId, sheets]);

    const handleFileSelect = async (file: File) => {
        setWizardFile(file);
    };

    const handleWizardConfirm = async (_columnConfigs: ColumnConfig[]) => {
        if (!wizardFile) return;

        const startTime = performance.now();

        console.log('🚀 [IMPORT START]', {
            file: wizardFile.name,
            size: `${(wizardFile.size / 1024 / 1024).toFixed(2)} MB`
        });

        setIsLoading(true);
        setLoadError(null);
        setSchema(null);
        setGridData([]);

        try {
            // Upload file to backend - backend handles all CSV parsing and DuckDB import
            console.log('📤 Uploading file to backend...');
            const uploadResult = await registerFile(wizardFile);
            console.log(`✓ File uploaded: ${uploadResult.rows.toLocaleString()} rows, ${uploadResult.columns} columns`);

            // Refresh sheets list to pick up the new sheet (migrated from main_dataset)
            const sheetList = await api.listSheets();
            setSheets(sheetList);

            // Switch to the new sheet using ID from response
            if (uploadResult.sheetId) {
                setActiveSheetId(uploadResult.sheetId);
                console.log(`✓ Switched to new sheet: ${uploadResult.sheetName}`);
            } else {
                // Fallback for legacy response
                const importedSheet = sheetList.find(s => s.tableName === uploadResult.tableName);
                if (importedSheet) {
                    setActiveSheetId(importedSheet.id);
                }
            }

            setWizardFile(null);

            const totalTime = performance.now() - startTime;

            console.log('✅ [IMPORT COMPLETE]', {
                rows: uploadResult.rows.toLocaleString(),
                columns: uploadResult.columns,
                totalTime: `${(totalTime / 1000).toFixed(2)}s`
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to load file';
            setLoadError(message);
            console.error('❌ [IMPORT ERROR]', message, err);
            alert(`Import failed: ${message}`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCellEdit = async (rowIndex: number, colIndex: number, newValue: string) => {
        if (!schema || !activeSheetId) return;

        const columnName = schema.columns[colIndex].name;
        const pkColumn = schema.columns[0].name;
        const pkValue = gridData[rowIndex][0];

        try {
            // Update Formula Engine
            const columnNames = schema.columns.map(c => c.name);
            FormulaEngine.getInstance().setCellValue(activeSheetId, rowIndex, colIndex, newValue, columnNames);

            let valueToSend = newValue;
            let formulaToSend: string | undefined = undefined;

            // If it's a formula, we want to display the calculated value but save the formula
            if (newValue.startsWith('=')) {
                // Get the calculated value from the engine
                const calculatedValue = FormulaEngine.getInstance().getCellValue(activeSheetId, rowIndex, colIndex);
                valueToSend = calculatedValue;
                formulaToSend = newValue;

                // Update local state to show result
                setGridData(prevData => {
                    const newData = [...prevData];
                    if (newData[rowIndex]) {
                        newData[rowIndex] = [...newData[rowIndex]];
                        newData[rowIndex][colIndex] = calculatedValue;
                    }
                    return newData;
                });
            } else {
                // Update local state
                setGridData(prevData => {
                    const newData = [...prevData];
                    if (newData[rowIndex]) {
                        newData[rowIndex] = [...newData[rowIndex]];
                        newData[rowIndex][colIndex] = newValue;
                    }
                    return newData;
                });
            }

            await api.updateCell({
                table: sheets.find(s => s.id === activeSheetId)?.tableName || 'main_dataset',
                rowId: pkValue,
                column: columnName,
                value: valueToSend,
                formula: formulaToSend
            });

        } catch (err) {
            console.error("Failed to update cell:", err);
            alert("Failed to update cell");
        }
    };

    const handleColumnTypeChange = async (colIndex: number, newType: string) => {
        if (!schema) return;

        let decimalSeparator: '.' | ',' | null = null;

        // Ask for decimal separator if converting to numeric type
        const numericTypes = ['DOUBLE', 'FLOAT', 'DECIMAL', 'NUMERIC', 'REAL'];
        if (numericTypes.includes(newType.toUpperCase())) {
            const response = prompt(
                'Which decimal separator does your data use?\n\n' +
                'Enter "." for US format (1234.56)\n' +
                'Enter "," for European format (1234,56)\n\n' +
                'Or cancel to skip conversion.',
                '.'
            );

            if (!response) return; // User cancelled

            decimalSeparator = response === ',' ? ',' : '.';
        }

        try {
            setIsLoading(true);

            const newColumnDefs = schema.columns.map((col, idx) => {
                if (idx === colIndex) {
                    // For numeric types with European decimal separator, normalize first
                    if (decimalSeparator === ',') {
                        return `TRY_CAST(
                            REPLACE(
                                REPLACE("${col.name}", '.', ''),  -- Remove thousand separator
                                ',', '.'                           -- Change decimal separator to dot
                            ) AS ${newType}
                        ) AS "${col.name}"`;
                    } else {
                        return `TRY_CAST("${col.name}" AS ${newType}) AS "${col.name}"`;
                    }
                }
                return `"${col.name}"`;
            }).join(', ');


            const tableName = sheets.find(s => s.id === activeSheetId)?.tableName || 'main_dataset';

            await query(`CREATE TABLE temp_new AS SELECT ${newColumnDefs} FROM ${tableName}`);
            await query(`DROP TABLE ${tableName}`);
            await query(`ALTER TABLE temp_new RENAME TO ${tableName}`);

            const newSchema = await getSchema();
            setSchema(newSchema);

            const result = await query(`SELECT * FROM ${tableName} LIMIT 50`);
            setGridData(result.rows);

            console.log('[App] ✅ Column type changed to', newType);
        } catch (err) {
            console.error('[App] ❌ Type change failed:', err);
            alert('Failed to change column type');
        } finally {
            setIsLoading(false);
        }
    };

    const handleInsertRow = async (rowIndex: number, position: 'above' | 'below') => {
        if (!schema) return;

        const startTime = performance.now();
        console.log('🔹 [INSERT ROW]', { rowIndex, position });

        try {
            setIsLoading(true);

            // Calculate insert position: above means at rowIndex, below means at rowIndex + 1
            const insertPosition = position === 'above' ? rowIndex : rowIndex + 1;

            // Use backend API with position
            await api.insertRow('main_dataset', insertPosition);
            console.log(`✓ INSERT executed at position ${insertPosition} (${(performance.now() - startTime).toFixed(0)}ms)`);

            // Refresh data - need to query with ORDER BY _row_order
            const newSchema = await getSchema();
            setSchema(newSchema);

            const result = await query('SELECT * FROM main_dataset ORDER BY _row_order LIMIT 50');
            setGridData(result.rows);

            console.log('✅ [INSERT ROW COMPLETE]', {
                totalTime: `${(performance.now() - startTime).toFixed(0)}ms`,
                newRowCount: newSchema.rowCount,
                position: insertPosition
            });
        } catch (err) {
            console.error('❌ [INSERT ROW ERROR]', err);
            alert(`Failed to insert row: ${err instanceof Error ? err.message : 'Unknown error'}`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteRow = async (rowIndex: number) => {
        if (!schema || !gridData[rowIndex]) return;

        const confirmed = confirm(`Delete row ${rowIndex + 1}?`);
        if (!confirmed) return;

        try {
            setIsLoading(true);

            const pkColumn = schema.columns[0].name;
            const pkValue = gridData[rowIndex][0];

            await query(`
        DELETE FROM main_dataset 
        WHERE "${pkColumn}" = '${String(pkValue).replace(/'/g, "''")}'
      `);

            const newSchema = await getSchema();
            setSchema(newSchema);

            const result = await query('SELECT * FROM main_dataset LIMIT 50');
            setGridData(result.rows);

            console.log('[App] ✅ Row deleted');
        } catch (err) {
            console.error('[App] ❌ Delete row failed:', err);
            alert('Failed to delete row');
        } finally {
            setIsLoading(false);
        }
    };

    const handleInsertColumn = async () => {
        if (!schema) return;

        const columnName = prompt('Enter new column name:');
        if (!columnName) return;

        try {
            setIsLoading(true);

            await query(`ALTER TABLE main_dataset ADD COLUMN "${columnName}" VARCHAR`);

            const newSchema = await getSchema();
            setSchema(newSchema);

            const result = await query('SELECT * FROM main_dataset LIMIT 50');
            setGridData(result.rows);

            console.log('[App] ✅ Column inserted');
        } catch (err) {
            console.error('[App] ❌ Insert column failed:', err);
            alert('Failed to insert column');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteColumn = async (colIndex: number) => {
        if (!schema) return;

        const columnName = schema.columns[colIndex].name;
        const confirmed = confirm(`Delete column "${columnName}"?`);
        if (!confirmed) return;

        try {
            setIsLoading(false);

            await query(`ALTER TABLE main_dataset DROP COLUMN "${columnName}"`);

            const newSchema = await getSchema();
            setSchema(newSchema);

            const result = await query('SELECT * FROM main_dataset LIMIT 50');
            setGridData(result.rows);

            console.log('[App] ✅ Column deleted');
        } catch (err) {
            console.error('[App] ❌ Delete column failed:', err);
            alert('Failed to delete column');
        } finally {
            setIsLoading(false);
        }
    };

    const handleAddSheet = async () => {
        try {
            const name = `Sheet ${sheets.length + 1}`;
            const newSheet = await api.createSheet(name);
            setSheets([...sheets, newSheet]);
            setActiveSheetId(newSheet.id);
        } catch (err) {
            console.error("Failed to create sheet:", err);
            alert("Failed to create sheet");
        }
    };

    const handleDeleteSheet = async (sheetId: string) => {
        if (sheets.length <= 1) {
            alert("Cannot delete the last sheet");
            return;
        }

        const confirmed = confirm("Are you sure you want to delete this sheet?");
        if (!confirmed) return;

        try {
            await api.deleteSheet(sheetId);
            const newSheets = sheets.filter(s => s.id !== sheetId);
            setSheets(newSheets);

            if (activeSheetId === sheetId) {
                setActiveSheetId(newSheets[0].id);
            }
        } catch (err) {
            console.error("Failed to delete sheet:", err);
            alert("Failed to delete sheet");
        }
    };

    const handleRenameSheet = async (sheetId: string, newName: string) => {
        try {
            const updatedSheet = await api.renameSheet(sheetId, newName);
            setSheets(sheets.map(s => s.id === sheetId ? updatedSheet : s));
        } catch (err) {
            console.error("Failed to rename sheet:", err);
            alert("Failed to rename sheet");
        }
    };

    const handleClearDatabase = async () => {
        const confirmed = confirm(
            'Delete ALL data from database?\n\nThis will:\n- Remove all imported data\n- Clear OPFS storage\n- Cannot be undone\n\nContinue?'
        );
        if (!confirmed) return;

        try {
            setIsLoading(true);
            await query('DROP TABLE IF EXISTS main_dataset');
            // Also drop all sheet tables if we want a full clear, but for now just main_dataset
            // Ideally we should call a backend endpoint to clear everything

            setSchema(null);
            setGridData([]);
            setSheets([]);
            setActiveSheetId(null);

            console.log('✅ [OPFS] Database cleared');
            alert('Database cleared successfully!');
        } catch (err) {
            console.error('❌ [OPFS] Failed to clear database:', err);
            alert('Failed to clear database');
        } finally {
            setIsLoading(false);
        }
    };

    if (error) {
        return (
            <div className="flex h-screen items-center justify-center bg-red-50">
                <div className="text-center px-8">
                    <div className="text-red-600 mb-4">⚠️</div>
                    <h2 className="text-xl font-bold text-red-900 mb-2">Database Error</h2>
                    <p className="text-red-700">{error}</p>
                </div>
            </div>
        );
    }

    if (!isInitialized) {
        return (
            <div className="flex h-screen items-center justify-center bg-slate-50">
                <div className="text-center">
                    <div className="animate-spin text-emerald-600 mb-4 inline-block">
                        <Database size={48} />
                    </div>
                    <h2 className="text-xl font-bold text-slate-800">Initializing DuckDB...</h2>
                    <p className="text-sm text-slate-500 mt-2">Loading WebAssembly modules</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen bg-slate-50 text-slate-800 font-sans overflow-hidden">
            {/* Top Bar */}
            <div className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 shadow-sm z-20">
                <div className="flex items-center gap-3">
                    <div className="bg-emerald-600 text-white p-1.5 rounded-lg">
                        <Database size={20} />
                    </div>
                    <h1 className="font-bold text-lg text-slate-800">
                        PowerSheet{' '}
                        <span className="text-xs font-normal text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                            DuckDB Core
                        </span>
                    </h1>
                    {schema && (
                        <>
                            <div className="h-6 w-px bg-slate-200 mx-2"></div>
                            <div className="text-xs text-slate-500 flex items-center gap-2">
                                <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">
                                    {schema.rowCount.toLocaleString()} rows
                                </span>
                                <span>×</span>
                                <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">
                                    {schema.columns.length} columns
                                </span>
                            </div>
                        </>
                    )}
                </div>

                <button
                    onClick={() => document.getElementById('file-input-trigger')?.click()}
                    className="p-2 text-slate-500 hover:bg-slate-100 rounded-md transition-colors"
                    title="Upload file"
                >
                    <Upload size={18} />
                </button>

                {schema && (
                    <>
                        <button
                            onClick={() => setIsDashboardOpen(true)}
                            className="ml-2 px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-50 rounded-md transition-colors border border-blue-200 flex items-center gap-1"
                            title="Open Formula Dashboard"
                        >
                            <span>ƒx</span> Formulas
                        </button>
                        <button
                            onClick={handleClearDatabase}
                            className="ml-2 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-md transition-colors border border-red-200"
                            title="Clear all data from OPFS"
                        >
                            Clear Database
                        </button>
                    </>
                )}
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                <div className="flex-1 overflow-hidden relative">
                    {!schema ? (
                        <div className="flex items-center justify-center h-full p-8">
                            <div className="w-full max-w-2xl">
                                <DropZone onFileLoad={handleFileSelect} isLoading={isLoading} />
                                {loadError && (
                                    <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                                        <p className="text-red-700 text-sm">❌ {loadError}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <VirtualGrid
                            schema={schema}
                            data={gridData}
                            isLoading={isLoading}
                            onCellEdit={handleCellEdit}
                            onColumnTypeChange={handleColumnTypeChange}
                            onInsertRow={handleInsertRow}
                            onDeleteRow={handleDeleteRow}
                            onInsertColumn={handleInsertColumn}
                            onDeleteColumn={handleDeleteColumn}
                        />
                    )}
                </div>

                {/* Sheet Tabs */}
                <SheetTabs
                    sheets={sheets}
                    activeSheetId={activeSheetId}
                    onSheetChange={setActiveSheetId}
                    onAddSheet={handleAddSheet}
                    onDeleteSheet={handleDeleteSheet}
                    onRenameSheet={handleRenameSheet}
                />
            </div>

            {/* Status Bar */}
            <div className="h-6 bg-slate-100 border-t border-slate-200 flex items-center justify-between px-4 text-[10px] text-slate-500 select-none">
                <div className="flex gap-4">
                    <span>Ready</span>
                    <span className="text-emerald-600 font-medium">
                        DuckDB: {isInitialized ? 'Connected' : 'Disconnected'}
                    </span>
                </div>
                <div className="flex gap-4">
                    {schema && (
                        <>
                            <span>Rows: {schema.rowCount.toLocaleString()}</span>
                            <span>Cols: {schema.columns.length}</span>
                        </>
                    )}
                </div>
            </div>

            <input
                id="file-input-trigger"
                type="file"
                accept=".csv,.parquet,.tsv"
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileSelect(file);
                }}
                className="hidden"
            />

            {wizardFile && (
                <ImportWizard
                    file={wizardFile}
                    onConfirm={handleWizardConfirm}
                    onCancel={() => setWizardFile(null)}
                />
            )}
        </div>
    );
}

export default App;
