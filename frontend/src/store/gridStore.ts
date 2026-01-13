import { create } from 'zustand';
import type { TableSchema, ColumnInfo } from '../types/database';
import type { ExcelCellAddress, ExcelRange } from '../lib/excel-coordinates';

// Using Excel-style addresses from lib/excel-coordinates
export type { ExcelCellAddress as CellAddress, ExcelRange as CellRange } from '../lib/excel-coordinates';

export interface SortConfig {
    column: string;
    direction: 'ASC' | 'DESC';
}

export interface FilterConfig {
    column: string;
    values: string[];
}

interface GridState {
    // Data
    schema: TableSchema | null;
    totalRows: number;

    // Viewport
    scrollTop: number;
    visibleRange: [number, number];
    rowHeight: number;

    // Selection (Excel-style)
    selectedCells: ExcelRange | null;
    selectedCell: ExcelCellAddress | null;
    editingCell: ExcelCellAddress | null;
    
    // Formula
    currentFormula: string;

    // Filters & Sorts
    sortState: SortConfig[];
    filterState: FilterConfig[];

    // Actions
    setSchema: (schema: TableSchema | null) => void;
    setScrollTop: (scrollTop: number) => void;
    setVisibleRange: (range: [number, number]) => void;
    setSelectedCells: (range: ExcelRange | null) => void;
    setSelectedCell: (cell: ExcelCellAddress | null) => void;
    setEditingCell: (cell: ExcelCellAddress | null) => void;
    setCurrentFormula: (formula: string) => void;
    setSortState: (sorts: SortConfig[]) => void;
    setFilterState: (filters: FilterConfig[]) => void;
    clearAll: () => void;
}

export const useGridStore = create<GridState>((set) => ({
    // Initial state
    schema: null,
    totalRows: 0,
    scrollTop: 0,
    visibleRange: [0, 50],
    rowHeight: 32,
    selectedCells: null,
    selectedCell: null,
    editingCell: null,
    currentFormula: '',
    sortState: [],
    filterState: [],

    // Actions
    setSchema: (schema) => set({
        schema,
        totalRows: schema ? schema.rowCount : 0,
        // Reset selection when schema changes
        selectedCells: null,
        selectedCell: null,
        editingCell: null,
        currentFormula: '',
    }),
    setScrollTop: (scrollTop) => set({ scrollTop }),
    setVisibleRange: (range) => set({ visibleRange: range }),
    setSelectedCells: (range) => set({ selectedCells: range }),
    setSelectedCell: (cell) => set({ selectedCell: cell }),
    setEditingCell: (cell) => set({ editingCell: cell }),
    setCurrentFormula: (formula) => set({ currentFormula: formula }),
    setSortState: (sorts) => set({ sortState: sorts }),
    setFilterState: (filters) => set({ filterState: filters }),
    clearAll: () => set({
        schema: null,
        totalRows: 0,
        scrollTop: 0,
        visibleRange: [0, 50],
        selectedCells: null,
        selectedCell: null,
        editingCell: null,
        currentFormula: '',
        sortState: [],
        filterState: [],
    }),
}));
