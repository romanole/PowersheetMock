# PowerSheet

High-performance web-based spreadsheet application with Python backend and React frontend.

## Project Structure

```
PowersheetMock/
├── frontend/           # React + TypeScript + Vite
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── vite.config.ts
│
├── backend/            # Python + FastAPI + DuckDB
│   ├── main.py
│   ├── api/
│   ├── db/
│   └── requirements.txt
│
├── data/              # Database storage (gitignored)
│   └── powersheet.db
│
└── README.md
```

## Quick Start

### Backend Setup

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate

# Linux/Mac
source venv/bin/activate

pip install -r requirements.txt
python main.py
```

Backend will run on http://localhost:8000

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Frontend will run on http://localhost:5173

## Features

- ✅ Large file support (2GB+)
- ✅ DuckDB native performance  
- ✅ Persistent data storage
- ✅ Excel-style editing
- ✅ Column type conversion
- ✅ Row/column operations
- ✅ Multi-sheet support (coming soon)

## API Documentation

Interactive API docs: http://localhost:8000/docs

## Development

Both frontend and backend need to run simultaneously in separate terminals.
