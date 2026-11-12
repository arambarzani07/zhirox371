import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import {
  Product,
  CartLine,
  Receipt,
  SaleItem,
  Customer,
  Supplier,
  Shift,
  Expense,
  StockMovement,
  AuditLogEntry,
  PriceChangeAudit025,
  NavView,
  PaymentMethod
} from '../types';
import {
  INITIAL_PRODUCTS,
  INITIAL_CUSTOMERS,
  INITIAL_SUPPLIERS,
  INITIAL_SHIFT,
  INITIAL_RECEIPTS,
  INITIAL_STOCK_MOVEMENTS
} from '../data/initialData';
import { parseScaleBarcode } from '../utils/retailHelpers';
import { validateDemoRefundV107, type DemoReturnV107 } from '../utils/demoRefundGuardV107';
import { parseDemoBackupV108 } from '../utils/demoBackupGuardV108';

const STORAGE_KEY = 'kanichnar_retail_pos_v18';

export interface ParkedCartEntry {
  id: string;
  label: string;
  createdAt: string;
  items: CartLine[];
  totalIqd: number;
}

interface AppContextType {
  currentView: NavView;
  subtab: string;
  activeSectionId: string | null;
  navigateTo: (view: NavView, subtab?: string, sectionId?: string) => void;

  products: Product[];
  addProduct: (p: Omit<Product, 'id'>) => Product;
  updateProduct: (id: string, p: Partial<Product>) => void;
  deleteProduct: (id: string) => void;
  adjustStock: (productId: string, delta: number, mode: 'unit' | 'carton', reason: string) => void;
  receiveStock: (productId: string, quantity: number, mode: 'unit' | 'carton', supplierId?: string, invoiceNo?: string) => void;

  cart: CartLine[];
  addToCart: (input: string | Product, mode?: 'unit' | 'carton', requestedQty?: number) => { success: boolean; message?: string };
  updateCartQty: (index: number, nextQty: number) => { success: boolean; message?: string };
  toggleCartLineMode: (index: number) => { success: boolean; message?: string };
  editCartLine: (index: number, quantity: number, mode: CartLine['mode']) => { success: boolean; message?: string };
  setCartLineLocked: (id: string, locked: boolean) => void;
  removeFromCart: (index: number) => void;
  clearCart: () => void;
  parkedCart: CartLine[] | null;
  parkedCarts: ParkedCartEntry[];
  parkCart: (customLabel?: string) => boolean;
  restoreParkedCart: (parkedId?: string, swapLabel?: string) => void;
  removeParkedCart: (parkedId: string) => void;

  customers: Customer[];
  addCustomer: (c: Omit<Customer, 'id' | 'createdAt'>) => Customer;
  recordDebtRepayment: (customerId: string, amount: number) => AuditLogEntry | null;

  suppliers: Supplier[];
  addSupplier: (s: Omit<Supplier, 'id'>) => Supplier;
  recordSupplierPayment: (supplierId: string, amount: number, fromCashDrawer?: boolean, note?: string) => void;

  currentShift: Shift;
  expenses: Expense[];
  recordExpense: (title: string, amount: number, category: string, note?: string) => boolean;
  closeShift: (actualCash: number, reason?: string) => Shift;
  openNewShift: (cashierName: string, openingFloat: number, note?: string) => Shift;

  receipts: Receipt[];
  demoRefunds: DemoReturnV107[];
  completeCheckout: (options: {
    paymentMethod: PaymentMethod;
    customerId?: string | null;
    customerName?: string;
    paidAmount?: number;
    discountPercent?: number;
    discountAmount?: number;
    notes?: string;
  }) => { success: boolean; receipt?: Receipt; error?: string };
  recordSaleReturn: (options: {
    receiptNo: string;
    productId: string;
    qty: number;
    mode?: 'unit' | 'carton';
    refundAmount: number;
    restock: boolean;
    refundMethod: 'cash' | 'debt';
    customerId?: string | null;
    reason: string;
  }) => { success: boolean; message?: string };

  lastReceipt: Receipt | null;
  activeReceiptForModal: Receipt | null;
  setActiveReceiptForModal: (r: Receipt | null) => void;

  stockMovements: StockMovement[];
  auditLogs: AuditLogEntry[];
  addAuditLog: (action: string, details: string) => void;

  exportBackupJson: () => string;
  importBackupJson: (jsonString: string) => { success: boolean; error?: string };
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentView, setCurrentView] = useState<NavView>('home');
  const [subtab, setSubtab] = useState<string>('');
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);

  const [products, setProducts] = useState<Product[]>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_products`);
      if (saved) return JSON.parse(saved);
    } catch (_e) {}
    return INITIAL_PRODUCTS;
  });

  const [customers, setCustomers] = useState<Customer[]>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_customers`);
      if (saved) return JSON.parse(saved);
    } catch (_e) {}
    return INITIAL_CUSTOMERS;
  });

  const [suppliers, setSuppliers] = useState<Supplier[]>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_suppliers`);
      if (saved) return JSON.parse(saved);
    } catch (_e) {}
    return INITIAL_SUPPLIERS;
  });

  const [currentShift, setCurrentShift] = useState<Shift>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_shift`);
      if (saved) return JSON.parse(saved);
    } catch (_e) {}
    return INITIAL_SHIFT;
  });

  const [expenses, setExpenses] = useState<Expense[]>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_expenses`);
      if (saved) return JSON.parse(saved);
    } catch (_e) {}
    return [
      {
        id: 'exp-1',
        shiftId: 'shift-1',
        title: 'کڕینی چای و شەکر بۆ میوانداری',
        amount: 7000,
        category: 'میوانداری',
        createdAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString()
      },
      {
        id: 'exp-2',
        shiftId: 'shift-1',
        title: 'ڕۆژنامە و پاککەرەوەی مێز',
        amount: 5000,
        category: 'پێداویستی فرۆشگا',
        createdAt: new Date(Date.now() - 1 * 3600 * 1000).toISOString()
      }
    ];
  });

  const [receipts, setReceipts] = useState<Receipt[]>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_receipts`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (_e) {}
    return INITIAL_RECEIPTS;
  });

  // V107 separate DEMO-only refund ledger. Recover legacy submodule refunds.
  const [demoRefunds, setDemoRefunds] = useState<DemoReturnV107[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY+'_refunds');
      if(saved){const parsed=JSON.parse(saved);if(Array.isArray(parsed))return parsed;}
      const legacy=localStorage.getItem(STORAGE_KEY+'_submodules');
      if(legacy){const parsed=JSON.parse(legacy)?.returns;if(Array.isArray(parsed))return parsed;}
    }catch(_e){}
    return [];
  });
  const demoRefundsRef = useRef(demoRefunds);

  const [stockMovements, setStockMovements] = useState<StockMovement[]>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_movements`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (_e) {}
    return INITIAL_STOCK_MOVEMENTS;
  });

  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_audit`);
      if (saved) return JSON.parse(saved);
    } catch (_e) {}
    return [
      {
        id: 'aud-1',
        timestamp: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
        user: 'ئارام',
        action: 'کردنەوەی شێفت',
        details: 'شێفتی نوێ بە سندووقی سەرەتایی 250,000 IQD دەستیپێکرد'
      }
    ];
  });

  const [cart, setCart] = useState<CartLine[]>([]);
  const [parkedCarts, setParkedCarts] = useState<ParkedCartEntry[]>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_parked_carts`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (_e) {}
    return [];
  });
  const parkedCart = parkedCarts.length > 0 ? parkedCarts[0].items : null;
  const [lastReceipt, setLastReceipt] = useState<Receipt | null>(null);
  const [activeReceiptForModal, setActiveReceiptForModal] = useState<Receipt | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(`${STORAGE_KEY}_parked_carts`, JSON.stringify(parkedCarts));
    } catch (_e) {}
  }, [parkedCarts]);

  // Sync state to LocalStorage
  useEffect(() => {
    try {
      localStorage.setItem(`${STORAGE_KEY}_products`, JSON.stringify(products));
    } catch (_e) {}
  }, [products]);

  useEffect(() => {
    try {
      localStorage.setItem(`${STORAGE_KEY}_customers`, JSON.stringify(customers));
    } catch (_e) {}
  }, [customers]);

  useEffect(() => {
    try {
      localStorage.setItem(`${STORAGE_KEY}_suppliers`, JSON.stringify(suppliers));
    } catch (_e) {}
  }, [suppliers]);

  useEffect(() => {
    try {
      localStorage.setItem(`${STORAGE_KEY}_shift`, JSON.stringify(currentShift));
    } catch (_e) {}
  }, [currentShift]);

  useEffect(() => {
    try {
      localStorage.setItem(`${STORAGE_KEY}_receipts`, JSON.stringify(receipts));
    } catch (_e) {}
  }, [receipts]);

  useEffect(() => {
    try {
      localStorage.setItem(`${STORAGE_KEY}_expenses`, JSON.stringify(expenses));
    } catch (_e) {}
  }, [expenses]);

  useEffect(() => {
    try {
      localStorage.setItem(`${STORAGE_KEY}_movements`, JSON.stringify(stockMovements));
    } catch (_e) {}
  }, [stockMovements]);

  useEffect(() => {
    try {
      localStorage.setItem(`${STORAGE_KEY}_audit`, JSON.stringify(auditLogs));
    } catch (_e) {}
  }, [auditLogs]);

  const addAuditLog = (action: string, details: string, metadata?: Pick<AuditLogEntry, 'supplierPayment' | 'customerRepayment'>) => {
    const entry: AuditLogEntry = {
      id: `aud-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      user: currentShift.cashierName || 'بەڕێوەبەر',
      action,
      details,
      ...metadata
    };
    setAuditLogs(prev => [entry, ...prev.slice(0, 99)]);
    return entry;
  };

  const navigateTo = (view: NavView, targetSubtab?: string, sectionId?: string) => {
    setCurrentView(view);
    setSubtab(targetSubtab ?? '');
    setActiveSectionId(sectionId ?? null);
  };

  const addProduct = (p: Omit<Product, 'id'>): Product => {
    const newProd: Product = {
      ...p,
      id: `prod-${Date.now()}`
    };
    setProducts(prev => [newProd, ...prev]);
    addAuditLog('زیادکردنی کاڵا', `کاڵای نوێ تۆمارکرا: ${newProd.name} (بارکۆد: ${newProd.unit_barcode})`);
    return newProd;
  };

  const updateProduct = (id: string, updates: Partial<Product>) => {
    // Keep previous and new prices from actual local DEMO product state.
    // Old audit entries without a priceChange payload remain unknown.
    const original = products.find(p => p.id === id);
    if (!original) return;
    const next = { ...original, ...updates };
    const priceChanges: PriceChangeAudit025[] = [];
    const track = (
      unit: PriceChangeAudit025['unit'], priceType: PriceChangeAudit025['priceType'],
      previousIqd: number | null, nextIqd: number | null
    ) => {
      if (previousIqd === nextIqd || nextIqd === null ||
          !Number.isSafeInteger(nextIqd) || nextIqd < 0) return;
      priceChanges.push({
        productId: original.id, productName: original.name, barcode: original.unit_barcode,
        unit, priceType, previousIqd, nextIqd, status: 'recorded_demo'
      });
    };
    const primaryUnit = original.base_unit === 'kg' ? 'kg' : 'unit';
    track(primaryUnit, 'sale', original.unit_sale_price_iqd, next.unit_sale_price_iqd);
    track(primaryUnit, 'purchase', original.unit_purchase_price_iqd, next.unit_purchase_price_iqd);
    if (original.carton && next.carton) {
      track('carton', 'sale', original.carton.sale_price_iqd, next.carton.sale_price_iqd);
      track('carton', 'purchase', original.carton.purchase_price_iqd, next.carton.purchase_price_iqd);
    }
    for (const oldPack of original.extra_packs || []) {
      const updatedPack = next.extra_packs?.find(p => p.kind === oldPack.kind);
      if (!updatedPack) continue;
      track(oldPack.kind, 'sale', oldPack.sale_price_iqd, updatedPack.sale_price_iqd);
      track(oldPack.kind, 'purchase', oldPack.purchase_price_iqd, updatedPack.purchase_price_iqd);
    }
    setProducts(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
    if (priceChanges.length) {
      const timestamp = new Date().toISOString();
      const actor = currentShift.cashierName || 'بەکارهێنەری تاقیکردنەوە';
      const entries: AuditLogEntry[] = priceChanges.map((priceChange, index) => ({
        id: `demo-price-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp, user: actor, action: 'گۆڕینی نرخ — تاقیکردنەوە',
        details: `${priceChange.productName}: ${priceChange.priceType} ${priceChange.unit}; ${priceChange.previousIqd ?? '—'} → ${priceChange.nextIqd ?? '—'} IQD`,
        priceChange
      }));
      setAuditLogs(prev => [...entries, ...prev].slice(0, 100));
    }
    addAuditLog('دەستکاریکردنی کاڵا', `زانیارییەکانی کاڵا نوێکرانەوە: ID ${id}`);
  };

  const deleteProduct = (id: string) => {
    const p = products.find(x => x.id === id);
    setProducts(prev => prev.filter(x => x.id !== id));
    addAuditLog('سڕینەوەی کاڵا', `کاڵا سڕایەوە: ${p?.name || id}`);
  };

  const adjustStock = (productId: string, delta: number, mode: 'unit' | 'carton', reason: string) => {
    const p = products.find(x => x.id === productId);
    if (!p) return;
    const baseUnitsDelta = mode === 'carton' && p.carton ? delta * p.carton.units_per_carton : delta;
    const prevStock = p.stock;
    const nextStock = Math.max(0, prevStock + baseUnitsDelta);

    updateProduct(productId, { stock: nextStock });

    const movement: StockMovement = {
      id: `mov-${Date.now()}`,
      productId,
      productName: p.name,
      type: 'adjust',
      quantityDelta: baseUnitsDelta,
      mode,
      previousStock: prevStock,
      newStock: nextStock,
      reference: reason,
      createdAt: new Date().toISOString()
    };
    setStockMovements(prev => [movement, ...prev]);
    addAuditLog('گۆڕانکاری کۆگا', `کۆگای ${p.name} گۆڕدرا بە ${baseUnitsDelta > 0 ? '+' : ''}${baseUnitsDelta} (${reason})`);
  };

  const receiveStock = (
    productId: string,
    quantity: number,
    mode: 'unit' | 'carton',
    supplierId?: string,
    invoiceNo?: string
  ) => {
    const p = products.find(x => x.id === productId);
    if (!p || quantity <= 0) return;
    const baseUnitsDelta = mode === 'carton' && p.carton ? quantity * p.carton.units_per_carton : quantity;
    const prevStock = p.stock;
    const nextStock = prevStock + baseUnitsDelta;

    updateProduct(productId, { stock: nextStock });

    let supplierReceipt: StockMovement['supplierReceipt'];
    if (supplierId) {
      const costPerPkg = mode === 'carton' && p.carton?.purchase_price_iqd
        ? p.carton.purchase_price_iqd
        : (p.unit_purchase_price_iqd || 0);
      const totalCost = costPerPkg * quantity;
      if (invoiceNo?.trim() && Number.isFinite(totalCost) && totalCost > 0 &&
        suppliers.some(supplier => supplier.id === supplierId)) {
        supplierReceipt = {
          supplierId, invoiceNo: invoiceNo.trim(), quantity, unitCost: costPerPkg, total: totalCost,
          unit: mode === 'carton' ? 'carton' : p.base_unit,
          barcode: mode === 'carton' ? p.carton?.barcode ?? '' : p.unit_barcode,
        };
      }
      setSuppliers(prev =>
        prev.map(s => (s.id === supplierId ? { ...s, balanceDebt: s.balanceDebt + totalCost } : s))
      );
    }

    const movement: StockMovement = {
      id: 'mov-' + crypto.randomUUID(),
      supplierReceipt,
      productId,
      productName: p.name,
      type: 'receive',
      quantityDelta: baseUnitsDelta,
      mode,
      previousStock: prevStock,
      newStock: nextStock,
      reference: `پسووڵەی کڕین ${invoiceNo || 'نوێ'}`,
      createdAt: new Date().toISOString()
    };
    setStockMovements(prev => [movement, ...prev]);
    addAuditLog('وەرگرتنی کاڵا', `وەرگیرا: ${quantity} ${mode === 'carton' ? 'کارتۆن' : 'دانە'} لە ${p.name}`);
  };

  const findProductByCode = (barcode: string): { product: Product; mode: 'unit' | 'carton'; isScale?: boolean; scaleGrams?: number } | null => {
    const trimmed = barcode.trim();
    if (!trimmed) return null;

    // Check Scale Barcode (starts with 27 or 28)
    if (/^(27|28)[0-9]{11}$/.test(trimmed)) {
      const scaleInfo = parseScaleBarcode(trimmed);
      if (scaleInfo.isScale && scaleInfo.itemCode) {
        const numericCode = parseInt(scaleInfo.itemCode, 10).toString();
        // Look up by scale product or plu or barcode prefix
        const p = products.find(
          x =>
            (x.is_scale_product && (x.plu === scaleInfo.itemCode || x.plu === numericCode)) ||
            (x.base_unit === 'kg' && (x.unit_barcode.includes(scaleInfo.itemCode!) || x.unit_barcode.endsWith(numericCode))) ||
            x.unit_barcode === trimmed.slice(0, 7) ||
            x.unit_barcode === trimmed ||
            x.unit_alias_barcodes.includes(trimmed)
        );
        if (p) {
          return { product: p, mode: 'unit', isScale: true, scaleGrams: scaleInfo.grams || 1000 };
        }
      }
    }

    // Direct match unit barcode
    let matched = products.find(x => x.unit_barcode === trimmed);
    if (matched) return { product: matched, mode: 'unit' };

    // Match carton barcode
    matched = products.find(x => x.carton?.barcode === trimmed);
    if (matched) return { product: matched, mode: 'carton' };

    // Match unit aliases
    matched = products.find(x => x.unit_alias_barcodes.includes(trimmed));
    if (matched) return { product: matched, mode: 'unit' };

    // Match carton aliases
    matched = products.find(x => x.carton?.alias_barcodes.includes(trimmed));
    if (matched) return { product: matched, mode: 'carton' };

    // Fallback: SKU or PLU match
    matched = products.find(x => x.sku?.toLowerCase() === trimmed.toLowerCase() || x.plu === trimmed);
    if (matched) return { product: matched, mode: 'unit' };

    // Fallback: Kurdish/Latin product name match for fast cashier lookup
    matched = products.find(x => x.name.toLowerCase().includes(trimmed.toLowerCase()));
    if (matched) return { product: matched, mode: 'unit' };

    return null;
  };

  const addToCart = (
    input: string | Product,
    requestedMode?: 'unit' | 'carton',
    requestedQty?: number
  ): { success: boolean; message?: string } => {
    let p: Product;
    let mode: 'unit' | 'carton' = requestedMode || 'unit';
    let isScale = false;
    let scaleGrams = 1000;
    let scanBarcode = '';
    let effectiveQty = Math.max(1, Math.floor(requestedQty || 1));

    if (typeof input === 'string') {
      let queryStr = input.trim();
      const multMatch = queryStr.match(/^(\d{1,3})\*(.+)$/);
      if (multMatch) {
        const parsedMult = parseInt(multMatch[1], 10);
        if (parsedMult > 0) {
          effectiveQty = requestedQty ? Math.max(1, Math.floor(requestedQty)) : parsedMult;
        }
        queryStr = multMatch[2].trim();
      }

      // Reserved pack barcodes are catalog-visible but cannot enter a checkout
      // until backend-priced, atomic bundle/set inventory accounting is verified.
      // Failing closed prevents a bundle barcode from being sold as one unit.
      if (products.some(x => x.extra_packs?.some(pack =>
        pack.barcode === queryStr || pack.alias_barcodes.includes(queryStr)))) {
        return { success:false, message:'دەستە/سێت تۆمارکراوە، بەڵام فرۆشتنی ئەم یەکەیە هێشتا لە سێرڤەر پشتڕاست نەکراوە' };
      }
      const match = findProductByCode(queryStr);
      if (!match) {
        return { success: false, message: 'ئەم بارکۆدە نەدۆزرایەوە!' };
      }
      p = match.product;
      mode = requestedMode || match.mode;
      isScale = match.isScale || false;
      scaleGrams = match.scaleGrams || 1000;
      scanBarcode = queryStr;
    } else {
      p = input;
      mode = requestedMode || (p.sale_mode === 'carton' ? 'carton' : 'unit');
      scanBarcode = mode === 'carton' && p.carton ? p.carton.barcode : p.unit_barcode;
    }

    if (isScale) {
      effectiveQty = 1;
    }

    if (mode === 'carton' && !p.carton) {
      mode = 'unit';
    }

    const unitsPerPackage = isScale
      ? scaleGrams / 1000
      : mode === 'carton' && p.carton
      ? p.carton.units_per_carton
      : 1;

    const pricePerUnit = isScale
      ? Math.round((p.unit_sale_price_iqd * scaleGrams) / 1000)
      : mode === 'carton' && p.carton
      ? p.carton.sale_price_iqd
      : p.unit_sale_price_iqd;

    // Check if scale barcode is already scanned
    if (isScale && cart.some(c => c.barcode === scanBarcode)) {
      return { success: false, message: 'ئەم لیبڵەی تەرازوو پێشتر تۆمارکراوە!' };
    }

    // Check stock availability
    const alreadyUsedBaseUnits = cart.reduce((sum, line) => {
      return line.productId === p.id ? sum + line.qty * line.units : sum;
    }, 0);

    if (alreadyUsedBaseUnits + unitsPerPackage * effectiveQty > p.stock + 0.001) {
      return { success: false, message: `بڕی بەردەست لە کۆگا تەواوبووە! (بەردەست: ${p.stock})` };
    }

    // Check if can merge with existing line
    const existingIndex = isScale
      ? -1
      : cart.findIndex(c => !c.locked && c.productId === p.id && c.mode === mode && c.price === pricePerUnit);

    if (existingIndex >= 0) {
      const nextCart = [...cart];
      nextCart[existingIndex].qty += effectiveQty;
      setCart(nextCart);
    } else {
      const newLine: CartLine = {
        id: `cart-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        productId: p.id,
        name: isScale ? `${p.name} (${(scaleGrams / 1000).toFixed(3)} کگم)` : (mode === 'carton' && p.carton?.name ? p.carton.name : p.name),
        barcode: scanBarcode,
        mode,
        price: pricePerUnit,
        qty: effectiveQty,
        units: unitsPerPackage,
        isScale,
        scaleGrams: isScale ? scaleGrams : undefined,
        available: p.stock
      };
      setCart(prev => [...prev, newLine]);
    }

    return { success: true };
  };

  const editCartLine = (index: number, quantity: number, mode: CartLine['mode']) => {
    const line = cart[index];
    if (!line || line.locked || !Number.isSafeInteger(quantity) || quantity < 1) {
      return { success: false, message: 'ڕیزەکە قوفڵە یان بڕەکە نادروستە' };
    }
    if (line.isScale && (quantity !== line.qty || mode !== line.mode)) {
      return { success: false, message: 'کێشی تەرازوو ناگۆڕدرێت؛ لیبڵی جیاواز بسکێنە' };
    }
    const product = products.find(item => item.id === line.productId);
    if (!product) return { success: false, message: 'کاڵاکە لە کەتەلۆگ نەدۆزرایەوە' };
    const changesMode = mode !== line.mode;
    const carton = product.carton;
    if (changesMode && (!carton || (mode === 'unit' && product.sale_mode === 'carton'))) {
      return { success: false, message: 'ئەم یەکەیە بۆ کاڵاکە بەردەست نییە' };
    }
    const next = changesMode ? {
      ...line, mode,
      units: mode === 'carton' ? carton!.units_per_carton : 1,
      price: mode === 'carton' ? carton!.sale_price_iqd : product.unit_sale_price_iqd,
      name: mode === 'carton' ? (carton!.name || `کارتۆنی ${product.name}`) : product.name,
      barcode: mode === 'carton' ? carton!.barcode : product.unit_barcode,
    } : line;
    const otherUsed = cart.reduce((sum, item, itemIndex) =>
      itemIndex !== index && item.productId === product.id ? sum + item.qty * item.units : sum, 0);
    if (otherUsed + quantity * next.units > product.stock + 0.001) {
      return { success: false, message: 'بڕی بەردەست لە کۆگا بەس نییە' };
    }
    setCart(previous => previous.map(item => item.id === line.id ? { ...next, qty: quantity } : item));
    return { success: true };
  };

  const setCartLineLocked = (id: string, locked: boolean) => {
    setCart(previous => previous.map(line => line.id === id ? { ...line, locked } : line));
  };

  const removeFromCart = (index: number) => {
    setCart(previous => previous.filter((line, itemIndex) => itemIndex !== index || line.locked));
  };

  const updateCartQty = (index: number, nextQty: number) => {
    const line = cart[index];
    if (!line) return { success: false };
    if (nextQty === 0 && !line.locked) {
      removeFromCart(index);
      return { success: true };
    }
    return editCartLine(index, nextQty, line.mode);
  };

  const toggleCartLineMode = (index: number) => {
    const line = cart[index];
    if (!line) return { success: false };
    return editCartLine(index, line.qty, line.mode === 'unit' ? 'carton' : 'unit');
  };

  const clearCart = () => {
    setCart([]);
  };

  const parkCart = (customLabel?: string): boolean => {
    // At most five simultaneously held/in-use tickets: four parked, one active.
    // Existing over-limit local data is preserved, not automatically deleted.
    if (cart.length === 0 || parkedCarts.length >= 4) return false;
    const totalIqd = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
    const entry: ParkedCartEntry = {
      id: `park-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      label: customLabel || `سەبەتە #${parkedCarts.length + 1}`,
      createdAt: new Date().toISOString(),
      items: [...cart],
      totalIqd
    };
    setParkedCarts(prev => [entry, ...prev]);
    setCart([]);
    addAuditLog('پاراستنی سەبەتە', `سەبەتەی کاشێر هەڵگیرا (${entry.label})`);
    return true;
  };

  const restoreParkedCart = (parkedId?: string, swapLabel?: string) => {
    if (parkedCarts.length === 0) return;
    const target = parkedId ? parkedCarts.find(x => x.id === parkedId) || parkedCarts[0] : parkedCarts[0];
    if (!target) return;

    const currentActiveItems = [...cart];
    setCart([...target.items]);
    setParkedCarts(prev => {
      const remaining = prev.filter(x => x.id !== target.id);
      if (currentActiveItems.length > 0) {
        const swappedEntry: ParkedCartEntry = {
          id: `park-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          label: swapLabel || `سەبەتەی گۆڕدراو`,
          createdAt: new Date().toISOString(),
          items: currentActiveItems,
          totalIqd: currentActiveItems.reduce((s, i) => s + i.price * i.qty, 0)
        };
        return [swappedEntry, ...remaining];
      }
      return remaining;
    });
    addAuditLog('گەڕاندنەوەی سەبەتە', `سەبەتەی پارێزراو هێنرایەوە (${target.label})`);
  };

  const removeParkedCart = (parkedId: string) => {
    setParkedCarts(prev => prev.filter(x => x.id !== parkedId));
  };

  const addCustomer = (c: Omit<Customer, 'id' | 'createdAt'>): Customer => {
    const cust: Customer = {
      ...c,
      id: 'cust-' + crypto.randomUUID(),
      createdAt: new Date().toISOString()
    };
    setCustomers(prev => [cust, ...prev]);
    addAuditLog('کڕیاری نوێ', `کڕیاری نوێ تۆمارکرا: ${cust.name} (${cust.phone})`);
    return cust;
  };

  const recordDebtRepayment = (customerId: string, amount: number) => {
    const customer = customers.find(c => c.id === customerId);
    if (!customer || !Number.isSafeInteger(amount) || amount <= 0 || amount > customer.balanceDebt ||
      currentShift.status !== 'open') return null;
    const remaining = customer.balanceDebt - amount;
    setCustomers(previous => previous.map(c => c.id === customerId
      ? { ...c, balanceDebt: c.balanceDebt - amount } : c));
    setCurrentShift(previous => ({
      ...previous,
      cashSales: previous.cashSales + amount,
      expectedCash: previous.expectedCash + amount,
    }));
    return addAuditLog('دانەوەی قەرز',
      `بڕی ${amount.toLocaleString('en-US')} IQD قەرز لەلایەن کڕیار (${customer.name}) گەڕێنرایەوە`,
      { customerRepayment: { customerId, amount, remaining } });
  };

  const addSupplier = (s: Omit<Supplier, 'id'>): Supplier => {
    const sup: Supplier = {
      ...s,
      id: `sup-${Date.now()}`
    };
    setSuppliers(prev => [sup, ...prev]);
    addAuditLog('دابینکەری نوێ', `دابینکەری نوێ تۆمارکرا: ${sup.name}`);
    return sup;
  };

  const recordSupplierPayment = (
    supplierId: string,
    amount: number,
    fromCashDrawer: boolean = true,
    note?: string
  ) => {
    if (!Number.isFinite(amount) || amount <= 0) return;
    const sup = suppliers.find(s => s.id === supplierId);
    if (!sup || amount > sup.balanceDebt) return;
    setSuppliers(prev =>
      prev.map(s => (s.id === supplierId ? { ...s, balanceDebt: Math.max(0, s.balanceDebt - amount) } : s))
    );

    if (fromCashDrawer) {
      const newExp: Expense = {
        id: `exp-sup-${Date.now()}`,
        shiftId: currentShift.id,
        title: `پارەدان بە دابینکەر: ${sup?.name || supplierId}`,
        amount,
        category: 'حیساباتی دابینکەران',
        note: note || 'پاکتاوکردنی قەرزی دابینکەر لە سندووق',
        createdAt: new Date().toISOString()
      };
      setExpenses(prev => [newExp, ...prev]);
      setCurrentShift(prev => ({
        ...prev,
        expenses: prev.expenses + amount,
        expectedCash: Math.max(0, prev.expectedCash - amount)
      }));
    }

    addAuditLog(
      'پارەدان بە دابینکەر',
      `بڕی ${amount.toLocaleString('en-US')} IQD درا بە دابینکەر (${sup?.name || supplierId})${fromCashDrawer ? ' لە سندووقی کاشێر' : ' لە قاسەی گشتی'}`,
      { supplierPayment: { supplierId, amount, source: fromCashDrawer ? 'drawer' : 'safe' } }
    );
  };

  const recordExpense = (title: string, amount: number, category: string, note?: string) => {
    if (currentShift.status !== 'open' || !title.trim() || !Number.isSafeInteger(amount)
      || amount <= 0 || amount > currentShift.expectedCash) return false;
    const newExp: Expense = {
      id: 'exp-' + crypto.randomUUID(),
      shiftId: currentShift.id,
      title,
      amount,
      category,
      note,
      createdAt: new Date().toISOString()
    };
    setExpenses(prev => [newExp, ...prev]);
    setCurrentShift(prev => ({
      ...prev,
      expenses: prev.expenses + amount,
      expectedCash: Math.max(0, prev.expectedCash - amount)
    }));
    addAuditLog('تۆمارکردنی خەرجی', `خەرجی: ${title} (${amount.toLocaleString()} IQD)`);
    return true;
  };

  const closeShift = (actualCash: number, reason?: string): Shift => {
    if (currentShift.status !== 'open' || !Number.isSafeInteger(actualCash) || actualCash < 0) return currentShift;
    const discrepancy = actualCash - currentShift.expectedCash;
    const closed: Shift = {
      ...currentShift,
      closedAt: new Date().toISOString(),
      actualCash,
      discrepancy,
      closeReason: reason || undefined,
      status: 'closed'
    };
    setCurrentShift(closed);
    addAuditLog(
      'داخستنی شێفت',
      `شێفت داخرا. چاوەڕوانکراو: ${closed.expectedCash.toLocaleString()} IQD, ژمێردراو: ${actualCash.toLocaleString()} IQD, جیاوازی: ${discrepancy.toLocaleString()} IQD`
    );
    return closed;
  };

  const openNewShift = (cashierName: string, openingFloat: number, note?: string): Shift => {
    if (currentShift.status === 'open' || !cashierName.trim() || !Number.isSafeInteger(openingFloat) || openingFloat < 0) return currentShift;
    const newShift: Shift = {
      id: `shift-${Date.now()}`,
      cashierName,
      openedAt: new Date().toISOString(),
      closedAt: null,
      openingFloat,
      openNote: note || undefined,
      cashSales: 0,
      debtSales: 0,
      cashReturns: 0,
      expenses: 0,
      expectedCash: openingFloat,
      actualCash: null,
      discrepancy: null,
      status: 'open'
    };
    setCurrentShift(newShift);
    addAuditLog('کردنەوەی شێفت', `شێفتی نوێ دەستیپێکرد بۆ: ${cashierName} بە سەرمایەی ${openingFloat.toLocaleString()} IQD`);
    return newShift;
  };

  const completeCheckout = (options: {
    paymentMethod: PaymentMethod;
    customerId?: string | null;
    customerName?: string;
    paidAmount?: number;
    discountPercent?: number;
    discountAmount?: number;
    notes?: string;
  }): { success: boolean; receipt?: Receipt; error?: string } => {
    if (cart.length === 0) {
      return { success: false, error: 'سەبەتە بەتاڵە!' };
    }

    if (currentShift.status !== 'open') {
      return { success: false, error: 'شێفتی کاشێر داخراوە! تکایە سەرەتا شێفتێکی نوێ بکەرەوە.' };
    }

    const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
    const discount = options.discountAmount || (options.discountPercent ? Math.round((subtotal * options.discountPercent) / 100) : 0);
    const grandTotal = Math.max(0, subtotal - discount);

    const paid = options.paidAmount !== undefined ? options.paidAmount : (options.paymentMethod === 'cash' ? grandTotal : 0);
    if (options.paymentMethod === 'cash' && paid < grandTotal) {
      return {
        success: false,
        error: `بڕی پارەی وەرگیراو (${paid.toLocaleString('en-US')} IQD) کەمترە لە کۆی گشتیی پسووڵە (${grandTotal.toLocaleString('en-US')} IQD)!`
      };
    }
    const change = options.paymentMethod === 'cash' && paid >= grandTotal ? paid - grandTotal : 0;

    // This React-only checkout persists to LocalStorage, not a trusted local PostgreSQL POS.
    // Mark every resulting receipt as a DEMO document until an authenticated LAN API owns checkout.
    const receiptNum = `DEMO-RCP-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;

    const saleItems: SaleItem[] = cart.map(line => ({
      productId: line.productId,
      name: line.name,
      barcode: line.barcode,
      mode: line.mode,
      price: line.price,
      qty: line.qty,
      units: line.units,
      total: line.price * line.qty,
      isScale: line.isScale
    }));

    const newReceipt: Receipt = {
      id: `rcp-${Date.now()}`,
      receiptNumber: receiptNum,
      createdAt: new Date().toISOString(),
      cashierName: currentShift.cashierName,
      customerId: options.customerId || null,
      customerName: options.customerName || (options.paymentMethod === 'debt' ? 'کڕیاری قەرز' : 'کڕیاری نەختینە'),
      items: saleItems,
      subtotal,
      discount,
      discountPercent: options.discountPercent || 0,
      tax: 0,
      total: grandTotal,
      paidAmount: paid,
      changeAmount: change,
      paymentMethod: options.paymentMethod,
      notes: options.notes
    };

    // Deduct stock for all items
    setProducts(prev =>
      prev.map(p => {
        const cartLinesForProd = cart.filter(c => c.productId === p.id);
        if (cartLinesForProd.length === 0) return p;
        const totalBaseUnitsDeducted = cartLinesForProd.reduce((sum, line) => sum + line.qty * line.units, 0);
        return {
          ...p,
          stock: Math.max(0, Number((p.stock - totalBaseUnitsDeducted).toFixed(3)))
        };
      })
    );

    // Record stock movements
    cart.forEach(line => {
      const p = products.find(x => x.id === line.productId);
      const prevStock = p ? p.stock : 0;
      const baseUnitsDeducted = line.qty * line.units;
      const mov: StockMovement = {
        id: `mov-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        productId: line.productId,
        productName: line.name,
        type: 'sale',
        quantityDelta: -baseUnitsDeducted,
        mode: line.mode,
        previousStock: prevStock,
        newStock: Math.max(0, prevStock - baseUnitsDeducted),
        reference: `پسووڵەی ${receiptNum}`,
        createdAt: new Date().toISOString()
      };
      setStockMovements(mPrev => [mov, ...mPrev]);
    });

    // Update customer debt if paymentMethod is debt
    if (options.paymentMethod === 'debt' && options.customerId) {
      setCustomers(cPrev =>
        cPrev.map(c => {
          if (c.id === options.customerId) {
            return { ...c, balanceDebt: c.balanceDebt + grandTotal };
          }
          return c;
        })
      );
    }

    // Update Shift finance metrics
    setCurrentShift(sPrev => ({
      ...sPrev,
      cashSales: options.paymentMethod === 'cash' ? sPrev.cashSales + grandTotal : sPrev.cashSales,
      debtSales: options.paymentMethod === 'debt' ? sPrev.debtSales + grandTotal : sPrev.debtSales,
      expectedCash: options.paymentMethod === 'cash' ? sPrev.expectedCash + grandTotal : sPrev.expectedCash
    }));

    setReceipts(rPrev => [newReceipt, ...rPrev]);
    setLastReceipt(newReceipt);
    // A completed demo sale stays on the cashier screen. Receipt history may
    // still explicitly open the separate preview, but checkout never does.
    setCart([]);

    addAuditLog('فرۆشتنی تاقیکردنەوە', `پسووڵەی نموونەیی ${receiptNum} بە سەرکەوتوویی تەواوبوو بە کۆی ${grandTotal.toLocaleString()} IQD (${options.paymentMethod === 'cash' ? 'نەختینە' : 'قەرز'})`);

    return { success: true, receipt: newReceipt };
  };

  const recordSaleReturn = (options: {
    receiptNo: string;
    productId: string;
    qty: number;
    mode?: 'unit' | 'carton';
    refundAmount: number;
    restock: boolean;
    refundMethod: 'cash' | 'debt';
    customerId?: string | null;
    reason: string;
  }): { success: boolean; message?: string } => {
    // NON-FISCAL browser DEMO. SQL financial refunds require a separate,
    // authenticated atomic receipt/return journal.
    const receipt=receipts.find(r=>r.receiptNumber===options.receiptNo);
    const mode=options.mode||'unit';
    const check=validateDemoRefundV107({
      receipt,productId:options.productId,qty:options.qty,mode,
      refundAmount:options.refundAmount,refundMethod:options.refundMethod,
      customerId:options.customerId,customers,currentShift,
      priorReturns:demoRefundsRef.current
    });
    if(!check.ok)return {success:false,message:check.message};
    const p=products.find(x=>x.id===options.productId);
    if(!p)return {success:false,message:'کاڵای پسووڵە لە کەتەلۆگ نەدۆزرایەوە'};
    const next:DemoReturnV107={
      id:'demo-ret-'+crypto.randomUUID(),receiptNo:options.receiptNo,
      productId:p.id,productName:check.productName,qty:options.qty,mode,
      refundAmount:options.refundAmount,refundMethod:options.refundMethod,
      restocked:options.restock,reason:options.reason.trim()||'گەڕاندنەوەی Demo',
      createdAt:new Date().toISOString()
    };
    // Persist a same-tab audit record BEFORE any DEMO stock or cash effects.
    // A browser cannot provide cross-device atomic financial guarantees.
    const nextLedger=[next,...demoRefundsRef.current];
    try{
      localStorage.setItem(STORAGE_KEY+'_refunds',JSON.stringify(nextLedger));
    }catch(_e){
      return {success:false,message:'ناتوانرێت مێژووی گەڕاندنەوە بپارێزرێت'};
    }
    demoRefundsRef.current=nextLedger;
    setDemoRefunds(nextLedger);
    const baseUnitsDelta=options.qty*check.units;
    if(options.restock){
      setProducts(prev=>prev.map(item=>item.id===p.id?
       {...item,stock:item.stock+baseUnitsDelta}:item));
      const movement:StockMovement={
        id:'mov-ret-'+crypto.randomUUID(),productId:p.id,productName:p.name,
        type:'return',quantityDelta:baseUnitsDelta,mode,
        previousStock:p.stock,newStock:p.stock+baseUnitsDelta,
        reference:'گەڕاندنەوەی Demo: '+options.receiptNo,
        createdAt:next.createdAt
      };
      setStockMovements(prev=>[movement,...prev]);
    }
    if(options.refundMethod==='cash'){
      setCurrentShift(prev=>({
        ...prev,cashReturns:(prev.cashReturns||0)+options.refundAmount,
        expectedCash:prev.expectedCash-options.refundAmount
      }));
    }else{
      setCustomers(prev=>prev.map(c=>c.id===options.customerId?
       {...c,balanceDebt:c.balanceDebt-options.refundAmount}:c));
    }
    addAuditLog('گەڕاندنەوەی Demo',
      options.qty+' × '+p.name+' — '+options.receiptNo+' — '+options.refundAmount+' IQD');
    return {success:true};
  };

  const exportBackupJson = (): string => {
    // Downloadable DEMO snapshot, not a copy of the PostgreSQL database and
    // not a physical drive D: backup.
    const backup = {
      backup_version: 2,
      source:'ZHIROX371_BROWSER_DEMO',
      storage:'browser_download_only',
      saved_at:new Date().toISOString(),
      store:{name:'سوپەرمارکێتی کانی چنار',address:'هەولێر — کانی چنار'},
      snapshot:{
        products,customers,suppliers,shift:currentShift,receipts,expenses,
        stockMovements,auditLogs,demoRefunds
      }
    };
    return JSON.stringify(backup,null,2);
  };

  const importBackupJson = (jsonString: string): { success: boolean; error?: string } => {
    const validation=parseDemoBackupV108(jsonString);
    if(!validation.ok)return {success:false,error:validation.error};
    const snap=validation.snapshot;
    // No setState takes place before ALL collections pass preflight validation.
    // This still is a browser-only restore, not a PostgreSQL transaction.
    try{
      localStorage.setItem(STORAGE_KEY+'_refunds',JSON.stringify(snap.demoRefunds));
    }catch(_e){
      return {success:false,error:'شوێنی هەڵگرتنی Demo پڕە؛ هیچ گەڕاندنەوەیەک ئەنجام نەدرا'};
    }
    demoRefundsRef.current=snap.demoRefunds;
    setProducts(snap.products);
    setCustomers(snap.customers);
    setSuppliers(snap.suppliers);
    setCurrentShift(snap.shift);
    setReceipts(snap.receipts);
    setExpenses(snap.expenses);
    setStockMovements(snap.stockMovements);
    setAuditLogs(snap.auditLogs);
    setDemoRefunds(snap.demoRefunds);
    return {success:true};
  };

  return (
    <AppContext.Provider
      value={{
        currentView,
        subtab,
        activeSectionId,
        navigateTo,
        products,
        addProduct,
        updateProduct,
        deleteProduct,
        adjustStock,
        receiveStock,
        cart,
        addToCart,
        updateCartQty,
        editCartLine,
        setCartLineLocked,
        toggleCartLineMode,
        removeFromCart,
        clearCart,
        parkedCart,
        parkedCarts,
        parkCart,
        restoreParkedCart,
        removeParkedCart,
        customers,
        addCustomer,
        recordDebtRepayment,
        suppliers,
        addSupplier,
        recordSupplierPayment,
        currentShift,
        expenses,
        recordExpense,
        closeShift,
        openNewShift,
        receipts,
        demoRefunds,
        completeCheckout,
        recordSaleReturn,
        lastReceipt,
        activeReceiptForModal,
        setActiveReceiptForModal,
        stockMovements,
        auditLogs,
        addAuditLog,
        exportBackupJson,
        importBackupJson
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
