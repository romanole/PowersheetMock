# PowerSheet

High-performance web-based spreadsheet application capable of handling 1M+ rows using React, DuckDB Wasm, and OPFS persistence.

## Features

- 🚀 **Performance**: Handle 1M+ rows at 60fps with virtual scrolling
- 📊 **Analytics**: Built-in pivot tables and charts
- 🔢 **Formulas**: Excel-compatible formulas (380+ functions via HyperFormula)
- 💾 **Persistence**: Auto-save with OPFS (Origin Private File System)
- 🔍 **Data Wrangling**: Sort, filter, find/replace, remove duplicates
- 📈 **Visualizations**: Interactive charts with Recharts

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Database**: DuckDB Wasm (OLAP engine in browser)
- **Formulas**: HyperFormula (Excel-compatible)
- **State**: Zustand
- **Styling**: Tailwind CSS
- **Icons**: Lucide React

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## Development

```bash
# Run tests
npm test

# Run integration tests
npm run test:integration

# Generate test data
npm run generate-test-data -- --rows 1000000
```

## Documentation

See the `/docs` folder for detailed specifications:
- [Implementation Plan](docs/implementation_plan.md)
- [Architecture Overview](docs/architecture.md)
- [Formula System](docs/formula_system_spec.md)

## License

MIT
