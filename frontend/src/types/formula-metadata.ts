export interface FormulaMetadata {
    id: string;
    sheetId: string;
    sheetName: string;
    cellAddress?: string;  // Per formule singole (es. "A1")
    columnId?: string;     // Per formule di colonna (es. "A" o "Total")
    formulaType: 'cell' | 'column' | 'named';
    formula: string;
    description?: string;
    createdAt: Date;
    updatedAt: Date;
    status: 'active' | 'error' | 'deprecated';
    errorMessage?: string;
    dependencies?: string[]; // Altre celle/colonne da cui dipende
    affects?: string[];      // Celle/colonne che influenza
}

export interface FormulaMetadataStore {
    formulas: FormulaMetadata[];
    addFormula: (metadata: Omit<FormulaMetadata, 'id' | 'createdAt' | 'updatedAt'>) => string;
    updateFormula: (id: string, updates: Partial<FormulaMetadata>) => void;
    removeFormula: (id: string) => void;
    getFormulasForSheet: (sheetId: string) => FormulaMetadata[];
    getFormulaById: (id: string) => FormulaMetadata | undefined;
    exportMetadata: () => string;
    importMetadata: (jsonData: string) => void;
}