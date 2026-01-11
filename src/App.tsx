import { Database, Upload } from 'lucide-react';
import { useState } from 'react';
import { useDatabase } from './hooks/useDatabase';
import { DropZone } from './components/FileUpload/DropZone';
import { ImportWizard } from './components/FileUpload/ImportWizard';
import { VirtualGrid } from './components/VirtualGrid/VirtualGrid';
import type { TableSchema } from './types/database';

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

    const handleFileSelect = async (file: File) => {
        setWizardFile(file);
    };

    const handleWizardConfirm = async (columnConfigs: ColumnConfig[]) => {
        if (!wizardFile) return;

        setIsLoading(true);
        setLoadError(null);
        setSchema(null);
        setGridData([]);

        try {
            const includedColumns = columnConfigs.filter(c => c.include);

            if (includedColumns.length === 0) {
                throw new Error('At least one column must be selected');
            }

            console.log('[App] Starting import...');

            await registerFile(wizardFile);

            try {
                await query('DROP TABLE IF EXISTS main_dataset');
                await query('DROP TABLE IF EXISTS temp_import');
            } catch (e) {
                // Ignore
            }

            await query(`CREATE TABLE temp_import AS SELECT * FROM read_csv_auto('${wizardFile.name}')`);

            const columnDefs = includedColumns.map(c =>
                `TRY_CAST("${c.name}" AS ${c.type}) AS "${c.name}"`
            ).join(', ');

            await query(`CREATE TABLE main_dataset AS SELECT ${columnDefs} FROM temp_import`);
            await query('DROP TABLE temp_import');

            const tableSchema = await getSchema();
            setSchema(tableSchema);

            const result = await query('SELECT * FROM main_dataset LIMIT 50');
            setGridData(result.rows);

            setWizardFile(null);
            console.log('[App] ✅ Import completed:', tableSchema.rowCount, 'rows');
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to load file';
            setLoadError(message);
            console.error('[App] ❌ Import error:', message);
            alert(`Import failed: ${message}`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCellEdit = async (rowIndex: number, colIndex: number, newValue: string) => {
        if (!schema) return;

        const columnName = schema.columns[colIndex].name;
        const pkColumn = schema.columns[0].name;
        const pkValue = gridData[rowIndex][0];

        try {
            await query(`
        UPDATE main_dataset 
        SET "${columnName}" = '${newValue.replace(/'/g, "''")}'  
        WHERE "${pkColumn}" = '${String(pkValue).replace(/'/g, "''")}'
      `);

            const newData = [...gridData];
            newData[rowIndex][colIndex] = newValue;
            setGridData(newData);

            console.log('[App] ✅ Cell updated');
        } catch (err) {
            console.error('[App] ❌ Cell update failed:', err);
            alert('Failed to update cell');
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

            await query('CREATE TABLE temp_new AS SELECT ' + newColumnDefs + ' FROM main_dataset');
            await query('DROP TABLE main_dataset');
            await query('ALTER TABLE temp_new RENAME TO main_dataset');

            const newSchema = await getSchema();
            setSchema(newSchema);

            const result = await query('SELECT * FROM main_dataset LIMIT 50');
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

        try {
            setIsLoading(true);

            const columns = schema.columns.map(col => `"${col.name}"`).join(', ');
            const values = schema.columns.map(() => 'NULL').join(', ');

            await query(`INSERT INTO main_dataset (${columns}) VALUES (${values})`);

            const newSchema = await getSchema();
            setSchema(newSchema);

            const result = await query('SELECT * FROM main_dataset LIMIT 50');
            setGridData(result.rows);

            console.log('[App] ✅ Row inserted', position, 'row', rowIndex + 1);
        } catch (err) {
            console.error('[App] ❌ Insert row failed:', err);
            alert('Failed to insert row');
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
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-hidden">
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
