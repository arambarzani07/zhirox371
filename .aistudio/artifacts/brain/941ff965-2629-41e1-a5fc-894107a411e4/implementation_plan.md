# Enterprise POS Workflow Integration & 1-Click Thermal Printing

This plan establishes a seamless, commercial-grade supermarket cashier experience by unifying product catalog management inside the main operations console and enabling fast 1-click 80mm/58mm thermal printing upon sale completion, eliminating tab fragmentation and repetitive cashier friction.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following user preferences were confirmed during the interactive interview:
> - **Product Management**: Integrate catalog, barcode, and pricing management directly inside the operations console so users never have to leave `operations.html` to `workspace.html`.
> - **Receipt Printing**: Enable instant 1-click thermal printing automatically after checkout confirmation, reducing transaction turnover time to under 3 seconds.

- **Confirmed Decision 1**: Unify product creation, pricing, and barcode registration into an embedded, high-density modal and subtab within the `stock` workspace of `operations.html`.
- **Confirmed Decision 2**: Trigger an immediate, high-speed thermal receipt print dialog (80mm standard, switchable to 58mm) upon successful transactional checkout via `printLink` and browser print triggers.

---

## 1. Overview & Core Concept

- **What It Does**: Unifies the supermarket back-office and front-of-house operations under a single, cohesive, touch-first POS interface. Cashiers can scan, manage carts, park transactions, trigger instant thermal receipts, and authorized managers can register new products, update prices, and print shelf barcode labels directly without navigating away to external workspace pages.
- **Target Audience / Persona**: Supermarket cashiers working on high-volume touch-screen POS terminals and store supervisors managing inventory and price changes on the sales floor.
- **Key Value**: Eliminates screen switching and browser navigation delays, cuts cashier transaction turnaround time by over 50%, and ensures zero data loss during high-volume checkout rushes.

---

## 2. User Experience & Visual Design

### Key User Flows
1. **Rapid Cashier Sale Flow**:
   - Cashier scans or enters barcode (`F2` auto-focus). Items populate the structured, 6-column tabular basket.
   - Stepper buttons (`+` and `−`) at 38px $\times$ 40px and preset discount pills (5%, 10%, 15%) allow swift touch edits.
   - Cashier enters or selects cash tender (`Exact`, `5,000`, `10,000`, `25,000`, `50,000`) or presses `F8`.
   - On pressing `تەواوکردن`, the transaction commits via atomic Supabase RPC (`retail_post_sale_v18`).
   - Instantly, an automatic thermal print preview dialog renders with the exact receipt snapshot, and the register resets for the next customer in the queue.

2. **In-Console Catalog & Barcode Management Flow**:
   - From the `کۆگا` (Stock) tab, a top action button `+ کاڵای نوێ / دەستکاری` opens an in-console slide-over dialog.
   - Managers can edit name, SKU, unit type (unit vs kg), sell price, and register multi-pack cartons or scale barcodes.
   - Changes sync live with Supabase without leaving `operations.html` or reloading the POS session.

### Visual Identity & Theme
- **Theme Tokens**: High-contrast, clean retail palette (`#0f172a` slate-900 typography, `#15803d` vibrant green for payment actions, `#1e40af` deep cobalt for catalog links, `#f8fafc` crisp neutral surfaces).
- **Touch Ergonomics**: All interactive hit targets $\ge 44\text{px}$ in height, generous tap padding, and high-visibility keyboard shortcut pills (`[F2]`, `[F4]`, `[F8]`, `[F9]`, `[Esc]`).
- **Thermal Receipt Precision**: RTL layout for Kurdish Sorani typography, monospaced tabular numerals, clear item snapshot listings, store name header, and cashier shift receipt numbering.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Direct In-Console Catalog Modal vs. External `workspace.html` Redirect**
  - *Chosen Approach*: Embed product creation and barcode management as a dedicated subtab and drawer inside `operations.html` while preserving `workspace.html` backwards-compatibility links.
  - *Why*: Eliminates context loss, prevents cashiers from accidentally closing their active shift, and keeps the POS session alive in memory.
  - *Alternatives Considered*: Forcing full redirect to `workspace.html` caused navigation overhead and required re-authenticating shifts.

- **Decision 2: Automatic Thermal Print Trigger vs. Passive Link Rendering**
  - *Chosen Approach*: When `retail_post_sale_v18` resolves successfully, automatically trigger a non-blocking 80mm/58mm thermal print dispatch while updating `last-sale-bar`.
  - *Why*: In busy supermarkets, requiring cashiers to click two extra buttons to produce paper receipts causes long queues at the register.
  - *Alternatives Considered*: Silent raw ESC/POS printing (requires specialized hardware browser extensions not supported in standard browsers); browser print dialog provides universal hardware compatibility.

---

## 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Supermarket POS Terminal                        │
│                                                                        │
│   ┌────────────────────────┐           ┌───────────────────────────┐   │
│   │ Cashier View (#cash)   │           │ Catalog & Stock (#stock)  │   │
│   │ - Fast Barcode Scan    │           │ - Stock Balance Grid      │   │
│   │ - 6-Col Cash Basket    │           │ - In-Console Product Form │   │
│   │ - Quick Tender Keypad  │           │ - Barcode Registration   │   │
│   │ - Park/Hold Cart (F4)  │           │ - Expiry & Low Stock      │   │
│   └───────────┬────────────┘           └─────────────┬─────────────┘   │
│               │                                      │                 │
│               ▼                                      ▼                 │
│   ┌────────────────────────────────────────────────────────────┐       │
│   │               Shared Core (operations.js)                  │       │
│   │ - EAN-13 & Prefix-27 Scale Parser (cashier-v20-core.js)    │       │
│   │ - State: cart, balances, activeShift, pendingCheckout      │       │
│   │ - Event Handlers & Hotkeys Listener                        │       │
│   └───────────────────────────┬────────────────────────────────┘       │
│                               │                                        │
│               ┌───────────────┴───────────────┐                        │
│               ▼                               ▼                        │
│   ┌───────────────────────────┐   ┌────────────────────────────┐       │
│   │  Supabase RPCs (v18/v19)  │   │ 1-Click Thermal Print      │       │
│   │  - retail_post_sale_v18   │   │ - receipt-print.html       │       │
│   │  - retail_resolve_barcode │   │ - Auto-dispatched 80mm/58mm│       │
│   │  - retail_shift_close_v5  │   │ - Immutable snapshot       │       │
│   └───────────────────────────┘   └────────────────────────────┘       │
└────────────────────────────────────────────────────────────────────────┘
```

### Data Flow & Component Mapping
1. **Sales & Cart Engine**:
   - `cart` items match the 6-column table specification: item index, localized product name, unit badge (دانە, کارتۆن, کگم), unit price, touch quantity steppers, and line total.
   - Automatic calculation of subtotal, manual/preset discounts, tender received, and highlighted change due.
2. **Instant Thermal Print Integration**:
   - Post-sale hook in `operations.js`: Upon receipt of `res.data.sale_id`, triggers `window.open('./receipt-print.html?id=' + saleId + '&width=80&auto=1')` or opens an invisible iframe print target for seamless paper roll output.
3. **Preserved Regression Invariants**:
   - All 139 tests in `tests/*.test.mjs` remain permanently green.
   - All DOM IDs (`finish-sale`, `scan-form`, `checkout-form`, `shift-panel`, etc.) and CSS selectors (`.cash-basket-grid`) are strictly preserved.
