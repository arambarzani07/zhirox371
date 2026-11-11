import type { Product } from '../types';

export interface CountLine {
  id: string;
  name: string;
  unit: Product['base_unit'];
  systemStock: number;
  counted: string;
}

export const storageKey = 'zhirox.demo.stock-count.040.v1';
export function loadDraft(): CountLine[] {
  try {
    const saved: unknown = JSON.parse(sessionStorage.getItem(storageKey) ?? '[]');
    if (!Array.isArray(saved)) return [];
    return saved.filter((line): line is CountLine => Boolean(line &&
      typeof line.id === 'string' && typeof line.name === 'string' &&
      ['unit', 'kg'].includes(line.unit) &&
      Number.isFinite(line.systemStock) && typeof line.counted === 'string'));
  } catch {
    return [];
  }
}

export function countedQuantity(line: CountLine) {
  const pattern = line.unit === 'kg' ? /^\d+(\.\d{1,3})?$/ : /^\d+$/;
  const amount = Number(line.counted);
  return pattern.test(line.counted) && Number.isSafeInteger(Math.round(amount * 1000))
    ? amount : null;
}

