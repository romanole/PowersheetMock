import { create } from 'zustand';
import type { TableSchema, ColumnInfo } from '../types/database';

export interface CellAddress {
    row: number;
    col: number;
}

export interface CellRange {
    start: CellAddress;
    end: CellAddress;
}

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

    // Selection
    selectedCells: CellRange | null;
    editingCell: CellAddress | null;

    // Filters & Sorts
    sortState: SortConfig[];
    filterState: FilterConfig[];

    // Actions
    setSchema: (schema: TableSchema | null) => void;
    setScrollTop: (scrollTop: number) => void;
    setVisibleRange: (range: [number, number]) => void;
    setSelectedCells: (range: CellRange | null) => void;
    setEditingCell: (cell: CellAddress | null) => void;
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
    editingCell: null,
    sortState: [],
    filterState: [],

    // Actions
    setSchema: (schema) => set({
        schema,
        totalRows: schema ? schema.rowCount : 0,
        // Reset selection when schema changes
        selectedCells: null,
        editingCell: null,
    }),
    setScrollTop: (scrollTop) => set({ scrollTop }),
    setVisibleRange: (range) => set({ visibleRange: range }),
    setSelectedCells: (range) => set({ selectedCells: range }),
    setEditingCell: (cell) => set({ editingCell: cell }),
    setSortState: (sorts) => set({ sortState: sorts }),
    setFilterState: (filters) => set({ filterState: filters }),
    clearAll: () => set({
        schema: null,
        totalRows: 0,
        scrollTop: 0,
        visibleRange: [0, 50],
        selectedCells: null,
        editingCell: null,
        sortState: [],
        filterState: [],
    }),
}));
