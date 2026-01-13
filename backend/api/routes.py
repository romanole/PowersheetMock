from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
from api.models import *
from db.duckdb_manager import get_db
import time
import os
from pathlib import Path

router = APIRouter()


@router.post("/upload", response_model=UploadResponse)
async def upload_file(file: UploadFile = File(...)):
    """Upload and import CSV file"""
    try:
        # Save uploaded file temporarily
        upload_dir = Path("../data/uploads")
        upload_dir.mkdir(exist_ok=True)
        file_path = upload_dir / file.filename
        
        with open(file_path, "wb") as f:
            content = await file.read()
            f.write(content)
        
        # Get file size
        size_mb = len(content) / (1024 * 1024)
        
        # Import to DuckDB
        db = get_db()
        
        # Generate unique sheet ID and table name
        import uuid
        sheet_id = str(uuid.uuid4())[:8]
        table_name = f"sheet_{sheet_id}"
        sheet_name = file.filename.rsplit('.', 1)[0][:30]  # Use filename as sheet name, max 30 chars
        
        # Import into new table
        schema = db.import_csv(str(file_path), table_name=table_name)
        
        # Register in sheet_metadata
        db.conn.execute(f"""
            INSERT INTO sheet_metadata (sheet_id, sheet_name, table_name, row_count, column_count)
            VALUES ('{sheet_id}', '{sheet_name}', '{table_name}', {schema["rowCount"]}, {len(schema["columns"])})
        """)
        
        return UploadResponse(
            tableName=schema["tableName"],
            rows=schema["rowCount"],
            columns=len(schema["columns"]),
            sizeMb=round(size_mb, 2),
            sheetId=sheet_id,
            sheetName=sheet_name
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/query", response_model=QueryResponse)
async def execute_query(request: QueryRequest):
    """Execute SQL query"""
    try:
        start_time = time.time()
        
        db = get_db()
        result_df = db.execute_query(request.sql)
        
        execution_time = time.time() - start_time
        
        return QueryResponse(
            columns=result_df.columns.tolist(),
            rows=result_df.values.tolist(),
            rowCount=len(result_df),
            executionTime=round(execution_time, 3)
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/schema", response_model=SchemaResponse)
async def get_schema(table: str = "main_dataset"):
    """Get table schema"""
    try:
        db = get_db()
        schema = db.get_schema(table)
        
        if schema is None:
            raise HTTPException(status_code=404, detail=f"Table '{table}' not found")
        
        return SchemaResponse(**schema)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cell/update", response_model=SuccessResponse)
async def update_cell(request: CellUpdateRequest):
    """Update single cell value"""
    try:
        db = get_db()
        db.update_cell(request.table, request.rowId, request.column, request.value, request.formula)
        
        return SuccessResponse(success=True, message="Cell updated")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/formulas")
async def get_formulas(table: str):
    """Get all formulas for a table"""
    try:
        db = get_db()
        formulas = db.get_formulas(table)
        return formulas
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/row/insert", response_model=SuccessResponse)
async def insert_row(table: str = "main_dataset", position: int = None):
    """Insert new row at specified position (0-indexed) or at end if position is None"""
    try:
        db = get_db()
        new_row_count = db.insert_row(table, position)
        
        return SuccessResponse(
            success=True,
            message=f"Row inserted at position {position if position is not None else 'end'}. Total rows: {new_row_count}"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/row/{row_id}", response_model=SuccessResponse)
async def delete_row(row_id: int, table: str = "main_dataset"):
    """Delete row by ID"""
    try:
        db = get_db()
        db.delete_row(table, row_id)
        
        return SuccessResponse(success=True, message="Row deleted")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/column/insert", response_model=SuccessResponse)
async def insert_column(request: ColumnInsertRequest):
    """Insert new column"""
    try:
        db = get_db()
        db.insert_column(request.table, request.columnName, request.dataType)
        
        return SuccessResponse(success=True, message="Column inserted")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/column/{column_name}", response_model=SuccessResponse)
async def delete_column(column_name: str, table: str = "main_dataset"):
    """Delete column"""
    try:
        db = get_db()
        db.delete_column(table, column_name)
        
        return SuccessResponse(success=True, message="Column deleted")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/column/type", response_model=SuccessResponse)
async def change_column_type(request: ColumnTypeRequest):
    """Change column data type"""
    try:
        db = get_db()
        db.change_column_type(
            request.table,
            request.column,
            request.newType,
            request.decimalSeparator
        )
        
        return SuccessResponse(success=True, message="Column type changed")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sheets", response_model=List[SheetResponse])
async def list_sheets():
    """List all available sheets"""
    try:
        db = get_db()
        sheets = db.list_sheets()
        return sheets
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sheets/create", response_model=SheetResponse)
async def create_sheet(request: CreateSheetRequest):
    """Create a new sheet"""
    try:
        db = get_db()
        sheet = db.create_sheet(request.name, request.columns, request.rows)
        return sheet
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/sheets/{sheet_id}", response_model=SuccessResponse)
async def delete_sheet(sheet_id: str):
    """Delete a sheet"""
    try:
        db = get_db()
        db.delete_sheet(sheet_id)
        return SuccessResponse(success=True, message="Sheet deleted")
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/sheets/{sheet_id}/rename", response_model=SheetResponse)
async def rename_sheet(sheet_id: str, request: RenameSheetRequest):
    """Rename a sheet"""
    try:
        db = get_db()
        sheet = db.rename_sheet(sheet_id, request.newName)
        return sheet
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "PowerSheet Backend"}
