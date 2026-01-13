import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { FormulaMetadata, FormulaMetadataStore } from '../types/formula-metadata';

export const useFormulaMetadataStore = create<FormulaMetadataStore>()(
    persist(
        (set, get) => ({
            formulas: [],

            addFormula: (metadata) => {
                const id = `formula_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                const now = new Date();
                
                const newFormula: FormulaMetadata = {
                    ...metadata,
                    id,
                    createdAt: now,
                    updatedAt: now,
                };

                set((state) => ({
                    formulas: [...state.formulas, newFormula],
                }));

                return id;
            },

            updateFormula: (id, updates) => {
                set((state) => ({
                    formulas: state.formulas.map((formula) =>
                        formula.id === id
                            ? { ...formula, ...updates, updatedAt: new Date() }
                            : formula
                    ),
                }));
            },

            removeFormula: (id) => {
                set((state) => ({
                    formulas: state.formulas.filter((formula) => formula.id !== id),
                }));
            },

            getFormulasForSheet: (sheetId) => {
                return get().formulas.filter((formula) => formula.sheetId === sheetId);
            },

            getFormulaById: (id) => {
                return get().formulas.find((formula) => formula.id === id);
            },

            exportMetadata: () => {
                return JSON.stringify(get().formulas, null, 2);
            },

            importMetadata: (jsonData) => {
                try {
                    const importedFormulas = JSON.parse(jsonData) as FormulaMetadata[];
                    set({ formulas: importedFormulas });
                } catch (error) {
                    console.error('Failed to import metadata:', error);
                    throw new Error('Invalid metadata format');
                }
            },
        }),
        {
            name: 'formula-metadata-storage',
            version: 1,
        }
    )
);