export type SaleMode = 'unit' | 'carton' | 'both';
export type BaseUnit = 'unit' | 'kg';

export interface CartonConfig {
  name: string | null;
  barcode: string;
  alias_barcodes: string[];
  units_per_carton: number;
  purchase_price_iqd: number | null;
  sale_price_iqd: number;
}

export interface Product {
  id: string;
  name: string;
  sku: string | null;
  plu: string | null;
  sale_mode: SaleMode;
  base_unit: BaseUnit;
  unit_barcode: string;
  unit_purchase_price_iqd: number | null;
  unit_sale_price_iqd: number;
  unit_alias_barcodes: string[];
  carton: CartonConfig | null;
  stock: number; // in base units (pieces or kg)
  min_stock?: number;
  category?: string;
  expiry_date?: string | null;
  is_scale_product?: boolean;
}

export interface CartLine {
  id: string; // unique line key
  productId: string;
  name: string;
  barcode: string;
  mode: 'unit' | 'carton';
  price: number; // IQD per line unit
  qty: number;
  units: number; // base units per package (e.g. 1 for unit, 12 for carton, or 0.750 for scale kg)
  isScale: boolean;
  scaleGrams?: number;
  available: number;
}

export interface SaleItem {
  productId: string;
  name: string;
  barcode: string;
  mode: 'unit' | 'carton';
  price: number;
  qty: number;
  units: number;
  total: number;
  isScale?: boolean;
}

export type PaymentMethod = 'cash' | 'debt';

export interface Receipt {
  id: string;
  receiptNumber: string;
  createdAt: string;
  cashierName: string;
  customerId: string | null;
  customerName: string;
  items: SaleItem[];
  subtotal: number;
  discount: number;
  discountPercent: number;
  tax: number;
  total: number;
  paidAmount: number;
  changeAmount: number;
  paymentMethod: PaymentMethod;
  notes?: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  balanceDebt: number; // IQD owed to supermarket
  note?: string;
  createdAt: string;
}

export interface Supplier {
  id: string;
  name: string;
  phone: string;
  address?: string;
  balanceDebt: number; // IQD supermarket owes supplier
}

export interface Shift {
  id: string;
  cashierName: string;
  openedAt: string;
  closedAt: string | null;
  openingFloat: number; // IQD in drawer at start
  cashSales: number;
  debtSales: number;
  cashReturns: number;
  expenses: number;
  expectedCash: number;
  actualCash: number | null;
  discrepancy: number | null;
  status: 'open' | 'closed';
}

export interface Expense {
  id: string;
  shiftId: string;
  title: string;
  amount: number;
  category: string;
  note?: string;
  createdAt: string;
}

export interface StockMovement {
  id: string;
  productId: string;
  productName: string;
  type: 'receive' | 'sale' | 'return' | 'adjust' | 'damage';
  quantityDelta: number; // positive or negative
  mode: 'unit' | 'carton';
  previousStock: number;
  newStock: number;
  reference: string;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  details: string;
}

export type NavView =
  | 'home'
  | 'pos'
  | 'products'
  | 'stock'
  | 'customers'
  | 'suppliers'
  | 'finance'
  | 'reports'
  | 'settings'
  | 'offers'
  | 'labels'
  | 'shifts'
  | 'audit'
  | 'qa';
