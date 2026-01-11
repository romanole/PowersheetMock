// Types for DuckDB Wasm worker communication
export interface QueryResult {
    columns: string[];
    rows: any[][];
    rowCount: number;
}

export interface TableSchema {
    tableName: string;
    columns: ColumnInfo[];
    rowCount: number;
}

export interface ColumnInfo {
    name: string;
    type: string;
    nullable: boolean;
}

export interface WorkerMessage {
    id: string;
    type: 'initialize' | 'query' | 'loadCSV' | 'export' | 'getSchema';
    payload?: any;
}

export interface WorkerResponse {
    id: string;
    success: boolean;
    data?: any;
    error?: string;
}
