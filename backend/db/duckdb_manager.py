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
        
        # Replace old table
        self.conn.execute(f"DROP TABLE {table_name}")
        self.conn.execute(f"ALTER TABLE temp_new RENAME TO {table_name}")
    
    def close(self):
        """Close database connection"""
        self.conn.close()
        print("[DuckDB] Connection closed")


# Global instance
db_manager: Optional[DuckDBManager] = None

def get_db() -> DuckDBManager:
    """Get or create database manager instance"""
    global db_manager
    if db_manager is None:
        db_manager = DuckDBManager()
    return db_manager
