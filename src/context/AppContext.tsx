import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
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
  PaymentMethod
} from '../types';
import {
  INITIAL_PRODUCTS,
  INITIAL_CUSTOMERS,
  INITIAL_SUPPLIERS,
  INITIAL_SHIFT
} from '../data/initialData';
import { parseScaleBarcode } from '../utils/retailHelpers';

const STORAGE_KEY = 'kanichnar_retail_pos_v18';

interface AppContextType {
  currentView: NavView;
  subtab: string;
  navigateTo: (view: NavView, subtab?: string) => void;

  products: Product[];
  addProduct: (p: Omit<Product, 'id'>) => Product;
  updateProduct: (id: string, p: Partial<Product>) => void;
  deleteProduct: (id: string) => void;
  adjustStock: (productId: string, delta: number, mode: 'unit' | 'carton', reason: string) => void;
  receiveStock: (productId: string, quantity: number, mode: 'unit' | 'carton', supplierId?: string, invoiceNo?: string) => void;

  cart: CartLine[];
  addToCart: (input: string | Product, mode?: 'unit' | 'carton') => { success: boolean; message?: string };
  updateCartQty: (index: number, nextQty: number) => { success: boolean; message?: string };
  removeFromCart: (index: number) => void;
  clearCart: () => void;
  parkedCart: CartLine[] | null;
  parkCart: () => boolean;
  restoreParkedCart: () => void;

  customers: Customer[];
  addCustomer: (c: Omit<Customer, 'id' | 'createdAt'>) => Customer;
  recordDebtRepayment: (customerId: string, amount: number) => void;

  suppliers: Supplier[];
  addSupplier: (s: Omit<Supplier, 'id'>) => Supplier;

  currentShift: Shift;
  expenses: Expense[];
  recordExpense: (title: string, amount: number, category: string, note?: string) => void;
  closeShift: (actualCash: number) => Shift;
  openNewShift: (cashierName: string, openingFloat: number) => Shift;

  receipts: Receipt[];
  completeCheckout: (options: {
    paymentMethod: PaymentMethod;
    customerId?: string | null;
    customerName?: string;
    paidAmount?: number;
    discountPercent?: number;
    discountAmount?: number;
    notes?: string;
  }) => { success: boolean; receipt?: Receipt; error?: string };

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
      if (saved) return JSON.parse(saved);
    } catch (_e) {}
    return [];
  });

  const [stockMovements, setStockMovements] = useState<StockMovement[]>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_movements`);
      if (saved) return JSON.parse(saved);
    } catch (_e) {}
    return [];
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
  const [parkedCart, setParkedCart] = useState<CartLine[] | null>(null);
  const [lastReceipt, setLastReceipt] = useState<Receipt | null>(null);
  const [activeReceiptForModal, setActiveReceiptForModal] = useState<Receipt | null>(null);

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

  const navigateTo = (view: NavView, targetSubtab?: string) => {
    setCurrentView(view);
    if (targetSubtab !== undefined) {
      setSubtab(targetSubtab);
    }
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

    // Check Scale Barcode (starts with 27)
    if (/^27[0-9]{11}$/.test(trimmed)) {
      const scaleInfo = parseScaleBarcode(trimmed);
      if (scaleInfo.isScale && scaleInfo.itemCode) {
        // Look up by scale product or plu or barcode prefix
        const p = products.find(
          x =>
            (x.is_scale_product && x.plu === scaleInfo.itemCode) ||
            (x.base_unit === 'kg' && x.unit_barcode.includes(scaleInfo.itemCode!)) ||
            x.unit_barcode === trimmed.slice(0, 7) ||
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

    return null;
  };

  const addToCart = (input: string | Product, requestedMode?: 'unit' | 'carton'): { success: boolean; message?: string } => {
    let p: Product;
    let mode: 'unit' | 'carton' = requestedMode || 'unit';
    let isScale = false;
    let scaleGrams = 1000;
    let scanBarcode = '';

    if (typeof input === 'string') {
      const match = findProductByCode(input);
      if (!match) {
        return { success: false, message: 'ئەم بارکۆدە نەدۆزرایەوە!' };
      }
      p = match.product;
      mode = requestedMode || match.mode;
      isScale = match.isScale || false;
      scaleGrams = match.scaleGrams || 1000;
      scanBarcode = input.trim();
    } else {
      p = input;
      mode = requestedMode || (p.sale_mode === 'carton' ? 'carton' : 'unit');
      scanBarcode = mode === 'carton' && p.carton ? p.carton.barcode : p.unit_barcode;
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

    if (alreadyUsedBaseUnits + unitsPerPackage > p.stock + 0.001) {
      return { success: false, message: `بڕی بەردەست لە کۆگا تەواوبووە! (بەردەست: ${p.stock})` };
    }

    // Check if can merge with existing line
    const existingIndex = isScale
      ? -1
      : cart.findIndex(c => c.productId === p.id && c.mode === mode && c.price === pricePerUnit);

    if (existingIndex >= 0) {
      const nextCart = [...cart];
      nextCart[existingIndex].qty += 1;
      setCart(nextCart);
    } else {
      const newLine: CartLine = {
        id: `cart-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        productId: p.id,
        name: isScale ? `${p.name} (${(scaleGrams / 1000).toFixed(3)} کگم)` : (mode === 'carton' && p.carton?.name ? p.carton.name : p.name),
        barcode: scanBarcode,
        mode,
        price: pricePerUnit,
        qty: 1,
        units: unitsPerPackage,
        isScale,
        scaleGrams: isScale ? scaleGrams : undefined,
        available: p.stock
      };
      setCart(prev => [...prev, newLine]);
    }

    return { success: true };
  };

  const updateCartQty = (index: number, nextQty: number): { success: boolean; message?: string } => {
    if (index < 0 || index >= cart.length) return { success: false };
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

  const removeFromCart = (index: number) => {
    setCart(prev => prev.filter((_, i) => i !== index));
  };

  const clearCart = () => {
    setCart([]);
  };

  const parkCart = (): boolean => {
    if (cart.length === 0) return false;
    setParkedCart([...cart]);
    setCart([]);
    addAuditLog('پاراستنی سەبەتە', 'سەبەتەی کاشێر هەڵگیرا بۆ کڕیاری داهاتوو');
    return true;
  };

  const restoreParkedCart = () => {
    if (!parkedCart) return;
    setCart([...parkedCart]);
    setParkedCart(null);
    addAuditLog('گەڕاندنەوەی سەبەتە', 'سەبەتەی پارێزراو هێنرایەوە');
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

    addAuditLog('دانەوەی قەرز', `بڕی ${amount.toLocaleString()} IQD قەرز لەلایەن کڕیارەوە گەڕێنرایەوە`);
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

    const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
    const discount = options.discountAmount || (options.discountPercent ? Math.round((subtotal * options.discountPercent) / 100) : 0);
    const grandTotal = Math.max(0, subtotal - discount);

    const paid = options.paidAmount !== undefined ? options.paidAmount : (options.paymentMethod === 'cash' ? grandTotal : 0);
    const change = options.paymentMethod === 'cash' && paid >= grandTotal ? paid - grandTotal : 0;

    const receiptNum = `RCP-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;

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
    setActiveReceiptForModal(newReceipt);
    setCart([]);

    addAuditLog('فرۆشتنی پسووڵە', `پسووڵەی ${receiptNum} بە سەرکەوتوویی تەواوبوو بە کۆی ${grandTotal.toLocaleString()} IQD (${options.paymentMethod === 'cash' ? 'نەختینە' : 'قەرز'})`);

    return { success: true, receipt: newReceipt };
  };

  const exportBackupJson = (): string => {
    const backup = {
      backup_version: 1,
      preferred_disk: 'D:',
      disk_path: 'D:\\SupermarketPOS_Data\\backups',
      saved_at: new Date().toISOString(),
      store: {
        name: 'سوپەرمارکێتی کانی چنار',
        address: 'هەولێر — کانی چنار',
        phone: '0750 000 0000'
      },
      snapshot: {
        products,
        customers,
        suppliers,
        shift: currentShift,
        receipts,
        expenses,
        stockMovements,
        auditLogs
      }
    };
    return JSON.stringify(backup, null, 2);
  };

  const importBackupJson = (jsonString: string): { success: boolean; error?: string } => {
    try {
      const parsed = JSON.parse(jsonString);
      const snapshot = parsed.snapshot || parsed;
      if (Array.isArray(snapshot.products)) setProducts(snapshot.products);
      if (Array.isArray(snapshot.customers)) setCustomers(snapshot.customers);
      if (Array.isArray(snapshot.suppliers)) setSuppliers(snapshot.suppliers);
      if (snapshot.shift) setCurrentShift(snapshot.shift);
      if (Array.isArray(snapshot.receipts)) setReceipts(snapshot.receipts);
      if (Array.isArray(snapshot.expenses)) setExpenses(snapshot.expenses);
      if (Array.isArray(snapshot.stockMovements)) setStockMovements(snapshot.stockMovements);
      if (Array.isArray(snapshot.auditLogs)) setAuditLogs(snapshot.auditLogs);

      addAuditLog('هێنانەوەی پاڵپشت', 'داتابەیسی سیستەم لە فایلی دیسک هێنرایەوە');
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'فایلی داتا نادروستە' };
    }
  };

  return (
    <AppContext.Provider
      value={{
        currentView,
        subtab,
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
        removeFromCart,
        clearCart,
        parkedCart,
        parkCart,
        restoreParkedCart,
        customers,
        addCustomer,
        recordDebtRepayment,
        suppliers,
        addSupplier,
        currentShift,
        expenses,
        recordExpense,
        closeShift,
        openNewShift,
        receipts,
        completeCheckout,
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
