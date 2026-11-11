import type { ReactNode } from 'react';
import './canvaStockOverview036.css';

interface Props {
  number: string;
  title: string;
  listTitle: string;
  summaryTitle: string;
  filters: ReactNode;
  children: ReactNode;
  note: ReactNode;
  summary: ReactNode;
  actions: ReactNode;
  onHome: () => void;
}

export function CanvaStockFrame({
  number, title, listTitle, summaryTitle, filters, children, note, summary, actions, onHome,
}: Props) {
  const id = `stock-${number}`;
  return (
    <section className="canva-stock-036" data-canva-screen={number} dir="rtl" aria-labelledby={`${id}-title`}>
      <header className="stock-036-heading">
        <h1 id={`${id}-title`}>{title}</h1>
        <span>کۆگا و بەسەرچوون</span>
        <button type="button" onClick={onHome}>ماڵەوە</button>
      </header>
      <div className="stock-036-layout">
        <section className="stock-036-list" aria-labelledby={`${id}-list`}>
          <h2 id={`${id}-list`}>{listTitle}</h2>
          {filters}
          {children}
          <p className="stock-036-note">{note}</p>
        </section>
        <aside className="stock-036-summary" aria-labelledby={`${id}-summary`}>
          <h2 id={`${id}-summary`}>{summaryTitle}</h2>
          {summary}
          <div className="stock-036-actions">{actions}</div>
        </aside>
      </div>
    </section>
  );
}

export function CanvaStockTable({ columns, children }: { columns: string[]; children: ReactNode }) {
  return (
    <div className="stock-036-table" role="region" aria-label="ئەنجامەکان" tabIndex={0}>
      <table>
        <thead><tr>{columns.map(column => <th key={column} scope="col">{column}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
