import { Upload } from 'lucide-react';
import { useCallback, useState } from 'react';
import type { TableSchema } from '../../types/database';

interface DropZoneProps {
    onFileLoad: (file: File) => Promise<void>;
    isLoading?: boolean;
}

export function DropZone({ onFileLoad, isLoading = false }: DropZoneProps) {
    const [isDragging, setIsDragging] = useState(false);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback(async (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);

        const files = Array.from(e.dataTransfer.files);
        const file = files[0];

        if (!file) return;

        // Validate file type
        const validTypes = ['.csv', '.parquet', '.tsv'];
        const isValid = validTypes.some(ext => file.name.toLowerCase().endsWith(ext));

        if (!isValid) {
            alert('Please upload a CSV or Parquet file');
            return;
        }

        await onFileLoad(file);
    }, [onFileLoad]);

    const handleFileInput = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        await onFileLoad(files[0]);
    }, [onFileLoad]);

    return (
        <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`
        flex flex-col items-center justify-center
        border-2 border-dashed rounded-xl p-12
        transition-all duration-200
        ${isDragging
                    ? 'border-emerald-500 bg-emerald-50'
                    : 'border-slate-300 bg-white hover:border-emerald-400 hover:bg-emerald-50'
                }
        ${isLoading ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}
      `}
        >
            <div className={`
        p-4 rounded-full mb-4 transition-colors
        ${isDragging ? 'bg-emerald-500' : 'bg-emerald-100'}
      `}>
                <Upload
                    size={32}
                    className={isDragging ? 'text-white' : 'text-emerald-600'}
                />
            </div>

            <h3 className="text-lg font-bold text-slate-800 mb-2">
                {isLoading ? 'Loading...' : 'Drop your file here'}
            </h3>

            <p className="text-sm text-slate-500 mb-4">
                or click to browse
            </p>

            <label className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium cursor-pointer transition-colors">
                Select File
                <input
                    type="file"
                    accept=".csv,.parquet,.tsv"
                    onChange={handleFileInput}
                    className="hidden"
                    disabled={isLoading}
                />
            </label>

            <p className="text-xs text-slate-400 mt-4">
                Supported formats: CSV, Parquet, TSV
            </p>
        </div>
    );
}
