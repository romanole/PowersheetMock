
import { FormulaEngine } from '../services/FormulaEngine';

// Mock HyperFormula since we are running in node and it might need some polyfills or just work
// FormulaEngine imports HyperFormula, so we need to make sure it works.
// We might need to mock the console to see the output.

async function runTest() {
    console.log("--- Starting Formula Engine Test ---");

    const engine = FormulaEngine.getInstance();
    const sheetId = "test_sheet";

    // Columns: A (0), BB (1), CCC (2)
    // Values: 10, 20, 30
    const data = [
        [10, 20, 30],
        [100, 200, 300]
    ];
    const columnNames = ["A", "BB", "CCC"];

    console.log("Initializing sheet with columns:", columnNames);
    engine.initializeSheet(sheetId, data);

    // Test Case 1: Simple subtraction with column names
    // Formula: =A-CCC
    // Expected: =A1-C1 (10 - 30 = -20)
    // Buggy (Sorted: CCC, BB, A): 
    //   A is index 2 in sorted -> C column
    //   CCC is index 0 in sorted -> A column
    //   Result: =C1-A1 (30 - 10 = 20)

    const row = 0;
    const col = 3; // Target cell for formula
    const formula = "=A-CCC";

    console.log(`\nSetting cell [${row}, ${col}] to formula: "${formula}"`);

    // We need to use setCellValue which calls preprocessFormula
    engine.setCellValue(sheetId, row, col, formula, columnNames);

    // Check the stored formula
    const storedFormula = engine.getFormula(sheetId, row, col);
    console.log(`Stored Formula: "${storedFormula}"`);

    // Check the calculated value
    const value = engine.getCellValue(sheetId, row, col);
    console.log(`Calculated Value: ${value}`);

    const expectedValue = 10 - 30; // -20

    if (value === expectedValue) {
        console.log("\n✅ TEST PASSED: Formula calculated correctly.");
    } else {
        console.log(`\n❌ TEST FAILED: Expected ${expectedValue}, got ${value}`);
        console.log("This confirms the column mapping bug.");
    }
}

runTest().catch(console.error);
