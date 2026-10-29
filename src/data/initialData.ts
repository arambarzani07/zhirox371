import { Product, Customer, Supplier, Shift } from '../types';

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
    stock: 30,
    min_stock: 5,
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
    stock: 35,
    min_stock: 8,
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
