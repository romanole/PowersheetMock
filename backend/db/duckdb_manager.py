import duckdb
from pathlib import Path
from typing import Optional, List, Dict, Any
import pandas as pd


class DuckDBManager:
    """Manager for DuckDB database operations with persistent storage"""
    
    def __init__(self, db_path: str = "../data/powersheet.db"):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(exist_ok=True)
        self.conn = duckdb.connect(str(self.db_path))
        self._ensure_sheet_metadata_table()
        print(f"[DuckDB] Connected to database: {self.db_path}")
    
    def execute_query(self, sql: str) -> pd.DataFrame:
        """Execute SQL query and return results as DataFrame"""
        try:
            result = self.conn.execute(sql).fetchdf()
            return result
        except Exception as e:
            print(f"[DuckDB] Query error: {e}")
            raise
    
    def get_schema(self, table_name: str = "main_dataset") -> Dict[str, Any]:
        """Get table schema information"""
        try:
            # Get column information
            columns_query = f"""
                SELECT column_name, data_type, is_nullable
                FROM information_schema.columns
                WHERE table_name = '{table_name}'
                ORDER BY ordinal_position
            """
            columns_df = self.conn.execute(columns_query).fetchdf()
            
            # Get row count
            count_query = f"SELECT COUNT(*) as count FROM {table_name}"
            row_count = self.conn.execute(count_query).fetchone()[0]
            
            columns = [
                {
                    "name": row["column_name"],
                    "type": row["data_type"],
                    "nullable": row["is_nullable"] == "YES"
                }
                for _, row in columns_df.iterrows()
            ]
            
            return {
                "tableName": table_name,
                "columns": columns,
                "rowCount": int(row_count)
            }
        except Exception as e:
            print(f"[DuckDB] Schema error: {e}")
            return None
    
    def import_csv(self, file_path: str, table_name: str = "main_dataset", 
                   column_types: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
        """Import CSV file into DuckDB table"""
        try:
            # Drop existing table if it exists
            self.conn.execute(f"DROP TABLE IF EXISTS {table_name}")
            
            # Import CSV
            if column_types:
                # With type casting
                type_casts = ", ".join([
                    f'TRY_CAST("{col}" AS {dtype}) AS "{col}"'
                    for col, dtype in column_types.items()
                ])
                self.conn.execute(f"""
                    CREATE TABLE {table_name} AS 
                    SELECT {type_casts}
                    FROM read_csv_auto('{file_path}')
                """)
            else:
                # Auto-detect types
                self.conn.execute(f"""
                    CREATE TABLE {table_name} AS 
                    SELECT * FROM read_csv_auto('{file_path}')
                """)
            
            # Get schema
            schema = self.get_schema(table_name)
            print(f"[DuckDB] Imported {schema['rowCount']} rows")
            
            return schema
        except Exception as e:
            print(f"[DuckDB] Import error: {e}")
            raise
    
    def update_cell(self, table_name: str, row_id: int, column: str, value: Any):
        """Update a single cell value"""
        # Assuming first column is the ID
        schema = self.get_schema(table_name)
        pk_column = schema["columns"][0]["name"]
        
        # Escape single quotes in value
        if isinstance(value, str):
            value = value.replace("'", "''")
            value = f"'{value}'"
        
        query = f"""
            UPDATE {table_name}
            SET "{column}" = {value}
            WHERE "{pk_column}" = {row_id}
        """
        self.conn.execute(query)
    
    def insert_row(self, table_name: str, position: int = None) -> int:
        """Insert a new row at specified position (0-indexed) or at end if position is None"""
        schema = self.get_schema(table_name)
        
        # Check if row_order column exists, if not add it
        has_row_order = any(col["name"] == "_row_order" for col in schema["columns"])
        
        if not has_row_order:
            # Add row_order column and populate with sequential values
            self.conn.execute(f"ALTER TABLE {table_name} ADD COLUMN _row_order INTEGER")
            self.conn.execute(f"""
                UPDATE {table_name} 
                SET _row_order = (SELECT ROW_NUMBER() OVER () - 1 FROM {table_name} t WHERE t.rowid = {table_name}.rowid)
            """)
            # Refresh schema
            schema = self.get_schema(table_name)
        
        # Determine insert position
        if position is None:
            position = schema["rowCount"]
        
        # Shift rows after insert position
        self.conn.execute(f"""
            UPDATE {table_name}
            SET _row_order = _row_order + 1
            WHERE _row_order >= {position}
        """)
        
        # Build insert query with NULL values for all columns except _row_order
        columns = [col["name"] for col in schema["columns"]]
        columns_str = ", ".join([f'"{col}"' for col in columns])
        values = []
        for col in columns:
            if col == "_row_order":
                values.append(str(position))
            else:
                values.append("NULL")
        values_str = ", ".join(values)
        
        query = f"""
            INSERT INTO {table_name} ({columns_str})
            VALUES ({values_str})
        """
        self.conn.execute(query)
        return schema["rowCount"] + 1
    
    def delete_row(self, table_name: str, row_id: int):
        """Delete a row by ID"""
        schema = self.get_schema(table_name)
        pk_column = schema["columns"][0]["name"]
        
        query = f"""
            DELETE FROM {table_name}
            WHERE "{pk_column}" = {row_id}
        """
        self.conn.execute(query)
    
    def insert_column(self, table_name: str, column_name: str, data_type: str = "VARCHAR"):
        """Add a new column"""
        query = f"""
            ALTER TABLE {table_name}
            ADD COLUMN "{column_name}" {data_type}
        """
        self.conn.execute(query)
    
    def delete_column(self, table_name: str, column_name: str):
        """Remove a column"""
        query = f"""
            ALTER TABLE {table_name}
            DROP COLUMN "{column_name}"
        """
        self.conn.execute(query)
    
    def change_column_type(self, table_name: str, column_name: str, new_type: str,
                          decimal_separator: str = "."):
        """Change column data type with optional decimal separator conversion"""
        schema = self.get_schema(table_name)
        
        # Build column list with type conversion
        new_columns = []
        for col in schema["columns"]:
            if col["name"] == column_name:
                if decimal_separator == "," and new_type.upper() in ["DOUBLE", "FLOAT", "DECIMAL"]:
                    # European format: replace . with empty, then , with .
                    new_columns.append(f"""
                        TRY_CAST(
                            REPLACE(REPLACE("{col['name']}", '.', ''), ',', '.') 
                            AS {new_type}
                        ) AS "{col['name']}"
                    """)
                else:
                    new_columns.append(f'TRY_CAST("{col["name"]}" AS {new_type}) AS "{col["name"]}"')
            else:
                new_columns.append(f'"{col["name"]}"')
        
        columns_str = ", ".join(new_columns)
        
        # Create new table with converted types
        self.conn.execute(f"""
            CREATE TABLE temp_new AS 
            SELECT {columns_str}
            FROM {table_name}
        """)
        

    
    def get_schema(self, table_name: str = "main_dataset") -> Dict[str, Any]:
        """Get table schema information"""
        try:
            # Get column information
            columns_query = f"""
                SELECT column_name, data_type, is_nullable
                FROM information_schema.columns
                WHERE table_name = '{table_name}'
                ORDER BY ordinal_position
            """
            columns_df = self.conn.execute(columns_query).fetchdf()
            
            # Get row count
            count_query = f"SELECT COUNT(*) as count FROM {table_name}"
            row_count = self.conn.execute(count_query).fetchone()[0]
            
            columns = [
                {
                    "name": row["column_name"],
                    "type": row["data_type"],
                    "nullable": row["is_nullable"] == "YES"
                }
                for _, row in columns_df.iterrows()
            ]
            
            return {
                "tableName": table_name,
                "columns": columns,
                "rowCount": int(row_count)
            }
        except Exception as e:
            print(f"[DuckDB] Schema error: {e}")
            return None
    
    def import_csv(self, file_path: str, table_name: str = "main_dataset", 
                   column_types: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
        """Import CSV file into DuckDB table"""
        try:
            # Drop existing table if it exists
            self.conn.execute(f"DROP TABLE IF EXISTS {table_name}")
            
            # Import CSV
            if column_types:
                # With type casting
                type_casts = ", ".join([
                    f'TRY_CAST("{col}" AS {dtype}) AS "{col}"'
                    for col, dtype in column_types.items()
                ])
                self.conn.execute(f"""
                    CREATE TABLE {table_name} AS 
                    SELECT {type_casts}
                    FROM read_csv_auto('{file_path}')
                """)
            else:
                # Auto-detect types
                self.conn.execute(f"""
                    CREATE TABLE {table_name} AS 
                    SELECT * FROM read_csv_auto('{file_path}')
                """)
            
            # Get schema
            schema = self.get_schema(table_name)
            print(f"[DuckDB] Imported {schema['rowCount']} rows")
            
            return schema
        except Exception as e:
            print(f"[DuckDB] Import error: {e}")
            raise
    
    def update_cell(self, table_name: str, row_id: int, column: str, value: Any):
        """Update a single cell value"""
        # Assuming first column is the ID
        schema = self.get_schema(table_name)
        pk_column = schema["columns"][0]["name"]
        
        # Escape single quotes in value
        if isinstance(value, str):
            value = value.replace("'", "''")
            value = f"'{value}'"
        
        query = f"""
            UPDATE {table_name}
            SET "{column}" = {value}
            WHERE "{pk_column}" = {row_id}
        """
        self.conn.execute(query)
    
    def insert_row(self, table_name: str, position: int = None) -> int:
        """Insert a new row at specified position (0-indexed) or at end if position is None"""
        schema = self.get_schema(table_name)
        
        # Check if row_order column exists, if not add it
        has_row_order = any(col["name"] == "_row_order" for col in schema["columns"])
        
        if not has_row_order:
            # Add row_order column and populate with sequential values
            self.conn.execute(f"ALTER TABLE {table_name} ADD COLUMN _row_order INTEGER")
            self.conn.execute(f"""
                UPDATE {table_name} 
                SET _row_order = (SELECT ROW_NUMBER() OVER () - 1 FROM {table_name} t WHERE t.rowid = {table_name}.rowid)
            """)
            # Refresh schema
            schema = self.get_schema(table_name)
        
        # Determine insert position
        if position is None:
            position = schema["rowCount"]
        
        # Shift rows after insert position
        self.conn.execute(f"""
            UPDATE {table_name}
            SET _row_order = _row_order + 1
            WHERE _row_order >= {position}
        """)
        
        # Build insert query with NULL values for all columns except _row_order
        columns = [col["name"] for col in schema["columns"]]
        columns_str = ", ".join([f'"{col}"' for col in columns])
        values = []
        for col in columns:
            if col == "_row_order":
                values.append(str(position))
            else:
                values.append("NULL")
        values_str = ", ".join(values)
        
        query = f"""
            INSERT INTO {table_name} ({columns_str})
            VALUES ({values_str})
        """
        self.conn.execute(query)
        return schema["rowCount"] + 1
    
    def delete_row(self, table_name: str, row_id: int):
        """Delete a row by ID"""
        schema = self.get_schema(table_name)
        pk_column = schema["columns"][0]["name"]
        
        query = f"""
            DELETE FROM {table_name}
            WHERE "{pk_column}" = {row_id}
        """
        self.conn.execute(query)
    
    def insert_column(self, table_name: str, column_name: str, data_type: str = "VARCHAR"):
        """Add a new column"""
        query = f"""
            ALTER TABLE {table_name}
            ADD COLUMN "{column_name}" {data_type}
        """
        self.conn.execute(query)
    
    def delete_column(self, table_name: str, column_name: str):
        """Remove a column"""
        query = f"""
            ALTER TABLE {table_name}
            DROP COLUMN "{column_name}"
        """
        self.conn.execute(query)
    
    def change_column_type(self, table_name: str, column_name: str, new_type: str,
                          decimal_separator: str = "."):
        """Change column data type with optional decimal separator conversion"""
        schema = self.get_schema(table_name)
        
        # Build column list with type conversion
        new_columns = []
        for col in schema["columns"]:
            if col["name"] == column_name:
                if decimal_separator == "," and new_type.upper() in ["DOUBLE", "FLOAT", "DECIMAL"]:
                    # European format: replace . with empty, then , with .
                    new_columns.append(f"""
                        TRY_CAST(
                            REPLACE(REPLACE("{col['name']}", '.', ''), ',', '.') 
                            AS {new_type}
                        ) AS "{col['name']}"
                    """)
                else:
                    new_columns.append(f'TRY_CAST("{col["name"]}" AS {new_type}) AS "{col["name"]}"')
            else:
                new_columns.append(f'"{col["name"]}"')
        
        columns_str = ", ".join(new_columns)
        
        # Create new table with converted types
        self.conn.execute(f"""
            CREATE TABLE temp_new AS 
            SELECT {columns_str}
            FROM {table_name}
        """)
        
        # Replace old table
        self.conn.execute(f"DROP TABLE {table_name}")
        self.conn.execute(f"ALTER TABLE temp_new RENAME TO {table_name}")
    
    def _get_duckdb_type(self, new_type: str) -> str:
        """Map common type names to DuckDB types"""
        type_mapping = {
            "TEXT": "VARCHAR",
            "STRING": "VARCHAR",
            "INTEGER": "INTEGER",
            "INT": "INTEGER",
            "FLOAT": "DOUBLE",
            "DOUBLE": "DOUBLE",
            "DECIMAL": "DECIMAL",
            "DATE": "DATE",
            "DATETIME": "TIMESTAMP",
            "TIMESTAMP": "TIMESTAMP",
            "BOOLEAN": "BOOLEAN"
        }
        
        return type_mapping.get(new_type.upper(), new_type.upper())
    
    def _ensure_sheet_metadata_table(self):
        """Create sheet_metadata and sheet_formulas tables if they don't exist"""
        self.conn.execute("""
            CREATE TABLE IF NOT EXISTS sheet_metadata (
                sheet_id VARCHAR PRIMARY KEY,
                sheet_name VARCHAR NOT NULL,
                table_name VARCHAR NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                row_count INTEGER DEFAULT 0,
                column_count INTEGER DEFAULT 0
            )
        """)
        
        self.conn.execute("""
            CREATE TABLE IF NOT EXISTS sheet_formulas (
                table_name VARCHAR,
                row_id VARCHAR,
                column_name VARCHAR,
                formula VARCHAR,
                PRIMARY KEY (table_name, row_id, column_name)
            )
        """)

    def update_cell(self, table_name: str, row_id: int, column: str, value: Any, formula: Optional[str] = None):
        """Update a single cell value and optionally its formula"""
        # Assuming first column is the ID
        schema = self.get_schema(table_name)
        pk_column = schema["columns"][0]["name"]
        
        # Escape single quotes in value
        if isinstance(value, str):
            value = value.replace("'", "''")
            value = f"'{value}'"
        
        # Update value in main table
        query = f"""
            UPDATE {table_name}
            SET "{column}" = {value}
            WHERE "{pk_column}" = {row_id}
        """
        self.conn.execute(query)

        # Handle formula persistence
        row_id_str = str(row_id) # Store row_id as string for consistency
        
        if formula:
            # Upsert formula
            # DuckDB supports INSERT OR REPLACE
            self.conn.execute(f"""
                INSERT OR REPLACE INTO sheet_formulas (table_name, row_id, column_name, formula)
                VALUES ('{table_name}', '{row_id_str}', '{column}', '{formula.replace("'", "''")}')
            """)
            print(f"[DuckDB] Saved formula for {table_name}:{row_id}:{column} -> {formula}")
        else:
            # Remove formula if it exists (since we are setting a value)
            # But wait, if we are just updating the calculated value, we might want to keep the formula?
            # No, usually if the frontend sends a value without a formula, it means it's a value override.
            # But if the frontend sends the calculated value OF a formula, it should also send the formula.
            # The frontend logic I wrote sends `formula` if it's a formula.
            
            # Check if we should delete. If formula is explicitly None, we might not want to delete?
            # Actually, let's assume if formula is NOT passed, we delete it (overwrite with value).
            # But wait, `update_cell` signature defaults `formula` to None.
            # If I just update a value, I should probably clear the formula.
            self.conn.execute(f"""
                DELETE FROM sheet_formulas 
                WHERE table_name = '{table_name}' AND row_id = '{row_id_str}' AND column_name = '{column}'
            """)

    def get_formulas(self, table_name: str) -> List[Dict[str, str]]:
        """Get all formulas for a table"""
        try:
            result = self.conn.execute(f"""
                SELECT row_id, column_name, formula 
                FROM sheet_formulas 
                WHERE table_name = '{table_name}'
            """).fetchall()
            
            return [
                {"rowId": row[0], "column": row[1], "formula": row[2]}
                for row in result
            ]
        except Exception:
            # Table might not exist or no formulas
            return []
    
    def create_sheet(self, sheet_name: str, cols: int = 20, rows: int = 1000) -> Dict[str, Any]:
        """Create a new sheet with specified dimensions"""
        import uuid
        
        sheet_id = str(uuid.uuid4())[:8]
        table_name = f"sheet_{sheet_id}"
        
        # Create column names: A, B, C, ..., Z, AA, AB...
        columns = []
        for i in range(cols):
            if i < 26:
                columns.append(f'col_{chr(65 + i)}')  # A-Z
            else:
                first = chr(65 + (i // 26) - 1)
                second = chr(65 + (i % 26))
                columns.append(f'col_{first}{second}')  # AA, AB, etc.
        
        # Create table
        col_defs = ', '.join([f'"{col}" VARCHAR' for col in columns])
        self.conn.execute(f"CREATE TABLE {table_name} ({col_defs})")
        
        # Insert empty rows
        for _ in range(rows):
            self.conn.execute(f"INSERT INTO {table_name} DEFAULT VALUES")
        
        # Store metadata
        self.conn.execute(f"""
            INSERT INTO sheet_metadata (sheet_id, sheet_name, table_name, row_count, column_count)
            VALUES ('{sheet_id}', '{sheet_name}', '{table_name}', {rows}, {cols})
        """)
        
        print(f"[DuckDB] Created sheet: {sheet_name} ({table_name}) with {rows} rows × {cols} columns")
        
        return {
            'id': sheet_id,
            'name': sheet_name,
            'tableName': table_name,
            'rowCount': rows,
            'columnCount': cols
        }
    
    def list_sheets(self) -> List[Dict[str, Any]]:
        """List all sheets, migrating legacy main_dataset if needed"""
        
        # Check if main_dataset exists but is not in metadata
        try:
            # Check if main_dataset table exists
            table_exists = self.conn.execute("""
                SELECT count(*) FROM information_schema.tables 
                WHERE table_name = 'main_dataset'
            """).fetchone()[0] > 0
            
            # Check if it's already in metadata
            is_tracked = self.conn.execute("""
                SELECT count(*) FROM sheet_metadata 
                WHERE table_name = 'main_dataset'
            """).fetchone()[0] > 0
            
            if table_exists and not is_tracked:
                print("[DuckDB] Found legacy main_dataset, migrating to sheet...")
                import uuid
                
                # Get stats
                row_count = self.conn.execute("SELECT COUNT(*) FROM main_dataset").fetchone()[0]
                col_count = self.conn.execute("SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'main_dataset'").fetchone()[0]
                
                sheet_id = str(uuid.uuid4())[:8]
                
                # Add to metadata
                self.conn.execute(f"""
                    INSERT INTO sheet_metadata (sheet_id, sheet_name, table_name, row_count, column_count)
                    VALUES ('{sheet_id}', 'Imported Data', 'main_dataset', {row_count}, {col_count})
                """)
        except Exception as e:
            print(f"[DuckDB] Migration check failed: {e}")

        result = self.conn.execute("""
            SELECT sheet_id, sheet_name, table_name, row_count, column_count
            FROM sheet_metadata
            ORDER BY created_at
        """).fetchall()
        
        return [
            {
                'id': row[0],
                'name': row[1],
                'tableName': row[2],
                'rowCount': row[3],
                'columnCount': row[4]
            }
            for row in result
        ]
    
    def delete_sheet(self, sheet_id: str):
        """Delete a sheet and its data"""
        # Get table name
        result = self.conn.execute(
            f"SELECT table_name FROM sheet_metadata WHERE sheet_id = '{sheet_id}'"
        ).fetchone()
        
        if not result:
            raise ValueError(f"Sheet with ID {sheet_id} not found")
        
        table_name = result[0]
        
        # Drop table
        self.conn.execute(f"DROP TABLE IF EXISTS {table_name}")
        
        # Remove metadata
        self.conn.execute(f"DELETE FROM sheet_metadata WHERE sheet_id = '{sheet_id}'")
        
        print(f"[DuckDB] Deleted sheet: {sheet_id} ({table_name})")
    
    def rename_sheet(self, sheet_id: str, new_name: str) -> Dict[str, Any]:
        """Rename a sheet"""
        self.conn.execute(f"""
            UPDATE sheet_metadata
            SET sheet_name = '{new_name}'
            WHERE sheet_id = '{sheet_id}'
        """)
        
        # Return updated sheet info
        result = self.conn.execute(f"""
            SELECT sheet_id, sheet_name, table_name, row_count, column_count
            FROM sheet_metadata
            WHERE sheet_id = '{sheet_id}'
        """).fetchone()
        
        if not result:
            raise ValueError(f"Sheet with ID {sheet_id} not found")
        
        print(f"[DuckDB] Renamed sheet {sheet_id} to: {new_name}")
        
        return {
            'id': result[0],
            'name': result[1],
            'tableName': result[2],
            'rowCount': result[3],
            'columnCount': result[4]
        }
    
    def close(self):
        """Close database connection"""
        self.conn.close()
        print("[DuckDB] Connection closed")


# Singleton instance
_db_instance: Optional[DuckDBManager] = None


def get_db() -> DuckDBManager:
    """Get or create DuckDB manager instance"""
    global _db_instance
    if _db_instance is None:
        _db_instance = DuckDBManager()
    return _db_instance
