import { useState, useEffect, useCallback, useRef } from 'react';
import type { WorkerMessage, WorkerResponse, QueryResult, TableSchema } from '../types/database';

export function useDatabase() {
    const [isInitialized, setIsInitialized] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const workerRef = useRef<Worker | null>(null);
    const pendingRequests = useRef<Map<string, { resolve: (data: any) => void; reject: (error: Error) => void }>>(new Map());

    // Initialize worker
    useEffect(() => {
        const worker = new Worker(
            new URL('../lib/database/duckdb-worker.ts', import.meta.url),
            { type: 'module' }
        );

        workerRef.current = worker;

        worker.onerror = (event) => {
            console.error('[Worker] Error:', event);
            setError(event.message);
        };

        worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
            const { id, success, data, error } = event.data;

            const pending = pendingRequests.current.get(id);
            if (!pending) {
                console.warn('[Worker] Received response for unknown request:', id);
                return;
            }

            pendingRequests.current.delete(id);

            if (success) {
                pending.resolve(data);
            } else {
                pending.reject(new Error(error || 'Unknown error'));
            }
        };

        // Initialize DuckDB
        sendMessage({ type: 'initialize' })
            .then(() => {
                setIsInitialized(true);
                console.log('[Database] Initialized successfully');
            })
            .catch((err) => {
                setError(err.message);
                console.error('[Database] Initialization failed:', err);
            });

        return () => {
            worker.terminate();
        };
    }, []);

    const sendMessage = useCallback(<T = any>(message: Omit<WorkerMessage, 'id'>): Promise<T> => {
        return new Promise((resolve, reject) => {
            if (!workerRef.current) {
                reject(new Error('Worker not initialized'));
                return;
            }

            const id = crypto.randomUUID();
            pendingRequests.current.set(id, { resolve, reject });

            const fullMessage: WorkerMessage = { id, ...message };
            workerRef.current.postMessage(fullMessage);

            // Timeout after 60 seconds (increased for large CSV files)
            setTimeout(() => {
                if (pendingRequests.current.has(id)) {
                    pendingRequests.current.delete(id);
                    reject(new Error('Request timeout after 60 seconds - file might be too large'));
                }
            }, 60000);
        });
    }, []);

    const registerFile = useCallback(async (file: File): Promise<void> => {
        if (!isInitialized) {
            throw new Error('Database not initialized');
        }

        // Read file as ArrayBuffer
        const arrayBuffer = await file.arrayBuffer();

        // Send to worker
        await sendMessage({
            type: 'registerFile',
            payload: {
                fileName: file.name,
                fileData: arrayBuffer
            }
        });
    }, [isInitialized, sendMessage]);

    const query = useCallback(async (sql: string): Promise<QueryResult> => {
        if (!isInitialized) {
            throw new Error('Database not initialized');
        }
        return sendMessage({ type: 'query', payload: { sql } });
    }, [isInitialized, sendMessage]);

    const getSchema = useCallback(async (tableName?: string): Promise<TableSchema> => {
        if (!isInitialized) {
            throw new Error('Database not initialized');
        }
        return sendMessage({ type: 'getSchema', payload: { tableName } });
    }, [isInitialized, sendMessage]);

    return {
        isInitialized,
        error,
        registerFile,
        query,
        getSchema,
    };
}
