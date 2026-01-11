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
        schema = db.import_csv(str(file_path))
        
        return UploadResponse(
            tableName=schema["tableName"],
            rows=schema["rowCount"],
            columns=len(schema["columns"]),
            sizeMb=round(size_mb, 2)
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
        db.update_cell(request.table, request.rowId, request.column, request.value)
        
        return SuccessResponse(success=True, message="Cell updated")
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


@router.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "PowerSheet Backend"}
