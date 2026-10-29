import React from 'react';

export const CARD_ICON_PATHS: Record<string, string> = {
  "cash-register": '<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M7 9h10M7 13h3m4 0h3M7 17h10M8 5V3h8v2"/>',
  "product-box": '<path d="m12 2 9 5-9 5-9-5 9-5ZM3 7v10l9 5 9-5V7M12 12v10"/><path d="m7.5 4.5 9 5"/>',
  "warehouse": '<path d="M3 10V6l9-4 9 4v4M3 10v11h18V10M7 21v-9h10v9M7 16h10"/><path d="M3 10h18"/>',
  "people": '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M17 5a3 3 0 0 1 0 6m1 4a5 5 0 0 1 3 5v1"/>',
  "delivery-truck": '<path d="M2 6h12v11H2zM14 10h4l4 4v3h-8M2 17h2m10 0h2"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
  "wallet": '<rect x="2" y="5" width="20" height="15" rx="2"/><path d="M18 5V3H5a3 3 0 0 0-3 3M22 11h-7a3 3 0 0 0 0 6h7"/><circle cx="16" cy="14" r=".5" fill="currentColor"/>',
  "chart-bars": '<path d="M3 3v18h18M7 17v-5h3v5M13 17V8h3v9M19 17V5h2v12"/>',
  "settings-gear": '<path d="M10 2h4l.7 2.4 2.2.9 2.2-1.2 2.8 2.8-1.2 2.2.9 2.2L24 12l-2.4.7-.9 2.2 1.2 2.2-2.8 2.8-2.2-1.2-2.2.9L14 22h-4l-.7-2.4-2.2-.9-2.2 1.2-2.8-2.8 1.2-2.2-.9-2.2L0 12l2.4-.7.9-2.2-1.2-2.2 2.8-2.8 2.2 1.2 2.2-.9z" transform="translate(2 0) scale(.83 1)"/><circle cx="12" cy="12" r="3"/>',
  "offer-badge": '<path d="m12 2 3 2 4-.2.2 4L22 12l-2.8 4.2-.2 4-4-.2-3 2-3-2-4 .2-.2-4L2 12l2.8-4.2.2-4 4 .2z"/><path d="m8 16 8-8"/><circle cx="8" cy="8" r="1"/><circle cx="16" cy="16" r="1"/>',
  "printer": '<path d="M6 9V3h12v6M6 18H3V9h18v9h-3M6 15h12v7H6z"/><path d="M17 12h1M9 18h6"/>',
  "shift-calendar": '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M8 2v4M16 2v4M3 9h18"/><circle cx="12" cy="16" r="4"/><path d="M12 13v3l2 1"/>',
  "security-shield": '<path d="M12 2 3 6v6c0 5 3.5 8 9 10 5.5-2 9-5 9-10V6z"/><path d="m8 12 3 3 5-6"/>',

  "barcode-scan": '<path d="M8 3H4v4M16 3h4v4M4 17v4h4M20 17v4h-4M7 8v8M10 7v10M13 8v8M16 7v10M2 12h20"/>',
  "receipt": '<path d="M5 2h14v20l-3-2-4 2-4-2-3 2zM9 7h6M9 11h6M9 15h4"/>',
  "payment-notes": '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M5 3h14M5 21h14M4 10h2m12 4h2"/>',
  "return-arrow": '<path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-2"/>',
  "add-box": '<path d="m12 3 9 5-9 5-9-5 9-5ZM3 8v10l9 5 9-5V8M12 13v10M17 3v6M14 6h6"/>',
  "product-list": '<path d="M9 5h12M9 12h12M9 19h12"/><path d="m3 5 1 1 2-2M3 12l1 1 2-2M3 19l1 1 2-2"/>',
  "price-tags": '<path d="M3 3h9l9 9-9 9-9-9z"/><circle cx="8" cy="8" r="1.5"/><path d="M12 8h6M12 12h4"/>',
  "barcode-bars": '<path d="M3 4v16M6 6v12M9 4v16M12 6v12M16 4v16M19 6v12M22 4v16"/>',
  "stock-stack": '<path d="M3 4h8v7H3zM13 4h8v7h-8zM3 13h8v7H3zM13 13h8v7h-8z"/><path d="M7 4v7M17 13v7"/>',
  "low-stock": '<path d="m12 2 10 19H2zM12 9v5M12 18h.01"/><path d="M4 21h16"/>',
  "expiry": '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M8 2v4M16 2v4M3 9h18M8 13l8 6M16 13l-8 6"/>',
  "stock-transfer": '<path d="M3 7h15l-4-4M18 7l-4 4M21 17H6l4-4M6 17l4 4"/>',
  "single-customer": '<circle cx="12" cy="8" r="4"/><path d="M4 22v-2a8 8 0 0 1 16 0v2"/>',
  "debt-book": '<path d="M4 3h14v18H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2M18 3h2v18h-2M8 8h6M8 12h6M8 16h3"/>',
  "purchase-history": '<path d="M3 12a9 9 0 1 0 3-7M3 3v5h5M12 7v5l4 2"/>',
  "customer-repayment": '<path d="m3 16 4-4 3 3 5-6 4 4M16 5h5v5"/><circle cx="7" cy="6" r="2"/>',
  "purchase-order": '<rect x="5" y="3" width="14" height="19" rx="2"/><path d="M9 3V2h6v1M9 9h6M9 13h6M9 17h3"/><path d="m15 18 2 2 4-4"/>',
  "supplier-building": '<path d="M3 21V7l9-5 9 5v14M3 21h18M8 11h2M14 11h2M8 15h2M14 15h2M10 21v-4h4v4"/>',
  "receive-goods": '<path d="m12 2 9 5v10l-9 5-9-5V7zM3 7l9 5 9-5M12 12v10"/><path d="M8 2v5M6 5l2 2 2-2"/>',
  "supplier-accounts": '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 8h10M7 12h6M7 16h4M16 16l2 2 3-4"/>',
  "cash-drawer": '<rect x="2" y="8" width="20" height="12" rx="2"/><path d="M5 8V4h14v4M2 13h20M10 16h4"/>',
  "income-rise": '<path d="M3 20h18M5 16l6-6 4 3 6-7M16 6h5v5"/><circle cx="6" cy="5" r="2"/>',
  "expense-fall": '<path d="M3 4h18M5 8l6 6 4-3 6 7M16 18h5v-5"/><circle cx="6" cy="18" r="2"/>',
  "cash-movements": '<path d="M3 7h17m0 0-4-4m4 4-4 4M21 17H4m0 0 4-4m-4 4 4 4"/>',
  "sales-trend": '<path d="M3 3v18h18M6 16l4-5 4 2 6-8M16 5h4v4"/>',
  "profit-chart": '<path d="M3 21h18M6 18v-5h3v5M11 18V9h3v9M16 18V5h3v13"/><path d="m16 3 2-2 2 2"/>',
  "stock-chart": '<circle cx="12" cy="12" r="9"/><path d="M12 3v9h9M12 12l-7 6"/>',
  "ai-insights": '<path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3m8 8 3 3M19 5l-3 3M8 16l-3 3"/><circle cx="12" cy="12" r="4"/>',
  "manage-users": '<circle cx="9" cy="8" r="3"/><path d="M2 20a7 7 0 0 1 11-5M18 15v6m-3-3h6"/><circle cx="18" cy="8" r="2"/>',
  "access-key": '<circle cx="8" cy="15" r="5"/><path d="M12 12 21 3l-1 4-3 1-1 3-3 1M8 15h.01"/>',
  "connected-devices": '<rect x="2" y="3" width="15" height="12" rx="2"/><path d="M9 15v4M5 19h8"/><rect x="18" y="9" width="4" height="11" rx="1"/>',
  "system-controls": '<path d="M4 5h16M4 12h16M4 19h16"/><circle cx="8" cy="5" r="2" fill="#fff"/><circle cx="16" cy="12" r="2" fill="#fff"/><circle cx="10" cy="19" r="2" fill="#fff"/>',
  "new-offer": '<path d="M4 4h10l7 7-10 10-7-7z"/><circle cx="9" cy="9" r="1.5"/><path d="M16 3v6M13 6h6"/>',
  "discount-percent": '<circle cx="7" cy="7" r="3"/><circle cx="17" cy="17" r="3"/><path d="M5 19 19 5"/>',
  "coupon-ticket": '<path d="M3 4h18v5a3 3 0 0 0 0 6v5H3v-5a3 3 0 0 0 0-6zM12 4v3m0 3v4m0 3v3"/>',
  "promotion-speaker": '<path d="M3 10v5h5l9 5V5l-9 5zM7 15l2 6h3M20 8a6 6 0 0 1 0 9"/>',
  "price-label": '<path d="m3 12 9-9h9v9l-9 9z"/><circle cx="17" cy="7" r="1.5"/><path d="M7 15h6"/>',
  "label-barcode": '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8v8M9 7v10M12 8v8M16 7v10M19 8v8"/>',
  "batch-print": '<path d="M5 3h12v5M3 10h18v8h-4M7 18H5v-4M7 15h10v7H7zM19 5h2v6"/>',
  "print-template": '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M7 6h10M7 10h10M7 14h4M7 18h10M14 14h3"/>',
  "shift-clock": '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2M12 3V1M21 12h2"/>',
  "attendance": '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M8 2v4M16 2v4M3 9h18m-13 7 3 3 5-6"/>',
  "work-timer": '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6M12 2v3M18 5l2-2"/>',
  "staff-review": '<path d="M4 21V3h16v18M8 7h8M8 11h8"/><path d="m8 16 2 2 5-5"/>',
  "alert-bell": '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 10h18c0-3-3-3-3-10M10 21h4"/>',
  "approval-file": '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 7h8M8 11h5m-5 6 3 3 6-7"/>',
  "change-history": '<path d="M3 12a9 9 0 1 0 3-7M3 3v5h5M12 6v6l4 2"/><path d="M16 20h4"/>',
  "transaction-check": '<path d="M12 2 3 6v6c0 5 3.5 8 9 10 5.5-2 9-5 9-10V6z"/><circle cx="12" cy="11" r="4"/><path d="m10 11 2 2 3-4"/>'
};

export const MAIN_MODULE_ICONS = [
  "cash-register", "product-box", "warehouse", "people", "delivery-truck", "wallet",
  "chart-bars", "settings-gear", "offer-badge", "printer", "shift-calendar", "security-shield"
];

export const SUB_MODULE_ICONS = [
  ["barcode-scan", "receipt", "payment-notes", "return-arrow"],
  ["add-box", "product-list", "price-tags", "barcode-bars"],
  ["stock-stack", "low-stock", "expiry", "stock-transfer"],
  ["single-customer", "debt-book", "purchase-history", "customer-repayment"],
  ["purchase-order", "supplier-building", "receive-goods", "supplier-accounts"],
  ["cash-drawer", "income-rise", "expense-fall", "cash-movements"],
  ["sales-trend", "profit-chart", "stock-chart", "ai-insights"],
  ["manage-users", "access-key", "connected-devices", "system-controls"],
  ["new-offer", "discount-percent", "coupon-ticket", "promotion-speaker"],
  ["price-label", "label-barcode", "batch-print", "print-template"],
  ["shift-clock", "attendance", "work-timer", "staff-review"],
  ["alert-bell", "approval-file", "change-history", "transaction-check"]
];

export interface ModuleSpec {
  id: number;
  title: string;
  color: string;
  lightBg: string;
  iconName: string;
  submodules: {
    label: string;
    iconName: string;
    targetView: string;
    targetSubtab?: string;
  }[];
}

export const MODULE_SPECS: ModuleSpec[] = [
  {
    id: 0,
    title: "کاشێر و فرۆشتن",
    color: "#4c6dcc",
    lightBg: "#edf2ff",
    iconName: "cash-register",
    submodules: [
      { label: "فرۆشتنی نوێ", iconName: "barcode-scan", targetView: "pos" },
      { label: "پسووڵەکان", iconName: "receipt", targetView: "pos", targetSubtab: "receipts" },
      { label: "پارەدان", iconName: "payment-notes", targetView: "pos" },
      { label: "گەڕاندنەوە", iconName: "return-arrow", targetView: "pos", targetSubtab: "returns" }
    ]
  },
  {
    id: 1,
    title: "کاڵاکان",
    color: "#15987c",
    lightBg: "#e7f7f0",
    iconName: "product-box",
    submodules: [
      { label: "کاڵای نوێ", iconName: "add-box", targetView: "products", targetSubtab: "new" },
      { label: "لیستی کاڵاکان", iconName: "product-list", targetView: "products", targetSubtab: "list" },
      { label: "نرخەکان", iconName: "price-tags", targetView: "products", targetSubtab: "prices" },
      { label: "بارکۆدەکان", iconName: "barcode-bars", targetView: "products", targetSubtab: "barcodes" }
    ]
  },
  {
    id: 2,
    title: "کۆگا",
    color: "#d18b34",
    lightBg: "#fff2e2",
    iconName: "warehouse",
    submodules: [
      { label: "دۆخی کۆگا", iconName: "stock-stack", targetView: "stock", targetSubtab: "overview" },
      { label: "کاڵای کەم", iconName: "low-stock", targetView: "stock", targetSubtab: "low" },
      { label: "بەسەرچوون", iconName: "expiry", targetView: "stock", targetSubtab: "expiry" },
      { label: "هاتووچۆ", iconName: "stock-transfer", targetView: "stock", targetSubtab: "receive" }
    ]
  },
  {
    id: 3,
    title: "کڕیاران و حسابەکان",
    color: "#9565cb",
    lightBg: "#f2ebfd",
    iconName: "people",
    submodules: [
      { label: "کڕیاران", iconName: "single-customer", targetView: "customers", targetSubtab: "list" },
      { label: "قەرزەکان", iconName: "debt-book", targetView: "customers", targetSubtab: "debts" },
      { label: "مێژووی کڕین", iconName: "purchase-history", targetView: "customers", targetSubtab: "history" },
      { label: "پارەدانەکان", iconName: "customer-repayment", targetView: "customers", targetSubtab: "repayment" }
    ]
  },
  {
    id: 4,
    title: "کڕین و دابینکەران",
    color: "#168db7",
    lightBg: "#e6f5fd",
    iconName: "delivery-truck",
    submodules: [
      { label: "داواکاری", iconName: "purchase-order", targetView: "suppliers", targetSubtab: "orders" },
      { label: "دابینکەران", iconName: "supplier-building", targetView: "suppliers", targetSubtab: "list" },
      { label: "وەرگرتنی کاڵا", iconName: "receive-goods", targetView: "stock", targetSubtab: "receive" },
      { label: "حسابەکان", iconName: "supplier-accounts", targetView: "suppliers", targetSubtab: "accounts" }
    ]
  },
  {
    id: 5,
    title: "دارایی",
    color: "#bd7953",
    lightBg: "#fff1e7",
    iconName: "wallet",
    submodules: [
      { label: "سندووق", iconName: "cash-drawer", targetView: "shifts", targetSubtab: "drawer" },
      { label: "داهات", iconName: "income-rise", targetView: "reports", targetSubtab: "revenue" },
      { label: "خەرجی", iconName: "expense-fall", targetView: "shifts", targetSubtab: "expenses" },
      { label: "جووڵەی پارە", iconName: "cash-movements", targetView: "shifts", targetSubtab: "movements" }
    ]
  },
  {
    id: 6,
    title: "ڕاپۆرت و شیکاری",
    color: "#5577bc",
    lightBg: "#edf2fb",
    iconName: "chart-bars",
    submodules: [
      { label: "فرۆشتن", iconName: "sales-trend", targetView: "reports", targetSubtab: "sales" },
      { label: "قازانج", iconName: "profit-chart", targetView: "reports", targetSubtab: "profit" },
      { label: "ڕاپۆرتی کۆگا", iconName: "stock-chart", targetView: "reports", targetSubtab: "stock" },
      { label: "شیکاریی زیرەک", iconName: "ai-insights", targetView: "reports", targetSubtab: "insights" }
    ]
  },
  {
    id: 7,
    title: "ڕێکخستنەکان",
    color: "#74849a",
    lightBg: "#eff2f6",
    iconName: "settings-gear",
    submodules: [
      { label: "بەکارهێنەران", iconName: "manage-users", targetView: "settings", targetSubtab: "users" },
      { label: "دەسەڵاتەکان", iconName: "access-key", targetView: "settings", targetSubtab: "roles" },
      { label: "ئامێرەکان", iconName: "connected-devices", targetView: "qa", targetSubtab: "hardware" },
      { label: "سیستەم", iconName: "system-controls", targetView: "qa", targetSubtab: "system" }
    ]
  },
  {
    id: 8,
    title: "ئافەر و داشکاندن",
    color: "#cf6d96",
    lightBg: "#fcecf2",
    iconName: "offer-badge",
    submodules: [
      { label: "ئافەری نوێ", iconName: "new-offer", targetView: "offers", targetSubtab: "new" },
      { label: "داشکاندن", iconName: "discount-percent", targetView: "offers", targetSubtab: "discounts" },
      { label: "کوپۆن", iconName: "coupon-ticket", targetView: "offers", targetSubtab: "coupons" },
      { label: "کەمپەین", iconName: "promotion-speaker", targetView: "offers", targetSubtab: "campaigns" }
    ]
  },
  {
    id: 9,
    title: "لیبڵ و چاپکردن",
    color: "#0f9c9d",
    lightBg: "#e5f7f7",
    iconName: "printer",
    submodules: [
      { label: "لیبڵی نرخ", iconName: "price-label", targetView: "labels", targetSubtab: "shelf" },
      { label: "بارکۆد", iconName: "label-barcode", targetView: "labels", targetSubtab: "barcodes" },
      { label: "چاپی کۆمەڵەیی", iconName: "batch-print", targetView: "labels", targetSubtab: "batch" },
      { label: "قاڵبی چاپ", iconName: "print-template", targetView: "labels", targetSubtab: "templates" }
    ]
  },
  {
    id: 10,
    title: "شێفت و کارمەندان",
    color: "#a67d45",
    lightBg: "#fbf1e3",
    iconName: "shift-calendar",
    submodules: [
      { label: "شێفتەکان", iconName: "shift-clock", targetView: "shifts", targetSubtab: "shifts" },
      { label: "ئامادەبوون", iconName: "attendance", targetView: "shifts", targetSubtab: "attendance" },
      { label: "کاتی کار", iconName: "work-timer", targetView: "shifts", targetSubtab: "hours" },
      { label: "هەڵسەنگاندن", iconName: "staff-review", targetView: "shifts", targetSubtab: "performance" }
    ]
  },
  {
    id: 11,
    title: "چاودێری و مۆڵەتەکان",
    color: "#745dc5",
    lightBg: "#eeeafd",
    iconName: "security-shield",
    submodules: [
      { label: "ئاگادارییەکان", iconName: "alert-bell", targetView: "audit", targetSubtab: "alerts" },
      { label: "داوای مۆڵەت", iconName: "approval-file", targetView: "audit", targetSubtab: "overrides" },
      { label: "گۆڕانکارییەکان", iconName: "change-history", targetView: "audit", targetSubtab: "logs" },
      { label: "پشکنینی مامەڵە", iconName: "transaction-check", targetView: "qa", targetSubtab: "diagnostics" }
    ]
  }
];

interface CardIconProps {
  id: string;
  className?: string;
  size?: number;
}

export const CardIcon: React.FC<CardIconProps> = ({ id, className = "retail-pictogram", size = 24 }) => {
  const pathContent = CARD_ICON_PATHS[id];
  if (!pathContent) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
      >
        <circle cx="12" cy="12" r="10" />
      </svg>
    );
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle className="pictogram-halo" cx="19.4" cy="4.6" r="3.2" fill="currentColor" stroke="none" opacity=".13" />
      <g className="pictogram-lines" dangerouslySetInnerHTML={{ __html: pathContent }} />
      <path className="pictogram-glint" d="M3.4 5.4 5.4 3.4" stroke="currentColor" strokeWidth="1.3" opacity=".55" />
    </svg>
  );
};
