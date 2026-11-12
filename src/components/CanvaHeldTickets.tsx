import { useState } from 'react';
import type { ReactNode } from 'react';
import type { ParkedCartEntry } from '../context/AppContext';
import type { CartLine } from '../types';
import { money } from '../utils/retailHelpers';
import { CanvaWorkspaceHeader } from './CanvaWorkspace';
import './canvaCashierAuxiliary.css';

export const cashierTicketNumbers = [1, 2, 3, 4, 5];
export const cashierTicketLabel = (number: number) => `پسووڵە ${String(number).padStart(2, '0')}`;

type Ticket = {
  key: number | string;
  number: number;
  label: string;
  items: CartLine[];
  parkedId?: string;
};

type Props = {
  active: number;
  children: ReactNode;
  cart: CartLine[];
  parked: ParkedCartEntry[];
  onBack: () => void;
  onResume: (number: number, parkedId?: string) => void;
  onClose: (parkedId?: string) => void;
};

export function CanvaHeldTickets({ active, cart, parked, onBack, onResume, onClose, children }: Props) {
  const tickets: Ticket[] = cashierTicketNumbers.map(number => {
    const label = cashierTicketLabel(number);
    const entry = number === active ? undefined : parked.find(ticket => ticket.label === label);
    return { key: number, number, label, items: number === active ? cart : entry?.items ?? [], parkedId: entry?.id };
  });
  const previousTickets = parked.filter(entry => !tickets.some(ticket => ticket.parkedId === entry.id)).map(entry => ({
    key: entry.id, number: active, label: entry.label, items: entry.items, parkedId: entry.id,
  }));
  const [selectedKey, setSelectedKey] = useState<number | string>(
    tickets.find(ticket => ticket.parkedId)?.key ?? previousTickets[0]?.key ?? active,
  );
  const selected = [...tickets, ...previousTickets].find(ticket => ticket.key === selectedKey) ?? tickets[active - 1];

  return (
    <section className="canva-detail canva-standard-view canva-held-tickets" data-canva-screen="005">
      <CanvaWorkspaceHeader title="پسووڵە ڕاگیراوەکان" actions={
        <button type="button" className="secondary" onClick={onBack}>گەڕانەوە بۆ فرۆشتن</button>
      } />
      {children}
      <section className="canva-detail__panel">
        <h2>پسووڵەکانی فرۆشتن</h2>
        <div className="canva-held-tickets__grid">
          {tickets.map(ticket => (
            <button key={ticket.key} type="button" aria-pressed={ticket.key === selected.key}
              onClick={() => setSelectedKey(ticket.key)}>
              <strong>{ticket.label}</strong>
              <span>{ticket.items.length} کاڵا</span>
              <bdi>{money(ticket.items.reduce((sum, item) => sum + item.price * item.qty, 0))}</bdi>
            </button>
          ))}
        </div>
        {previousTickets.length > 0 && <div className="canva-detail__actions">
          {previousTickets.map(ticket => <button type="button" className="secondary" key={ticket.key}
            aria-pressed={ticket.key === selected.key} onClick={() => setSelectedKey(ticket.key)}>{ticket.label}</button>)}
        </div>}
      </section>

      <section className="canva-detail__panel">
        <h2>وردەکاریی پسووڵەی هەڵبژێردراو</h2>
        <div className="section-workspace__table">
          <table>
            <thead><tr><th>ژمارە</th><th>ناوی کاڵا</th><th>یەکە</th><th>نرخ</th><th>بڕ</th><th>کۆ</th></tr></thead>
            <tbody>
              {selected.items.map((item, index) => (
                <tr key={item.id}>
                  <td>{index + 1}</td><td>{item.name}</td>
                  <td>{item.isScale ? 'کیلۆ' : item.mode === 'carton' ? 'کارتۆن' : 'دانە'}</td>
                  <td><bdi>{money(item.price)}</bdi></td><td>{item.qty}</td><td><bdi>{money(item.price * item.qty)}</bdi></td>
                </tr>
              ))}
              {selected.items.length === 0 && <tr><td colSpan={6} className="section-workspace__empty">سەبەتەکە بەتاڵە</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="canva-detail__actions">
          <button type="button" className="primary"
            onClick={() => onResume(selected.number, selected.parkedId)}>چوون بۆ کاشێر</button>
          <button type="button" className="secondary" disabled={selected.items.length === 0}
            onClick={() => {
              if (window.confirm(`${selected.label} بەبێ تۆمارکردن دابخرێت؟`)) onClose(selected.parkedId);
            }}>داخستنی پسووڵە</button>
        </div>
      </section>
    </section>
  );
}
