import * as duckdb from '@duckdb/duckdb-wasm';
import type { WorkerMessage, WorkerResponse } from '../types/database';

let db: duckdb.AsyncDuckDB | null = null;
let conn: duckdb.AsyncDuckDBConnection | null = null;
let registeredFiles: Map<string, boolean> = new Map();

// Initialize DuckDB Wasm (in-memory for stability)
async function initialize() {
    try {
        const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();

        // Select bundle
        const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);

        const worker_url = URL.createObjectURL(
            new Blob([`importScripts("${bundle.mainWorker}");`], {
                type: 'text/javascript',
            })
        );

        const worker = new Worker(worker_url);
        const logger = new duckdb.ConsoleLogger();

        // Initialize DuckDB (in-memory)
        db = new duckdb.AsyncDuckDB(logger, worker);
        await db.instantiate(bundle.mainModule, bundle.pthreadWorker);

        conn = await db.connect();
        console.log('[DuckDB] ✅ Connected to in-memory database');

        // Enable extensions
        await conn.query(`INSTALL 'parquet';`);
        await conn.query(`LOAD 'parquet';`);

        console.log('[DuckDB] Initialized successfully');
        return { success: true };
    } catch (error) {
        console.error('[DuckDB] Initialization failed:', error);
        throw error;
    }
}

// Register a file in DuckDB's virtual filesystem
async function registerFile(fileName: string, fileData: ArrayBuffer) {
    if (!db) {
        throw new Error('Database not initialized');
    }

    try {
        // Create a File object from ArrayBuffer
        const file = new File([fileData], fileName);

        // Register file in DuckDB's virtual filesystem
        await db.registerFileHandle(
            fileName,
            file,
            duckdb.DuckDBDataProtocol.BROWSER_FILEREADER,
            true
        );

        registeredFiles.set(fileName, true);
        console.log(`[DuckDB] Registered file: ${fileName}`);

        return { success: true, fileName };
    } catch (error) {
        console.error('[DuckDB] File registration failed:', error);
        throw error;
    }
}

// Execute SQL query
async function executeQuery(sql: string) {
    if (!conn) {
        throw new Error('Database not initialized');
    }

    try {
        console.log('[DuckDB] Executing query:', sql.substring(0, 100) + '...');
        const result = await conn.query(sql);

        // Convert BigInt values to Number to avoid type mixing errors
        const rows = result.toArray().map(row => {
            const values = Object.values(row);
            return values.map(val => typeof val === 'bigint' ? Number(val) : val);
        });

        return {
            columns: result.schema.fields.map(f => f.name),
            rows,
            rowCount: result.numRows,
        };
    } catch (error) {
        console.error('[DuckDB] Query failed:', error);
        throw error;
    }
}

// Get table schema
async function getSchema(tableName: string = 'main_dataset') {
    if (!conn) {
        throw new Error('Database not initialized');
    }

    try {
        const schemaResult = await conn.query(`DESCRIBE ${tableName}`);
        const countResult = await conn.query(`SELECT COUNT(*) as count FROM ${tableName}`);

        const columns = schemaResult.toArray().map((row: any) => ({
            name: row.column_name,
            type: row.column_type,
            nullable: row.null === 'YES',
        }));

        const countValue = countResult.toArray()[0].count;
        const rowCount = typeof countValue === 'bigint' ? Number(countValue) : countValue;

        return {
            name: tableName,
            columns,
            rowCount,
        };
    } catch (error) {
        console.error('[DuckDB] Get schema failed:', error);
        throw error;
    }
}

// Message handler
self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
    const { id, type, payload } = event.data;

    try {
        let data;

        switch (type) {
            case 'initialize':
                data = await initialize();
                break;

            case 'registerFile':
                data = await registerFile(payload.fileName, payload.fileData);
                break;

            case 'query':
                data = await executeQuery(payload.sql);
                break;

            case 'getSchema':
                data = await getSchema(payload?.tableName);
                break;

            default:
                throw new Error(`Unknown message type: ${type}`);
        }

        const response: WorkerResponse = {
            id,
            success: true,
            data,
        };

        self.postMessage(response);
    } catch (error) {
        const response: WorkerResponse = {
            id,
            success: false,
            error: error instanceof Error ? error.message : String(error),
        };

        self.postMessage(response);
    }
};
