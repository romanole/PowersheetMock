// Script to generate large test CSV files
// Usage: node scripts/generateTestData.js --rows 3000000

const fs = require('fs');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
const rowsIndex = args.indexOf('--rows');
const numRows = rowsIndex !== -1 ? parseInt(args[rowsIndex + 1]) : 1000000;

console.log(`Generating CSV with ${numRows.toLocaleString()} rows...`);

const outputDir = path.join(__dirname, '..', 'test-data');
const outputFile = path.join(outputDir, `test_data_${numRows}.csv`);

// Create output directory if it doesn't exist
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

// Column definitions
const columns = [
    'id',
    'product_name',
    'category',
    'subcategory',
    'sale_date',
    'region',
    'country',
    'quantity',
    'unit_price',
    'total',
    'discount',
    'tax',
    'grand_total',
    'customer_id',
    'status'
];

// Sample data pools
const products = [
    'Laptop Pro 15', 'Mouse Wireless', 'Keyboard Mechanical', 'Monitor 4K',
    'Webcam HD', 'Headphones Premium', 'Phone Stand', 'USB Hub',
    'SSD 1TB', 'RAM 16GB', 'GPU RTX', 'CPU i9', 'Motherboard',
    'Desk Chair', 'Standing Desk', 'Lamp LED'
];

const categories = ['Electronics', 'Office', 'Furniture', 'Accessories', 'Components'];
const subcategories = ['Premium', 'Standard', 'Budget', 'Professional', 'Gaming'];
const regions = ['North America', 'Europe', 'Asia', 'South America', 'Africa'];
const countries = ['USA', 'UK', 'Germany', 'France', 'Japan', 'Brazil', 'India', 'China'];
const statuses = ['Completed', 'Pending', 'Shipped', 'Cancelled', 'Refunded'];

// Helper functions
function randomItem(array) {
    return array[Math.floor(Math.random() * array.length)];
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min, max, decimals = 2) {
    return (Math.random() * (max - min) + min).toFixed(decimals);
}

function randomDate(start, end) {
    const date = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
    return date.toISOString().split('T')[0];
}

// Create write stream
const stream = fs.createWriteStream(outputFile);

// Write header
stream.write(columns.join(',') + '\n');

// Generate data in chunks to avoid memory issues
const chunkSize = 10000;
let rowsWritten = 0;
const startDate = new Date('2023-01-01');
const endDate = new Date('2024-12-31');

console.log('Writing data...');

function writeChunk() {
    let chunk = '';
    const rowsToWrite = Math.min(chunkSize, numRows - rowsWritten);

    for (let i = 0; i < rowsToWrite; i++) {
        const id = rowsWritten + i + 1;
        const product = randomItem(products);
        const category = randomItem(categories);
        const subcategory = randomItem(subcategories);
        const saleDate = randomDate(startDate, endDate);
        const region = randomItem(regions);
        const country = randomItem(countries);
        const quantity = randomInt(1, 100);
        const unitPrice = randomFloat(10, 5000);
        const total = (quantity * parseFloat(unitPrice)).toFixed(2);
        const discount = randomFloat(0, parseFloat(total) * 0.2);
        const subtotal = (parseFloat(total) - parseFloat(discount)).toFixed(2);
        const tax = (parseFloat(subtotal) * 0.2).toFixed(2);
        const grandTotal = (parseFloat(subtotal) + parseFloat(tax)).toFixed(2);
        const customerId = `CUST${String(randomInt(1, 10000)).padStart(6, '0')}`;
        const status = randomItem(statuses);

        chunk += [
            id,
            product,
            category,
            subcategory,
            saleDate,
            region,
            country,
            quantity,
            unitPrice,
            total,
            discount,
            tax,
            grandTotal,
            customerId,
            status
        ].join(',') + '\n';
    }

    stream.write(chunk);
    rowsWritten += rowsToWrite;

    // Progress update
    if (rowsWritten % 100000 === 0 || rowsWritten === numRows) {
        const progress = ((rowsWritten / numRows) * 100).toFixed(1);
        console.log(`Progress: ${rowsWritten.toLocaleString()} / ${numRows.toLocaleString()} (${progress}%)`);
    }

    // Continue or finish
    if (rowsWritten < numRows) {
        // Use setImmediate to avoid blocking event loop
        setImmediate(writeChunk);
    } else {
        stream.end();
        console.log(`\n✅ CSV file created successfully!`);
        console.log(`📁 Location: ${outputFile}`);

        // Get file size
        const stats = fs.statSync(outputFile);
        const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        console.log(`📊 File size: ${fileSizeMB} MB`);
        console.log(`📈 Rows: ${numRows.toLocaleString()}`);
        console.log(`🔢 Columns: ${columns.length}`);
    }
}

// Start writing
writeChunk();
