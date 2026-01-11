Progetto: InfinitySheet - Spreadsheet ad Alte Prestazioni
Obiettivo
Creare un'applicazione web stile foglio di calcolo capace di gestire dataset oltre 1 milione di righe (fino a 10M+) interamente nel browser, mantenendo performance fluide (60fps) e funzionalità analitiche avanzate.
Stack Tecnologico Richiesto
Frontend Framework: React 18+ (Vite)
State Management: Zustand o Signals (per performance reattive granulari)
Database Engine: DuckDB Wasm (WebAssembly)
Styling: Tailwind CSS
Icons: Lucide-React
Charts: Recharts o Visx
Data Grid: Implementazione Custom Virtualizzata (non usare librerie pesanti come AG-Grid per questo PoC, vogliamo il controllo totale sul rendering).
Architettura Core
1. Ingestion dei Dati (The "Lake")
L'utente deve poter trascinare file CSV o Parquet giganti.
Azione: Il file non viene parsato in JSON. Viene passato come File object direttamente a DuckDB Wasm per creare una tabella virtuale.
Output: Schema della tabella (nomi colonne, tipi) e conteggio righe (SELECT COUNT(*) FROM table).
2. La Virtual Grid (The "View")
Creare un container con altezza calcolata: Totale Righe * Altezza Riga fissa (es. 24px).
Implementare un listener sullo scroll.
Calcolare l'intervallo visibile (es. startRow: 1000, endRow: 1050).
Fetch: Eseguire una query SQL asincrona dinamica:
SELECT * FROM dataset LIMIT 50 OFFSET 1000.
Rendering solo dei div visibili posizionati in assoluto o tramite trasformate CSS.
3. Gestione Formule (The "Engine")
Approccio Ibrido:
Cella Singola: Permettere editing diretto che fa un UPDATE sul DB.
Colonna Calcolata: Invece di formule stile Excel (=A1+B1), implementare un sistema "Computed Column" stile Pandas/SQL.
Esempio UX: L'utente aggiunge colonna "Totale". La formula è price * quantity.
Backend: ALTER TABLE dataset ADD COLUMN totale DOUBLE; UPDATE dataset SET totale = price * quantity.
4. Pivot e Grafici (The "Analytics")
Pannello laterale per aggregazioni.
UX: Drag & drop delle colonne in "Dimensioni" (GroupBy) e "Metriche" (Aggregations).
Query generata: SELECT category, SUM(sales) FROM dataset GROUP BY category.
Il risultato (spesso piccolo, <1000 righe) viene passato a una libreria di grafici standard.
Istruzioni Passo-Passo per l'AI Coder
Setup DuckDB: Inizializza il worker asincrono di DuckDB Wasm. Gestisci il caricamento del bundle .wasm.
Grid Skeleton: Crea un div con scroll infinito simulato. Assicurati che lo scroll bar rifletta 1M+ di righe.
Data Binding: Collega lo scroll event alle query LIMIT/OFFSET di DuckDB. Implementa un debounce leggero per non intasare il worker durante lo scroll veloce.
UI Layer: Aggiungi header delle colonne ridimensionabili e una barra delle formule in alto.
Chart Layer: Aggiungi un overlay o un pannello split-screen per visualizzare i risultati delle query di aggregazione.