import { HyperFormula } from 'hyperformula';

export interface FormulaEntry {
    row: number;
    col: number;
    formula: string;
    value: any;
    sheetId: string;
}

export class FormulaEngine {
    private static instance: FormulaEngine;
    private hf: HyperFormula;
    private sheetMap: Map<string, number> = new Map(); // Map sheetId to internal HF sheetId

    private constructor() {
        this.hf = HyperFormula.buildEmpty({
            licenseKey: 'gpl-v3',
        });
    }

    public static getInstance(): FormulaEngine {
        if (!FormulaEngine.instance) {
            FormulaEngine.instance = new FormulaEngine();
        }
        return FormulaEngine.instance;
    }

    public initializeSheet(sheetId: string, data: any[][]) {
        const sheetName = `Sheet_${sheetId}`;
        let internalId: number | undefined;

        try {
            // 1. Try to get existing sheet ID from HF directly
            if (this.hf.doesSheetExist(sheetName)) {
                internalId = this.hf.getSheetId(sheetName);
            }

            // 2. If not found, create it
            if (internalId === undefined) {
                try {
                    this.hf.addSheet(sheetName);
                    // addSheet returns the name (string), so we must fetch the ID (number) separately
                    internalId = this.hf.getSheetId(sheetName);
                } catch (e: any) {
                    // Race condition check
                    if (this.hf.doesSheetExist(sheetName)) {
                        internalId = this.hf.getSheetId(sheetName);
                    } else {
                        throw e;
                    }
                }
            }

            // 3. Update map and content
            if (internalId !== undefined) {
                this.sheetMap.set(sheetId, internalId);

                // Sanitize data: Ensure 2D array and convert undefined to null
                const safeData = Array.isArray(data) ? data.map(row =>
                    Array.isArray(row) ? row.map(cell => cell === undefined ? null : cell) : []
                ) : [[]];

                // Clear and set content
                this.hf.setSheetContent(internalId, safeData);
                console.log(`[FormulaEngine] Initialized sheet ${sheetId} (internal: ${internalId})`);
            }
        } catch (e) {
            return null;
        }
    }

    public getAllFormulas(sheetId: string): FormulaEntry[] {
        const internalId = this.sheetMap.get(sheetId);
        if (internalId === undefined) return [];

        const formulas: FormulaEntry[] = [];
        const sheetDims = this.hf.getSheetDimensions(internalId);

        // This is not efficient for sparse sheets, but HF doesn't expose a "get all formulas" method easily
        // Optimally we would track formulas ourselves, but for now we scan the populated area
        // Or we can use getSheetSerialized to see what's there

        // Better approach: Iterate over cells that might have formulas
        // For now, let's just scan the used range
        const width = sheetDims.width;
        const height = sheetDims.height;

        for (let r = 0; r < height; r++) {
            for (let c = 0; c < width; c++) {
                const formula = this.hf.getCellFormula({ sheet: internalId, row: r, col: c });
                if (formula) {
                    const value = this.getCellValue(sheetId, r, c);
                    formulas.push({
                        row: r,
                        col: c,
                        formula: `=${formula}`,
                        value,
                        sheetId
                    });
                }
            }
        }

        return formulas;
    }

    public isFormula(value: any): boolean {
        return typeof value === 'string' && value.startsWith('=');
    }
}
