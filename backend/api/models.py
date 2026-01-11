from pydantic import BaseModel
from typing import List, Dict, Any, Optional


class QueryRequest(BaseModel):
    """Request model for SQL query execution"""
    sql: str
    timeout: Optional[int] = 30


class QueryResponse(BaseModel):
    """Response model for query results"""
    columns: List[str]
    rows: List[List[Any]]
    rowCount: int
    executionTime: float


class SchemaResponse(BaseModel):
    """Response model for table schema"""
    tableName: str
    columns: List[Dict[str, Any]]
    rowCount: int


class UploadResponse(BaseModel):
    """Response model for file upload"""
    tableName: str
    rows: int
    columns: int
    sizeMb: float


class CellUpdateRequest(BaseModel):
    """Request model for cell update"""
    table: str
    rowId: int
    column: str
    value: Any


class ColumnTypeRequest(BaseModel):
    """Request model for column type change"""
    table: str
    column: str
    newType: str
    decimalSeparator: Optional[str] = "."


class ColumnInsertRequest(BaseModel):
    """Request model for column insertion"""
    table: str
    columnName: str
    dataType: Optional[str] = "VARCHAR"


class SuccessResponse(BaseModel):
    """Generic success response"""
    success: bool
    message: Optional[str] = None
