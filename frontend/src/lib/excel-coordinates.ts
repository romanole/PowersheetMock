/**
 * Excel-like coordinate system utilities
 * Converts between numeric indices and Excel-style addresses (A1, B2, AA1, etc.)
 */

export interface ExcelCellAddress {
    col: string;    // "A", "B", "AA"
    row: number;    // 1, 2, 3 (1-indexed)
    display: string; // "A1", "B2", "AA1"
}

export interface ExcelRange {
    start: ExcelCellAddress;
    end: ExcelCellAddress;
    display: string; // "A1:C10"
}

/**
 * Convert numeric column index to Excel column letters
 * @param colIndex 0-based column index (0 = A, 1 = B, 25 = Z, 26 = AA)
 * @returns Excel column letters (A, B, ..., Z, AA, AB, ...)
 */
export function numberToColumn(colIndex: number): string {
    let result = '';
    let index = colIndex;
    
    while (index >= 0) {
        result = String.fromCharCode(65 + (index % 26)) + result;
        index = Math.floor(index / 26) - 1;
    }
    
    return result;
}

/**
 * Convert Excel column letters to numeric index
 * @param column Excel column letters (A, B, ..., Z, AA, AB, ...)
 * @returns 0-based column index
 */
export function columnToNumber(column: string): number {
    let result = 0;
    const length = column.length;
    
    for (let i = 0; i < length; i++) {
        const char = column.charCodeAt(length - 1 - i) - 65;
        result += (char + 1) * Math.pow(26, i);
    }
    
    return result - 1;
}

/**
 * Create Excel cell address from numeric coordinates
 * @param rowIndex 0-based row index
 * @param colIndex 0-based column index
 * @returns Excel cell address
 */
export function createCellAddress(rowIndex: number, colIndex: number): ExcelCellAddress {
    const col = numberToColumn(colIndex);
    const row = rowIndex + 1; // Convert to 1-based
    
    return {
        col,
        row,
        display: `${col}${row}`
    };
}

/**
 * Parse Excel cell address to numeric coordinates
 * @param address Excel cell address (e.g., "A1", "B2", "AA10")
 * @returns Object with rowIndex and colIndex (0-based)
 */
export function parseCellAddress(address: string): { rowIndex: number; colIndex: number } {
    const match = address.match(/^([A-Z]+)(\d+)$/);
    if (!match) {
        throw new Error(`Invalid cell address: ${address}`);
    }
    
    const [, colStr, rowStr] = match;
    const colIndex = columnToNumber(colStr);
    const rowIndex = parseInt(rowStr, 10) - 1; // Convert to 0-based
    
    return { rowIndex, colIndex };
}

/**
 * Create Excel range from two cell addresses
 * @param start Start cell address
 * @param end End cell address
 * @returns Excel range
 */
export function createRange(start: ExcelCellAddress, end: ExcelCellAddress): ExcelRange {
    return {
        start,
        end,
        display: `${start.display}:${end.display}`
    };
}

/**
 * Create Excel range from numeric coordinates
 * @param startRow 0-based start row
 * @param startCol 0-based start column
 * @param endRow 0-based end row
 * @param endCol 0-based end column
 * @returns Excel range
 */
export function createRangeFromCoords(
    startRow: number, 
    startCol: number, 
    endRow: number, 
    endCol: number
): ExcelRange {
    const start = createCellAddress(startRow, startCol);
    const end = createCellAddress(endRow, endCol);
    return createRange(start, end);
}

/**
 * Parse Excel range string (e.g., "A1:C10")
 * @param rangeStr Excel range string
 * @returns Parsed range with numeric coordinates
 */
export function parseRange(rangeStr: string): {
    startRow: number;
    startCol: number;
    endRow: number;
    endCol: number;
} {
    const parts = rangeStr.split(':');
    if (parts.length !== 2) {
        throw new Error(`Invalid range: ${rangeStr}`);
    }
    
    const start = parseCellAddress(parts[0]);
    const end = parseCellAddress(parts[1]);
    
    return {
        startRow: start.rowIndex,
        startCol: start.colIndex,
        endRow: end.rowIndex,
        endCol: end.colIndex
    };
}

/**
 * Get all cell addresses in a range
 * @param range Excel range
 * @returns Array of all cell addresses in the range
 */
export function getCellsInRange(range: ExcelRange): ExcelCellAddress[] {
    const cells: ExcelCellAddress[] = [];
    const startCoords = parseCellAddress(range.start.display);
    const endCoords = parseCellAddress(range.end.display);
    
    for (let row = startCoords.rowIndex; row <= endCoords.rowIndex; row++) {
        for (let col = startCoords.colIndex; col <= endCoords.colIndex; col++) {
            cells.push(createCellAddress(row, col));
        }
    }
    
    return cells;
}

/**
 * Check if a cell is within a range
 * @param cellAddress Cell address to check
 * @param range Range to check against
 * @returns True if cell is in range
 */
export function isCellInRange(cellAddress: ExcelCellAddress, range: ExcelRange): boolean {
    const cellCoords = parseCellAddress(cellAddress.display);
    const startCoords = parseCellAddress(range.start.display);
    const endCoords = parseCellAddress(range.end.display);
    
    return (
        cellCoords.rowIndex >= startCoords.rowIndex &&
        cellCoords.rowIndex <= endCoords.rowIndex &&
        cellCoords.colIndex >= startCoords.colIndex &&
        cellCoords.colIndex <= endCoords.colIndex
    );
}

/**
 * Validate Excel cell address format
 * @param address Address to validate
 * @returns True if valid Excel address
 */
export function isValidCellAddress(address: string): boolean {
    return /^[A-Z]+\d+$/.test(address);
}

/**
 * Validate Excel range format
 * @param range Range to validate
 * @returns True if valid Excel range
 */
export function isValidRange(range: string): boolean {
    const parts = range.split(':');
    return parts.length === 2 && 
           isValidCellAddress(parts[0]) && 
           isValidCellAddress(parts[1]);
}