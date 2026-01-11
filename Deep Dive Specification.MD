InfinitySheet: Deep Dive Specification for Top 20 Features
Context: Technical detailed instructions for implementing the core functionality of a high-performance, browser-based spreadsheet using DuckDB Wasm.
GLOBAL REQUIREMENT: Persistence & State Management
* Critical: All data must be persistent. The browser session is volatile, so the application MUST use OPFS (Origin Private File System) to store the DuckDB database file (.duckdb) locally on the user's device.
* Behavior:
o Auto-Save: Every UPDATE, INSERT, or ALTER command must commit to the OPFS file.
o Session Restore: On page reload, the app must check for an existing DB in OPFS and mount it immediately, restoring the user's last view without re-parsing CSVs.
o Fast Load: Support importing/exporting the raw binary .duckdb file for instant state restoration on different machines.
Phase 1: Core Grid & Ingestion (P0 - Critical)
1. Ingestion Engine & Session Restore
* User Story: As a user, I want to drag a 500MB CSV file and see it load instantly. If I close and reopen the tab, my data must still be there.
* Technical Implementation:
o Initialization: Check OPFS for infinity_sheet.duckdb. If exists, mount and run ATTACH 'infinity_sheet.duckdb' AS db.
o New File: On drop, stream raw File to OPFS. Execute CREATE OR REPLACE TABLE main_dataset AS SELECT * FROM read_csv_auto(...).
o Metadata: Immediately run DESCRIBE main_dataset to cache schema.
2. Virtual Infinite Scroll
* User Story: As a user, I want to scroll through 1 million rows without the browser tab freezing.
* Technical Implementation:
o Virtualizer: Use tanstack/react-virtual logic. Calculate total height = total_rows * row_height_px.
o Fetching Strategy: Calculate startIndex and endIndex based on scroll position.
o SQL: SELECT * FROM main_dataset LIMIT {limit} OFFSET {offset}.
o Optimization: Implement a "Debounce" (wait 50-100ms after scroll stops) before firing the SQL query.
3. Typed Columns & Alignment
* User Story: I want numbers to align right and text to align left automatically so the data is readable.
* Technical Implementation:
o Detection: Map DuckDB types (BIGINT, DOUBLE, VARCHAR, DATE) to UI alignment rules.
o Formatting:
* DOUBLE -> Intl.NumberFormat (e.g., 1,234.56).
* DATE -> YYYY-MM-DD (ISO format).
o UI: Add a small icon in the column header indicating type.
4. Multi-Level Sorting
* User Story: I want to sort by Region, and within each Region, sort by Sales descending.
* Technical Implementation:
o State: Maintain an array of sort objects: [{ col: 'region', dir: 'ASC' }, { col: 'sales', dir: 'DESC' }].
o UI: Clicking a header cycles: No Sort -> ASC -> DESC -> No Sort. Shift-Click appends to the sort array.
o SQL: Dynamically build the clause: ORDER BY region ASC, sales DESC.
Phase 2: Data Wrangling (P1 - High Value)
5. Global Search & Auto-Filter
* User Story: I want to click a funnel icon on the "Status" column and select only "Shipped" and "Pending".
* Technical Implementation:
o Dropdown Data: Run SELECT DISTINCT status FROM main_dataset LIMIT 100 to populate the list.
o Applying Filter: Update the main grid query to SELECT * FROM main_dataset WHERE status IN ('Shipped', 'Pending') LIMIT....
6. Bulk Edit (Fill Down)
* User Story: I want to correct a typo in the "Category" column for 500 rows at once.
* Technical Implementation:
o Selection: Allow user to filter rows first (e.g., Filter Category='Typo').
o Action: "Update All Visible".
o SQL: UPDATE main_dataset SET category = 'Corrected' WHERE category = 'Typo'.
7. Find & Replace
* User Story: Replace all instances of NULL in the "Discount" column with 0.
* Technical Implementation:
o UI: Modal with "Find what", "Replace with", and "Target Column".
o SQL: UPDATE main_dataset SET discount = 0 WHERE discount IS NULL OR UPDATE main_dataset SET city = REPLACE(city, 'Old', 'New').
8. Remove Duplicates
* User Story: I have a list of transactions, but some are duplicated. I want to keep only unique Transaction IDs.
* Technical Implementation:
o Action: User selects columns that define uniqueness.
o SQL:
1. CREATE TABLE temp_dedup AS SELECT DISTINCT * FROM main_dataset.
2. DROP TABLE main_dataset.
3. ALTER TABLE temp_dedup RENAME TO main_dataset.
9. Text-to-Columns (Split)
* User Story: The "Full Name" column has "John Doe". I want two columns: "First" and "Last".
* Technical Implementation:
o SQL: ALTER TABLE main_dataset ADD COLUMN first_name VARCHAR; UPDATE main_dataset SET first_name = str_split(full_name, ' ')[1].
Phase 3: The Calculation Engine (P2 - Logic)
10. Computed Columns (Math)
* User Story: I want a column "Total" that is always "Price * Qty".
* Technical Implementation:
o Concept: "Virtual Columns".
o SQL: ALTER TABLE main_dataset ADD COLUMN total DOUBLE; UPDATE main_dataset SET total = price * quantity.
11. Conditional Logic (IF/CASE)
* User Story: Create a "Priority" column. If Sales > 1000 it's "High", otherwise "Standard".
* Technical Implementation:
o SQL Generator: UPDATE main_dataset SET priority = CASE WHEN sales > 1000 THEN 'High' ELSE 'Standard' END.
12. Date Intelligence
* User Story: I have a daily date. I need a "Month" column to group by in the pivot table.
* Technical Implementation:
o SQL: ALTER TABLE main_dataset ADD COLUMN sales_month VARCHAR; UPDATE main_dataset SET sales_month = strftime(sale_date, '%Y-%m').
13. Smart JOIN (VLOOKUP Replacement)
* User Story: I have Sales Data. I upload "Product Master". I want to bring "Name" into Sales Data based on SKU.
* Technical Implementation:
o SQL: CREATE TABLE joined AS SELECT a.*, b.product_name FROM main_dataset a LEFT JOIN product_master b ON a.sku = b.sku;.
14. Aggregations (Status Bar)
* User Story: Select a range of cells and see the Sum/Avg immediately at the bottom.
* Technical Implementation:
o Solution: Calculate on loaded data in React state, or run async SELECT SUM(col) for column selection.
Phase 4: Analytics & Output (P3 - Insight)
15. Instant Pivot Tables
* User Story: Drag "Region" to Rows, "Date" to Columns, "Sales" to Values. See the matrix.
* Technical Implementation:
o SQL: PIVOT main_dataset ON sale_year USING SUM(sales) GROUP BY region.
16. Drill-Down
* User Story: The Pivot says "North Region" has $50k sales. Double click $50k to see those exact transactions.
* Technical Implementation:
o Action: Capture keys (Region='North', Year='2023').
o SQL: SELECT * FROM main_dataset WHERE region = 'North' AND year = '2023'.
17. Grouping (Subtotals)
* User Story: In the main grid, show me rows grouped by "Category" with a collapsible header.
* Technical Implementation:
o Approach: Render group headers based on SELECT category, COUNT(*) FROM ... GROUP BY category. Insert rows on expansion.
18. Scenario Manager
* User Story: I want to raise prices by 10% to see the impact, but keep the original data safe.
* Technical Implementation:
o Snapshot: CREATE TABLE scenario_1 AS SELECT * FROM main_dataset.
o Switching: UI dropdown to switch the table name used in queries.
19. Filtered Export
* User Story: I have filtered for "Q4 Sales". I want to download just that as CSV.
* Technical Implementation:
o SQL: COPY (SELECT * FROM main_dataset WHERE ...) TO 'export.csv' (HEADER, DELIMITER ',').
20. Freeze Panes (Sticky Headers/Columns)
* User Story: When I scroll right to see "December Sales", I need to keep the "Product Name" column visible on the left.
* Technical Implementation:
o Priority: Moved to end as requested (UX enhancement).
o CSS: Use position: sticky.

