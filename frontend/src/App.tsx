import { Database, Upload } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useDatabase } from './hooks/useDatabase';
import api from './api/client';
import { DropZone } from './components/FileUpload/DropZone';
import { ImportWizard } from './components/FileUpload/ImportWizard';
import { VirtualGrid } from './components/VirtualGrid/VirtualGrid';
import { ExcelGrid } from './components/VirtualGrid/ExcelGrid';
import { FormulaBar } from './components/FormulaBar/FormulaBar';
import { AdvancedFormulaBar } from './components/FormulaBar/AdvancedFormulaBar';
import { FormulaMetadataPanel } from './components/FormulaBar/FormulaMetadataPanel';
import { SheetTabs } from './components/SheetTabs/SheetTabs';
import type { TableSchema } from './types/database';
import type { Sheet } from './api/client';
import { FormulaEngine } from './services/FormulaEngine';
import { FormulaDashboard } from './components/FormulaDashboard/FormulaDashboard';
import { useGridStore } from './store/gridStore';
import { useFormulaMetadataStore } from './store/formulaMetadataStore';
import { parseCellAddress } from './lib/excel-coordinates';

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
    const [isMetadataPanelOpen, setIsMetadataPanelOpen] = useState(false);

    // Grid store
    const { 
        selectedCell, 
        selectedCells, 
        currentFormula, 
        setCurrentFormula,
        setSchema: setStoreSchema
    } = useGridStore();

    // Formula metadata store
    const { addFormula, updateFormula } = useFormulaMetadataStore();

    // Sync schema with store
    useEffect(() => {
        setStoreSchema(schema);
    }, [schema, setStoreSchema]);

    // Update formula bar when cell selection changes
    useEffect(() => {
        if (selectedCell && activeSheetId && schema) {
            // Get formula from FormulaEngine
            const formula = FormulaEngine.getInstance().getFormula(
                activeSheetId,
                selectedCell.row,
                selectedCell.col
            );
            
            if (formula) {
                setCurrentFormula(formula);
            } else {
                // No formula, get the value
                const colName = schema.columns[selectedCell.col]?.name;
                if (colName && gridData[selectedCell.row]) {
                    const value = gridData[selectedCell.row][selectedCell.col];
                    setCurrentFormula(value !== null && value !== undefined ? String(value) : '');
                } else {
                    setCurrentFormula('');
                }
            }
        } else {
            setCurrentFormula('');
        }
    }, [selectedCell, activeSheetId, schema, gridData]);

    // Load sheet data function (used by multiple handlers)
    const loadSheetData = async (sheetId: string) => {
        const sheet = sheets.find(s => s.id === sheetId);
        if (!sheet) return;

        setIsLoading(true);
        setGridData([]);
        setSchema(null);

        try {
            const tableSchema = await api.getSchema(sheet.tableName);
            setSchema(tableSchema);

            const result = await query(`SELECT * FROM ${sheet.tableName} LIMIT 1000`);
            setGridData(result.rows);

            FormulaEngine.getInstance().initializeSheet(sheetId, result.rows);

            try {
                const formulas = await api.getFormulas(sheet.tableName);
                if (formulas && formulas.length > 0) {
                    const columnNames = tableSchema.columns.map(c => c.name);
                    const pkMap = new Map<string, number>();
                    result.rows.forEach((row, index) => {
                        pkMap.set(String(row[0]), index);
                    });

                    formulas.forEach(f => {
                        const rowIndex = pkMap.get(String(f.rowId));
                        const colIndex = columnNames.indexOf(f.column);

                        if (rowIndex !== undefined && colIndex !== -1) {
                            // Add to Formula Engine
                            FormulaEngine.getInstance().setCellValue(
                                sheetId,
                                rowIndex,
                                colIndex,
                                f.formula,
                                columnNames
                            );
                            
                            // Also restore to metadata store
                            const cellAddress = `${String.fromCharCode(65 + colIndex)}${rowIndex + 1}`;
                            addFormula({
                                sheetId: sheetId,
                                sheetName: sheet.name,
                                cellAddress: cellAddress,
                                formulaType: 'cell',
                                formula: f.formula,
                                description: `Restored formula from database`,
                                status: 'active'
                            });
                        }
                    });
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

    // Formula handlers
    const handleFormulaChange = (formula: string) => {
        setCurrentFormula(formula);
    };

    const handleFormulaSubmit = (formula: string) => {
        if (selectedCell) {
            handleCellEdit(selectedCell.display, formula);
        }
    };

    // Advanced formula handlers
    const handleColumnFormula = async (column: string, formula: string) => {
        if (!schema || !activeSheetId) return;
        
        try {
            // Apply formula to entire column using SQL
            const tableName = sheets.find(s => s.id === activeSheetId)?.tableName || 'main_dataset';
            
            // Get column name from column identifier
            let columnName: string;
            if (column.length === 1 && column.match(/[A-Z]/)) {
                // It's a column letter like "A", "B"
                const colIndex = column.charCodeAt(0) - 65;
                columnName = schema.columns[colIndex]?.name;
            } else {
                // It's a column name
                columnName = column;
            }
            
            if (!columnName) {
                alert('Column not found');
                return;
            }

            // Add to formula metadata BEFORE applying
            const currentSheet = sheets.find(s => s.id === activeSheetId);
            const formulaId = addFormula({
                sheetId: activeSheetId,
                sheetName: currentSheet?.name || 'Unknown Sheet',
                columnId: column,
                formulaType: 'column',
                formula: formula,
                description: `Column formula applied to ${column} (${columnName}) - affects all ${schema.rowCount.toLocaleString()} rows`,
                status: 'active'
            });
            
            // Convert Excel formula to SQL expression
            // For now, simple replacement - could be enhanced with proper parser
            let sqlExpression = formula.substring(1); // Remove =
            
            // Simple replacements for common patterns
            sqlExpression = sqlExpression.replace(/([A-Z]+)(\d+)/g, (match, col, row) => {
                const colIndex = col.charCodeAt(0) - 65;
                const colName = schema.columns[colIndex]?.name;
                return colName || match;
            });
            
            const sql = `UPDATE ${tableName} SET ${columnName} = ${sqlExpression}`;
            
            await query(sql);
            
            // Reload data
            await loadSheetData(activeSheetId);
            
            // Update formula status to success
            updateFormula(formulaId, {
                status: 'active',
                updatedAt: new Date()
            });
            
            alert(`Applied formula to column ${column}`);
            
        } catch (err) {
            console.error('Failed to apply column formula:', err);
            
            // Update formula status to error if we have the ID
            // Note: In a real implementation, you'd want to track the formulaId better
            alert('Failed to apply column formula: ' + (err instanceof Error ? err.message : 'Unknown error'));
        }
    };

    const handleNamedCellFormula = async (cellName: string, formula: string) => {
        if (!activeSheetId) return;
        
        // Add to formula metadata
        const currentSheet = sheets.find(s => s.id === activeSheetId);
        addFormula({
            sheetId: activeSheetId,
            sheetName: currentSheet?.name || 'Unknown Sheet',
            formulaType: 'named',
            formula: formula,
            description: `Named reference "${cellName}" - ${formula}`,
            status: 'active'
        });
        
        console.log(`Creating named reference: ${cellName} = ${formula}`);
        alert(`Named reference "${cellName}" created and tracked in metadata`);
    };

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
        loadSheetData(activeSheetId);
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

    const handleCellEdit = async (cellAddress: string, newValue: string) => {
        if (!schema || !activeSheetId) return;

        // Parse Excel address to get row/column indices
        const coords = parseCellAddress(cellAddress);
        const rowIndex = coords.rowIndex;
        const colIndex = coords.colIndex;

        const columnName = schema.columns[colIndex].name;
        const pkColumn = schema.columns[0].name;
        const pkValue = gridData[rowIndex][0];

        console.log('Updating cell:', { cellAddress, rowIndex, colIndex, columnName, pkValue, newValue });

        try {
            // Update Formula Engine
            const columnNames = schema.columns.map(c => c.name);
            FormulaEngine.getInstance().setCellValue(activeSheetId, rowIndex, colIndex, newValue, columnNames);

            let valueToSend = newValue;
            let formulaToSend: string | undefined = undefined;

            // If it's a formula, track it in metadata and calculate value
            if (newValue.startsWith('=')) {
                formulaToSend = newValue;
                
                // Add to formula metadata
                const currentSheet = sheets.find(s => s.id === activeSheetId);
                addFormula({
                    sheetId: activeSheetId,
                    sheetName: currentSheet?.name || 'Unknown Sheet',
                    cellAddress: cellAddress,
                    formulaType: 'cell',
                    formula: newValue,
                    description: `Formula applied to cell ${cellAddress}`,
                    status: 'active'
                });

                // Get the calculated value from the engine
                const calculatedValue = FormulaEngine.getInstance().getCellValue(activeSheetId, rowIndex, colIndex);
                valueToSend = calculatedValue || newValue; // Fallback to original if calculation fails

                // Update local state to show result
                setGridData(prevData => {
                    const newData = [...prevData];
                    if (newData[rowIndex]) {
                        newData[rowIndex] = [...newData[rowIndex]];
                        newData[rowIndex][colIndex] = calculatedValue || newValue;
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

            // Find the correct table name
            const tableName = sheets.find(s => s.id === activeSheetId)?.tableName || 'main_dataset';
            
            const updatePayload = {
                table: tableName,
                rowId: pkValue,
                column: columnName,
                value: valueToSend,
                formula: formulaToSend
            };
            
            console.log('Sending update payload:', updatePayload);

            await api.updateCell(updatePayload);

        } catch (err) {
            console.error("Failed to update cell:", err);
            // Revert local state on error
            await loadSheetData(activeSheetId);
            alert("Failed to update cell: " + (err instanceof Error ? err.message : 'Unknown error'));
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
                            onClick={() => setIsMetadataPanelOpen(true)}
                            className="ml-2 px-3 py-1.5 text-xs text-purple-600 hover:bg-purple-50 rounded-md transition-colors border border-purple-200 flex items-center gap-1"
                            title="View Formula Metadata"
                        >
                            <span>📋</span> Metadata
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
                {/* Formula Bar - Only show when we have data */}
                {schema && (
                    <>
                        <FormulaBar
                            selectedCell={selectedCell}
                            selectedRange={selectedCells}
                            formula={currentFormula}
                            onFormulaChange={handleFormulaChange}
                            onFormulaSubmit={handleFormulaSubmit}
                        />
                        <AdvancedFormulaBar
                            schema={schema}
                            onColumnFormula={handleColumnFormula}
                            onNamedCellFormula={handleNamedCellFormula}
                        />
                    </>
                )}
                
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
                        <ExcelGrid
                            schema={schema}
                            data={gridData}
                            isLoading={isLoading}
                            onCellEdit={handleCellEdit}
                            onColumnTypeChange={handleColumnTypeChange}
                            sheetId={activeSheetId}
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

            {/* Formula Dashboard */}
            {isDashboardOpen && (
                <FormulaDashboard
                    isOpen={isDashboardOpen}
                    onClose={() => setIsDashboardOpen(false)}
                    sheetId={activeSheetId}
                    schema={schema}
                    onApplyFormula={(formula) => {
                        console.log('Apply formula:', formula);
                        setIsDashboardOpen(false);
                    }}
                />
            )}

            {/* Formula Metadata Panel */}
            {isMetadataPanelOpen && (
                <FormulaMetadataPanel
                    isOpen={isMetadataPanelOpen}
                    onClose={() => setIsMetadataPanelOpen(false)}
                    currentSheetId={activeSheetId || undefined}
                />
            )}
        </div>
    );
}

export default App;
