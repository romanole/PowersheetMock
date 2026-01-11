import axios from 'axios';

const API_BASE_URL = 'http://localhost:8000/api';

// Create axios instance with default config
const apiClient = axios.create({
    baseURL: API_BASE_URL,
    timeout: 600000, // 10 minutes for large file operations
    headers: {
        'Content-Type': 'application/json',
    },
});

export interface QueryResponse {
    columns: string[];
    rows: any[][];
    rowCount: number;
    executionTime: number;
}

export interface SchemaResponse {
    tableName: string;
    columns: Array<{
        name: string;
        type: string;
        nullable: boolean;
    }>;
    rowCount: number;
}

export interface UploadResponse {
    tableName: string;
    rows: number;
    columns: number;
    sizeMb: number;
}

export const api = {
    /**
     * Upload CSV file
     */
    uploadFile: async (file: File): Promise<UploadResponse> => {
        const formData = new FormData();
        formData.append('file', file);

        const response = await apiClient.post<UploadResponse>('/upload', formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        });

        return response.data;
    },

    /**
     * Execute SQL query
     */
    query: async (sql: string): Promise<QueryResponse> => {
        const response = await apiClient.post<QueryResponse>('/query', { sql });
        return response.data;
    },

    /**
     * Get table schema
     */
    getSchema: async (table: string = 'main_dataset'): Promise<SchemaResponse> => {
        const response = await apiClient.get<SchemaResponse>('/schema', {
            params: { table },
        });
        return response.data;
    },

    /**
     * Update single cell
     */
    updateCell: async (
        table: string,
        rowId: number,
        column: string,
        value: any
    ): Promise<void> => {
        await apiClient.post('/cell/update', {
            table,
            rowId,
            column,
            value,
        });
    },

    /**
     * Insert new row at specified position
     */
    insertRow: async (table: string = 'main_dataset', position?: number): Promise<void> => {
        await apiClient.post('/row/insert', null, {
            params: { table, position },
        });
    },

    /**
     * Delete row
     */
    deleteRow: async (rowId: number, table: string = 'main_dataset'): Promise<void> => {
        await apiClient.delete(`/row/${rowId}`, {
            params: { table },
        });
    },

    /**
     * Insert new column
     */
    insertColumn: async (
        table: string,
        columnName: string,
        dataType: string = 'VARCHAR'
    ): Promise<void> => {
        await apiClient.post('/column/insert', {
            table,
            columnName,
            dataType,
        });
    },

    /**
     * Delete column
     */
    deleteColumn: async (columnName: string, table: string = 'main_dataset'): Promise<void> => {
        await apiClient.delete(`/column/${columnName}`, {
            params: { table },
        });
    },

    /**
     * Change column data type
     */
    changeColumnType: async (
        table: string,
        column: string,
        newType: string,
        decimalSeparator: '.' | ',' = '.'
    ): Promise<void> => {
        await apiClient.post('/column/type', {
            table,
            column,
            newType,
            decimalSeparator,
        });
    },

    /**
     * Health check
     */
    healthCheck: async (): Promise<{ status: string; service: string }> => {
        const response = await apiClient.get('/health');
        return response.data;
    },
};

export default api;
