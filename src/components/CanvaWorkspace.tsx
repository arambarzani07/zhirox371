import type { ReactNode } from 'react';
import { useApp } from '../context/AppContext';
import './sectionWorkspace.css';

export function CanvaWorkspaceHeader({
  title, category, actions,
}: { title: string; category?: string; actions?: ReactNode }) {
  const { navigateTo } = useApp();

  return (
    <header className="section-workspace__header">
      <h1>{title}</h1>
      <span className="section-workspace__breadcrumb">{category}</span>
      <div className="section-workspace__actions">
        {actions}
        <button type="button" className="secondary section-workspace__home-btn"
          onClick={() => navigateTo('home')}>ماڵەوە</button>
      </div>
    </header>
  );
}

export function CanvaWorkspace({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="section-workspace" dir="rtl" aria-label={title}>
      <CanvaWorkspaceHeader title={title} />
      <div className="section-workspace__live">{children}</div>
    </section>
  );
}
