import { Product, Customer, Supplier, Shift, Receipt, StockMovement } from '../types';

export const INITIAL_PRODUCTS: Product[] = [
  {
    id: 'prod-1',
    name: 'ئاوی کانی چنار 500ml',
    sku: 'WTR-500',
    plu: null,
    sale_mode: 'both',
    base_unit: 'unit',
    unit_barcode: '2000000000018',
    unit_purchase_price_iqd: 175,
    unit_sale_price_iqd: 250,
    unit_alias_barcodes: ['010101'],
    carton: {
      name: 'کارتۆنی ئاوی کانی چنار (24 دانە)',
      barcode: '2000000000025',
      alias_barcodes: [],
      units_per_carton: 24,
      purchase_price_iqd: 3800,
      sale_price_iqd: 5000
    },
    stock: 240,
    min_stock: 48,
    category: 'خواردنەوەکان',
    expiry_date: '2027-12-31'
  },
  {
    id: 'prod-2',
    name: 'ڕۆنی زەیتی زێڕین 1L',
    sku: 'OIL-1L',
    plu: null,
    sale_mode: 'both',
    base_unit: 'unit',
    unit_barcode: '8690504100234',
    unit_purchase_price_iqd: 2600,
    unit_sale_price_iqd: 3250,
    unit_alias_barcodes: [],
    carton: {
      name: 'کارتۆنی ڕۆنی زێڕین (12 دانە)',
      barcode: '8690504100999',
      alias_barcodes: [],
      units_per_carton: 12,
      purchase_price_iqd: 30000,
      sale_price_iqd: 37500
    },
    stock: 96,
    min_stock: 24,
    category: 'خۆراک',
    expiry_date: '2027-06-15'
  },
  {
    id: 'prod-3',
    name: 'برنجی کوردی کوردمەیدان 5kg',
    sku: 'RICE-5KG',
    plu: null,
    sale_mode: 'unit',
    base_unit: 'unit',
    unit_barcode: '2000000000032',
    unit_purchase_price_iqd: 10500,
    unit_sale_price_iqd: 12500,
    unit_alias_barcodes: [],
    carton: null,
    stock: 45,
    min_stock: 10,
    category: 'خۆراک',
    expiry_date: '2027-08-30'
  },
  {
    id: 'prod-4',
    name: 'چای مەحموود 454g',
    sku: 'TEA-454',
    plu: null,
    sale_mode: 'both',
    base_unit: 'unit',
    unit_barcode: '8690123456789',
    unit_purchase_price_iqd: 3750,
    unit_sale_price_iqd: 4500,
    unit_alias_barcodes: [],
    carton: {
      name: 'کارتۆنی چای مەحموود (24 دانە)',
      barcode: '8690123459995',
      alias_barcodes: [],
      units_per_carton: 24,
      purchase_price_iqd: 87000,
      sale_price_iqd: 102000
    },
    stock: 60,
    min_stock: 12,
    category: 'خۆراک',
    expiry_date: '2028-01-01'
  },
  {
    id: 'prod-5',
    name: 'ماستی خۆماڵی 1kg',
    sku: 'YOG-1KG',
    plu: null,
    sale_mode: 'unit',
    base_unit: 'unit',
    unit_barcode: '2000000000056',
    unit_purchase_price_iqd: 1600,
    unit_sale_price_iqd: 2000,
    unit_alias_barcodes: [],
    carton: null,
    stock: 6,
    min_stock: 10,
    category: 'شیرەمەنی',
    expiry_date: '2026-11-20'
  },
  {
    id: 'prod-6',
    name: 'تەماتە (مەوزوون / کێش)',
    sku: 'VEG-TOMATO',
    plu: '00001',
    sale_mode: 'unit',
    base_unit: 'kg',
    unit_barcode: '2700001', // prefix for scale barcode
    unit_purchase_price_iqd: 750,
    unit_sale_price_iqd: 1000,
    unit_alias_barcodes: ['2700001007505'], // example scale barcode
    carton: null,
    stock: 150,
    min_stock: 20,
    category: 'سەوزە و میوە',
    is_scale_product: true
  },
  {
    id: 'prod-7',
    name: 'سێوی سووری خۆماڵی (کێش)',
    sku: 'FRT-APPLE',
    plu: '00002',
    sale_mode: 'unit',
    base_unit: 'kg',
    unit_barcode: '2700002',
    unit_purchase_price_iqd: 1100,
    unit_sale_price_iqd: 1500,
    unit_alias_barcodes: ['2700002012003'],
    carton: null,
    stock: 120,
    min_stock: 15,
    category: 'سەوزە و میوە',
    is_scale_product: true
  },
  {
    id: 'prod-8',
    name: 'نانی تیری (بستەی 5 نان)',
    sku: 'BREAD-5',
    plu: null,
    sale_mode: 'unit',
    base_unit: 'unit',
    unit_barcode: '2000000000087',
    unit_purchase_price_iqd: 800,
    unit_sale_price_iqd: 1000,
    unit_alias_barcodes: [],
    carton: null,
    stock: 80,
    min_stock: 15,
    category: 'نانەوا',
    expiry_date: '2026-11-05'
  },
  {
    id: 'prod-9',
    name: 'پەنیری سپی ئەڵمانی 400g',
    sku: 'CHS-400',
    plu: null,
    sale_mode: 'unit',
    base_unit: 'unit',
    unit_barcode: '4001234567890',
    unit_purchase_price_iqd: 1950,
    unit_sale_price_iqd: 2500,
    unit_alias_barcodes: [],
    carton: null,
    stock: 50,
    min_stock: 10,
    category: 'شیرەمەنی',
    expiry_date: '2027-02-15'
  },
  {
    id: 'prod-10',
    name: 'پاککەرەوەی دیتۆل 500ml',
    sku: 'CLN-DETTOL',
    plu: null,
    sale_mode: 'unit',
    base_unit: 'unit',
    unit_barcode: '5000123456789',
    unit_purchase_price_iqd: 2900,
    unit_sale_price_iqd: 3750,
    unit_alias_barcodes: [],
    carton: null,
    stock: 7,
    min_stock: 10,
    category: 'پاککەرەوە',
    expiry_date: '2028-05-20'
  },
  {
    id: 'prod-11',
    name: 'شەربەتی ڕانی مۆز و شلیک 240ml',
    sku: 'JUC-RANI',
    plu: null,
    sale_mode: 'both',
    base_unit: 'unit',
    unit_barcode: '6281001234567',
    unit_purchase_price_iqd: 550,
    unit_sale_price_iqd: 750,
    unit_alias_barcodes: [],
    carton: {
      name: 'کارتۆنی شەربەتی ڕانی (24 دانە)',
      barcode: '6281001234994',
      alias_barcodes: [],
      units_per_carton: 24,
      purchase_price_iqd: 13000,
      sale_price_iqd: 16500
    },
    stock: 144,
    min_stock: 24,
    category: 'خواردنەوەکان',
    expiry_date: '2027-04-10'
  },
  {
    id: 'prod-12',
    name: 'شیرینی و پسکیتی لوتس 250g',
    sku: 'BSK-LOTUS',
    plu: null,
    sale_mode: 'unit',
    base_unit: 'unit',
    unit_barcode: '5410126116954',
    unit_purchase_price_iqd: 1750,
    unit_sale_price_iqd: 2250,
    unit_alias_barcodes: [],
    carton: null,
    stock: 70,
    min_stock: 12,
    category: 'شیرینی و پسکیت',
    expiry_date: '2027-09-18'
  }
];

export const INITIAL_CUSTOMERS: Customer[] = [
  {
    id: 'cust-1',
    name: 'ئارام بارزانی',
    phone: '0750 123 4567',
    balanceDebt: 45000,
    note: 'کڕیاری دەستپاک و بەردەوام',
    createdAt: '2026-09-01T10:00:00Z'
  },
  {
    id: 'cust-2',
    name: 'هەڵگورد ئەحمەد',
    phone: '0770 987 6543',
    balanceDebt: 15000,
    note: 'کانی چنار — کۆڵانی 4',
    createdAt: '2026-09-15T14:30:00Z'
  },
  {
    id: 'cust-3',
    name: 'دکتۆر سەردار',
    phone: '0750 333 4455',
    balanceDebt: 0,
    note: 'پارەی نەختینە دەدات',
    createdAt: '2026-10-01T09:15:00Z'
  },
  {
    id: 'cust-4',
    name: 'کاک ڕێبوار کانی چنار',
    phone: '0750 555 6677',
    balanceDebt: 82500,
    note: 'سەری هەموو مانگێک پاکتاو دەکات',
    createdAt: '2026-10-10T16:20:00Z'
  }
];

export const INITIAL_SUPPLIERS: Supplier[] = [
  {
    id: 'sup-1',
    name: 'کۆمپانیای ئەلبورز بۆ دابەشکردنی خۆراک',
    phone: '0750 888 9900',
    address: 'هەولێر — کۆگاکانی مەخموور',
    balanceDebt: 450000
  },
  {
    id: 'sup-2',
    name: 'دابینکەری شیرەمەنی چیا',
    phone: '0770 111 2233',
    address: 'هەولێر — ناوچەی پیشەسازی',
    balanceDebt: 180000
  },
  {
    id: 'sup-3',
    name: 'دابەشکەری میوە و سەوزەی مەیدان',
    phone: '0750 444 7788',
    address: 'هەولێر — عەلوەی گەورە',
    balanceDebt: 95000
  }
];

export const INITIAL_SHIFT: Shift = {
  id: 'shift-1',
  cashierName: 'ئارام (کاشێری سەرەکی)',
  openedAt: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
  closedAt: null,
  openingFloat: 250000,
  cashSales: 187500,
  debtSales: 45000,
  cashReturns: 0,
  expenses: 12000,
  expectedCash: 425500, // 250000 + 187500 - 12000
  actualCash: null,
  discrepancy: null,
  status: 'open'
};

export const INITIAL_RECEIPTS: Receipt[] = [
  {
    id: 'rcp-seed-1001',
    receiptNumber: 'DEMO-RCP-1001',
    createdAt: new Date(Date.now() - 3.2 * 3600 * 1000).toISOString(),
    cashierName: 'ئارام (کاشێری سەرەکی)',
    customerId: null,
    customerName: 'کڕیاری نەختینە',
    items: [
      {
        productId: 'prod-4',
        name: 'کارتۆنی چای مەحموود (24 دانە)',
        barcode: '8690123459995',
        mode: 'carton',
        price: 102000,
        qty: 1,
        units: 24,
        total: 102000
      }
    ],
    subtotal: 102000,
    discount: 0,
    discountPercent: 0,
    tax: 0,
    total: 102000,
    paidAmount: 105000,
    changeAmount: 3000,
    paymentMethod: 'cash'
  },
  {
    id: 'rcp-seed-1002',
    receiptNumber: 'DEMO-RCP-1002',
    createdAt: new Date(Date.now() - 2.1 * 3600 * 1000).toISOString(),
    cashierName: 'ئارام (کاشێری سەرەکی)',
    customerId: 'cust-3',
    customerName: 'دکتۆر سەردار',
    items: [
      {
        productId: 'prod-3',
        name: 'برنجی کوردی کوردمەیدان 5kg',
        barcode: '2000000000032',
        mode: 'unit',
        price: 12500,
        qty: 6,
        units: 1,
        total: 75000
      },
      {
        productId: 'prod-11',
        name: 'شەربەتی ڕانی مۆز و شلیک 240ml',
        barcode: '6281001234567',
        mode: 'unit',
        price: 750,
        qty: 14,
        units: 1,
        total: 10500
      }
    ],
    subtotal: 85500,
    discount: 0,
    discountPercent: 0,
    tax: 0,
    total: 85500,
    paidAmount: 85500,
    changeAmount: 0,
    paymentMethod: 'cash'
  },
  {
    id: 'rcp-seed-1003',
    receiptNumber: 'DEMO-RCP-1003',
    createdAt: new Date(Date.now() - 1.1 * 3600 * 1000).toISOString(),
    cashierName: 'ئارام (کاشێری سەرەکی)',
    customerId: 'cust-1',
    customerName: 'ئارام بارزانی',
    items: [
      {
        productId: 'prod-3',
        name: 'برنجی کوردی کوردمەیدان 5kg',
        barcode: '2000000000032',
        mode: 'unit',
        price: 12500,
        qty: 3,
        units: 1,
        total: 37500
      },
      {
        productId: 'prod-10',
        name: 'پاککەرەوەی دیتۆل 500ml',
        barcode: '5000123456789',
        mode: 'unit',
        price: 3750,
        qty: 2,
        units: 1,
        total: 7500
      }
    ],
    subtotal: 45000,
    discount: 0,
    discountPercent: 0,
    tax: 0,
    total: 45000,
    paidAmount: 0,
    changeAmount: 0,
    paymentMethod: 'debt'
  }
];

export const INITIAL_STOCK_MOVEMENTS: StockMovement[] = [
  {
    id: 'mov-seed-1',
    productId: 'prod-1',
    productName: 'ئاوی کانی چنار 500ml',
    type: 'receive',
    quantityDelta: 120,
    mode: 'carton',
    previousStock: 120,
    newStock: 240,
    reference: 'پسووڵەی کڕین INV-2026-104 (کۆمپانیای ئەلبورز)',
    createdAt: new Date(Date.now() - 3.8 * 3600 * 1000).toISOString()
  },
  {
    id: 'mov-seed-2',
    productId: 'prod-3',
    productName: 'برنجی کوردی کوردمەیدان 5kg',
    type: 'Sale' as any === 'Sale' ? 'sale' : 'sale',
    quantityDelta: -6,
    mode: 'unit',
    previousStock: 54,
    newStock: 48,
    reference: 'پسووڵە DEMO-RCP-1001',
    createdAt: new Date(Date.now() - 3.2 * 3600 * 1000).toISOString()
  },
  {
    id: 'mov-seed-3',
    productId: 'prod-4',
    productName: 'چای مەحموود 454g',
    type: 'adjust',
    quantityDelta: 24,
    mode: 'carton',
    previousStock: 36,
    newStock: 60,
    reference: 'گواستنەوە لە کۆگای سەرەکی بۆ ڕەفەی فرۆشگا (TR-101)',
    createdAt: new Date(Date.now() - 2.6 * 3600 * 1000).toISOString()
  },
  {
    id: 'mov-seed-4',
    productId: 'prod-2',
    productName: 'ڕۆنی زەیتی زێڕین 1L',
    type: 'sale',
    quantityDelta: -24,
    mode: 'carton',
    previousStock: 120,
    newStock: 96,
    reference: 'پسووڵە DEMO-RCP-1002',
    createdAt: new Date(Date.now() - 2.1 * 3600 * 1000).toISOString()
  },
  {
    id: 'mov-seed-5',
    productId: 'prod-10',
    productName: 'پاککەرەوەی دیتۆل 500ml',
    type: 'sale',
    quantityDelta: -2,
    mode: 'unit',
    previousStock: 9,
    newStock: 7,
    reference: 'پسووڵە DEMO-RCP-1003',
    createdAt: new Date(Date.now() - 0.9 * 3600 * 1000).toISOString()
  }
];

