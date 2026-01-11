# PowerSheet Backend

Python backend for PowerSheet with DuckDB native database.

## Setup

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate

# Linux/Mac
source venv/bin/activate

pip install -r requirements.txt
```

## Run Server

```bash
python main.py
```

Server will start on http://localhost:8000

## API Documentation

Interactive API docs available at: http://localhost:8000/docs

## Endpoints

- `POST /api/upload` - Upload CSV file
- `POST /api/query` - Execute SQL query
- `GET /api/schema` - Get table schema
- `POST /api/cell/update` - Update cell value
- `POST /api/row/insert` - Insert new row
- `DELETE /api/row/{id}` - Delete row
- `POST /api/column/insert` - Insert column
- `DELETE /api/column/{name}` - Delete column
- `POST /api/column/type` - Change column type
- `GET /api/health` - Health check
