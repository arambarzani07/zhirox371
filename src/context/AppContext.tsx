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
  NavView,
  PaymentMethod,
  SaleUnitMode
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
import {resolveFixedPackBarcode,saleUnitConfig,validateDemoSaleCart} from '../utils/fixedPackSales.js';
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
  addToCart: (input: string | Product, mode?: SaleUnitMode, requestedQty?: number) => { success: boolean; message?: string };
  updateCartQty: (index: number, nextQty: number) => { success: boolean; message?: string };
  toggleCartLineMode: (index: number) => { success: boolean; message?: string };
  removeFromCart: (index: number) => void;
  clearCart: () => void;
  parkedCart: CartLine[] | null;
  parkedCarts: ParkedCartEntry[];
  parkCart: (customLabel?: string) => boolean;
  restoreParkedCart: (parkedId?: string) => void;
  removeParkedCart: (parkedId: string) => void;

  customers: Customer[];
  addCustomer: (c: Omit<Customer, 'id' | 'createdAt'>) => Customer;
  recordDebtRepayment: (customerId: string, amount: number) => void;

  suppliers: Supplier[];
  addSupplier: (s: Omit<Supplier, 'id'>) => Supplier;
  recordSupplierPayment: (supplierId: string, amount: number, fromCashDrawer?: boolean, note?: string) => void;

  currentShift: Shift;
  expenses: Expense[];
  recordExpense: (title: string, amount: number, category: string, note?: string) => void;
  closeShift: (actualCash: number) => Shift;
  openNewShift: (cashierName: string, openingFloat: number) => Shift;

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
    mode?: SaleUnitMode;
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

  const addAuditLog = (action: string, details: string) => {
    const entry: AuditLogEntry = {
      id: `aud-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      user: currentShift.cashierName || 'بەڕێوەبەر',
      action,
      details
    };
    setAuditLogs(prev => [entry, ...prev.slice(0, 99)]);
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
    setProducts(prev =>
      prev.map(p => {
        if (p.id === id) {
          const updated = { ...p, ...updates };
          return updated;
        }
        return p;
      })
    );
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

    if (supplierId) {
      const costPerPkg = mode === 'carton' && p.carton?.purchase_price_iqd
        ? p.carton.purchase_price_iqd
        : (p.unit_purchase_price_iqd || 0);
      const totalCost = costPerPkg * quantity;
      setSuppliers(prev =>
        prev.map(s => (s.id === supplierId ? { ...s, balanceDebt: s.balanceDebt + totalCost } : s))
      );
    }

    const movement: StockMovement = {
      id: `mov-${Date.now()}`,
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
    requestedMode?: SaleUnitMode,
    requestedQty?: number
  ): { success: boolean; message?: string } => {
    let p: Product;
    let mode: SaleUnitMode = requestedMode || 'unit';
    let isScale = false;
    let scaleGrams = 1000;
    let scanBarcode = '';
    let effectiveQty = requestedQty ?? 1;
    if (!Number.isSafeInteger(effectiveQty) || effectiveQty < 1 || effectiveQty > 1000) {
      return {success:false,message:'بڕی فرۆشتن دەبێت ژمارەیەکی دروستی نێوان 1 و 1000 بێت'};
    }

    if (typeof input === 'string') {
      let queryStr = input.trim();
      const multMatch = queryStr.match(/^(\d{1,3})\*(.+)$/);
      if (multMatch) {
        if (requestedQty === undefined) effectiveQty = Number(multMatch[1]);
        queryStr = multMatch[2].trim();
      }
      if (!Number.isSafeInteger(effectiveQty) || effectiveQty < 1 || effectiveQty > 1000)
        return {success:false,message:'بڕی فرۆشتن نادروستە'};
      const fixed = resolveFixedPackBarcode(products,queryStr);
      if (fixed?.conflict)
        return {success:false,message:'بارکۆدی دەستە/سێت دووبارە تۆمارکراوە؛ پێویستە چاک بکرێت'};
      if (fixed?.product) {
        p = fixed.product;
        mode = fixed.mode;
        if (requestedMode && requestedMode !== mode)
          return {success:false,message:'شێوازی فرۆشتن لەگەڵ بارکۆدی دەستە/سێت ناگونجێت'};
      } else {
        const match = findProductByCode(queryStr);
        if (!match) return {success:false,message:'ئەم بارکۆدە نەدۆزرایەوە!'};
        p = match.product;
        mode = requestedMode || match.mode;
        isScale = Boolean(match.isScale);
        scaleGrams = match.scaleGrams || 1000;
        if (mode === 'bundle' || mode === 'set')
          return {success:false,message:'بارکۆدی دەستە/سێت نەدۆزرایەوە'};
      }
      scanBarcode = queryStr;
    } else {
      p = input;
      mode = requestedMode || (p.sale_mode === 'carton' ? 'carton' : 'unit');
      const selected = saleUnitConfig(p,mode);
      if (!selected)
        return {success:false,message:'ئەم شێوازی فرۆشتنە بۆ کاڵاکە ئامادە نییە'};
      scanBarcode = selected.barcode;
    }

    if (isScale) {
      if (requestedMode && requestedMode !== 'unit')
        return {success:false,message:'یەکەی کێش ناکرێت بگۆڕدرێت'};
      effectiveQty = 1;
    }
    const selected = saleUnitConfig(p,mode);
    if (!selected || (!isScale && (mode === 'bundle' || mode === 'set') &&
      scanBarcode !== selected.barcode && !selected.aliases.includes(scanBarcode))) {
      return {success:false,message:'زانیاریی دەستە/سێت یان نرخی فرۆشتن نادروستە'};
    }
    const unitsPerPackage = isScale ? scaleGrams / 1000 : selected.units;
    const pricePerUnit = isScale
      ? Math.round(p.unit_sale_price_iqd * scaleGrams / 1000)
      : selected.price;
    if (!Number.isSafeInteger(pricePerUnit) || pricePerUnit <= 0)
      return {success:false,message:'نرخی فرۆشتن نادروستە'};

    if (isScale && cart.some(c => c.barcode === scanBarcode)) {
      return {success:false,message:'ئەم لیبڵەی تەرازوو پێشتر تۆمارکراوە!'};
    }
    const alreadyUsedBaseUnits = cart.reduce((sum,line) =>
      line.productId === p.id ? sum + line.qty * line.units : sum,0);
    if (!Number.isFinite(p.stock) || p.stock < 0 ||
      alreadyUsedBaseUnits + unitsPerPackage * effectiveQty > p.stock + 0.000001) {
      return {success:false,message:`بڕی بەردەست لە کۆگا تەواوبووە! (بەردەست: ${p.stock})`};
    }
    const existingIndex = isScale ? -1 : cart.findIndex(c =>
      !c.isScale && c.productId === p.id && c.mode === mode &&
      c.price === pricePerUnit && c.units === unitsPerPackage);
    if (existingIndex >= 0) {
      setCart(prev => prev.map((line,index) =>
        index === existingIndex ? {...line,qty:line.qty + effectiveQty} : line));
    } else {
      const newLine:CartLine = {
        id: `cart-${crypto.randomUUID()}`, productId:p.id,
        name: isScale ? `${p.name} (${(scaleGrams/1000).toFixed(3)} کگم)` : selected.name,
        barcode: scanBarcode,mode,price:pricePerUnit,qty:effectiveQty,
        units:unitsPerPackage,isScale,scaleGrams:isScale?scaleGrams:undefined,available:p.stock
      };
      setCart(prev => [...prev,newLine]);
    }
    return {success:true};
  };

  const updateCartQty = (index: number, nextQty: number): { success: boolean; message?: string } => {
    if (index < 0 || index >= cart.length) return { success: false };
    if (!Number.isSafeInteger(nextQty) || nextQty < 0 || nextQty > 1000)
      return {success:false,message:'بڕی سەبەتە دەبێت ژمارەی دروست بێت'};
    const line = cart[index];
    if (line.isScale && nextQty > 1) {
      return { success: false, message: 'کێشی تەرازوو ناگۆڕدرێت؛ دانەی جیاواز بسکێنە' };
    }
    if (nextQty <= 0) {
      removeFromCart(index);
      return { success: true };
    }

    const p = products.find(x => x.id === line.productId);
    if (!p) return { success: false };

    // Calculate other usages in cart
    const otherUsed = cart.reduce((sum, l, i) => {
      return i !== index && l.productId === p.id ? sum + l.qty * l.units : sum;
    }, 0);

    const neededTotal = otherUsed + nextQty * line.units;
    if (neededTotal > p.stock + 0.001) {
      return { success: false, message: `تەنها ${p.stock} لەم کاڵایە لە کۆگا بەردەستە!` };
    }

    const next = [...cart];
    next[index] = { ...line, qty: nextQty };
    setCart(next);
    return { success: true };
  };

  const toggleCartLineMode = (index: number): { success: boolean; message?: string } => {
    if (index < 0 || index >= cart.length) return { success: false };
    const line = cart[index];
    if (line.isScale || line.mode === 'bundle' || line.mode === 'set') {
      return {success:false,message:'دەستە/سێت و کاڵای کێش بە ئەم دوگمەیە ناگۆڕدرێن'};
    }
    const p = products.find(x => x.id === line.productId);
    if (!p || !p.carton) {
      return { success: false, message: 'ئەم کاڵایە زانیاریی کارتۆنی نییە' };
    }

    const nextMode: 'unit' | 'carton' = line.mode === 'unit' ? 'carton' : 'unit';
    const nextUnits = nextMode === 'carton' ? p.carton.units_per_carton : 1;
    const nextPrice = nextMode === 'carton' ? p.carton.sale_price_iqd : p.unit_sale_price_iqd;
    const nextName = nextMode === 'carton' ? (p.carton.name || `کارتۆنی ${p.name}`) : p.name;
    const nextBarcode = nextMode === 'carton' ? p.carton.barcode : p.unit_barcode;

    const otherUsed = cart.reduce((sum, l, i) => {
      return i !== index && l.productId === p.id ? sum + l.qty * l.units : sum;
    }, 0);

    if (otherUsed + line.qty * nextUnits > p.stock + 0.001) {
      return {
        success: false,
        message: `بڕی کۆگا بەشی ${line.qty} کارتۆن ناکات! (بەردەست: ${p.stock} یەکە)`
      };
    }

    const next = [...cart];
    next[index] = {
      ...line,
      mode: nextMode,
      units: nextUnits,
      price: nextPrice,
      name: nextName,
      barcode: nextBarcode
    };
    setCart(next);
    return { success: true };
  };

  const removeFromCart = (index: number) => {
    setCart(prev => prev.filter((_, i) => i !== index));
  };

  const clearCart = () => {
    setCart([]);
  };

  const parkCart = (customLabel?: string): boolean => {
    if (cart.length === 0) return false;
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

  const restoreParkedCart = (parkedId?: string) => {
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
          label: `سەبەتەی گۆڕدراو`,
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
      id: `cust-${Date.now()}`,
      createdAt: new Date().toISOString()
    };
    setCustomers(prev => [cust, ...prev]);
    addAuditLog('کڕیاری نوێ', `کڕیاری نوێ تۆمارکرا: ${cust.name} (${cust.phone})`);
    return cust;
  };

  const recordDebtRepayment = (customerId: string, amount: number) => {
    if (amount <= 0) return;
    const custName = customers.find(c => c.id === customerId)?.name || customerId;
    setCustomers(prev =>
      prev.map(c => {
        if (c.id === customerId) {
          const newDebt = Math.max(0, c.balanceDebt - amount);
          return { ...c, balanceDebt: newDebt };
        }
        return c;
      })
    );

    // Increase shift cash
    setCurrentShift(prev => ({
      ...prev,
      cashSales: prev.cashSales + amount,
      expectedCash: prev.expectedCash + amount
    }));

    addAuditLog('دانەوەی قەرز', `بڕی ${amount.toLocaleString('en-US')} IQD قەرز لەلایەن کڕیار (${custName}) گەڕێنرایەوە`);
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
    if (amount <= 0) return;
    const sup = suppliers.find(s => s.id === supplierId);
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
      `بڕی ${amount.toLocaleString('en-US')} IQD درا بە دابینکەر (${sup?.name || supplierId})${fromCashDrawer ? ' لە سندووقی کاشێر' : ' لە قاسەی گشتی'}`
    );
  };

  const recordExpense = (title: string, amount: number, category: string, note?: string) => {
    if (amount <= 0) return;
    const newExp: Expense = {
      id: `exp-${Date.now()}`,
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
  };

  const closeShift = (actualCash: number): Shift => {
    const discrepancy = actualCash - currentShift.expectedCash;
    const closed: Shift = {
      ...currentShift,
      closedAt: new Date().toISOString(),
      actualCash,
      discrepancy,
      status: 'closed'
    };
    setCurrentShift(closed);
    addAuditLog(
      'داخستنی شێفت',
      `شێفت داخرا. چاوەڕوانکراو: ${closed.expectedCash.toLocaleString()} IQD, ژمێردراو: ${actualCash.toLocaleString()} IQD, جیاوازی: ${discrepancy.toLocaleString()} IQD`
    );
    return closed;
  };

  const openNewShift = (cashierName: string, openingFloat: number): Shift => {
    const newShift: Shift = {
      id: `shift-${Date.now()}`,
      cashierName,
      openedAt: new Date().toISOString(),
      closedAt: null,
      openingFloat,
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

  const checkoutLockedRef = useRef(false);
  useEffect(() => { if (cart.length === 0) checkoutLockedRef.current = false; }, [cart]);
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
    if (checkoutLockedRef.current)
      return {success:false,error:'فرۆشتنەکە پێشتر نێردراوە'};
    const preflight = validateDemoSaleCart(cart,products);
    if (!preflight.ok)
      return {success:false,error:'زانیاریی بارکۆد، نرخ، بڕ یان کۆگا گۆڕاوە؛ سەبەتە نوێ بکەرەوە ('+preflight.reason+')'};

    if (currentShift.status !== 'open') {
      return { success: false, error: 'شێفتی کاشێر داخراوە! تکایە سەرەتا شێفتێکی نوێ بکەرەوە.' };
    }

    const subtotal = preflight.subtotal;
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

    checkoutLockedRef.current = true;
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

    // Sequential per-product snapshots preserve correct stock ledger across mixed pack lines.
    const stockBefore = new Map(products.map(p => [p.id,p.stock]));
    const movements:StockMovement[] = cart.map(line => {
      const previousStock = stockBefore.get(line.productId) ?? 0;
      const quantity = line.qty * line.units;
      const newStock = Number((previousStock - quantity).toFixed(3));
      stockBefore.set(line.productId,newStock);
      return {
        id: 'mov-'+crypto.randomUUID(), productId:line.productId,productName:line.name,
        type:'sale',quantityDelta:-quantity,mode:line.mode,
        previousStock,newStock,reference:`پسووڵەی ${receiptNum}`,
        createdAt:new Date().toISOString()
      };
    });
    setStockMovements(prev => [...movements,...prev]);

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
    setActiveReceiptForModal(newReceipt);
    setCart([]);

    addAuditLog('فرۆشتنی تاقیکردنەوە', `پسووڵەی نموونەیی ${receiptNum} بە سەرکەوتوویی تەواوبوو بە کۆی ${grandTotal.toLocaleString()} IQD (${options.paymentMethod === 'cash' ? 'نەختینە' : 'قەرز'})`);

    return { success: true, receipt: newReceipt };
  };

  const recordSaleReturn = (options: {
    receiptNo: string;
    productId: string;
    qty: number;
    mode?: SaleUnitMode;
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
