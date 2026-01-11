import { useState, useCallback, useEffect } from 'react';
import api, { type SchemaResponse, type QueryResponse } from '../api/client';

export function useDatabase() {
    const [isInitialized, setIsInitialized] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Check backend health on mount
    useEffect(() => {
        api.healthCheck()
            .then(() => {
                setIsInitialized(true);
                console.log('[Backend] Connected successfully');
            })
            .catch((err) => {
                setError('Failed to connect to backend server. Make sure it is running on port 8000.');
                console.error('[Backend] Connection failed:', err);
            });
    }, []);

    const registerFile = useCallback(async (file: File) => {
        try {
            const result = await api.uploadFile(file);
            console.log('[Backend] File uploaded:', result);
            return result;
        } catch (err: any) {
            console.error('[Backend] Upload failed:', err);
            throw new Error(err.response?.data?.detail || 'Upload failed');
        }
    }, []);

    const query = useCallback(async (sql: string): Promise<QueryResponse> => {
        try {
            return await api.query(sql);
        } catch (err: any) {
            console.error('[Backend] Query failed:', err);
            throw new Error(err.response?.data?.detail || 'Query failed');
        }
    }, []);

    const getSchema = useCallback(async (table: string = 'main_dataset'): Promise<SchemaResponse> => {
        try {
            return await api.getSchema(table);
        } catch (err: any) {
            console.error('[Backend] Get schema failed:', err);
            throw new Error(err.response?.data?.detail || 'Get schema failed');
        }
    }, []);

    return {
        isInitialized,
        error,
        registerFile,
        query,
        getSchema,
    };
}
