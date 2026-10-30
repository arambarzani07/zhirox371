# V39 — two-person manager-approved FULL-LINE CASH refunds (offline lab)

**Status:** isolated code/test only; NOT FOR LIVE MARKET SALES, no production SQL changes, no physical printer. The V36 Home design remains locked.

## Purpose and exact limits
One **entire original sale line** may be refunded once, for the exact amount and base-unit stock on its immutable committed V34 receipt. This includes a carton or weighed-label original line (as a whole), but **not partial-line returns**, partial weight/quantity, mixed payment, debt, voucher or bank/card reversals. If the amount is zero or the receipt was not captured in V34, refuse automatically.

- Two **different enabled signed local principals** are mandatory: cashier bearer token and `x-zhirox-manager-token` for a local manager or owner; both must be from the same store. The manager role is validated against live local users during the request and inside PostgreSQL. The cashier's active shift is validated in PostgreSQL. Managers must reauthenticate on each approval in the isolated browser.
- The cashier supplies `refund_id` (retry-stable UUID), `sale_id`, `shift_id`, `line_no`, `restock`, and `reason`. They **cannot** set price, refund total, item/product, stock amount, manager ID or cashier ID. Verified original sales and lines are loaded from the local database, with one refund per sale line.
- PostgreSQL cash refund journal is append-only. Replays with the same UUID and unchanged payload return the original result without duplicating refund, restock, event or cashier ledger entry. Changed payload or second UUID for same line fail. The optional physical restock happens transactionally with a positive stock ledger entry, only if the returned item was actually inspected and judged sellable. No restock is the conservative default.
- The cash journal and shift closure now subtract refunds: **expected cash = opening + gross cash sales + cash-in − cash-out − expense − cash refunds**. The V38 cash-out guard was upgraded to check remaining cash after refunds. Refunds are rejected if the active cashier shift cannot fund them. This design does not move cash between cashiers automatically.
- Local event outbox appends `sale.line_refunded` with refund and manager IDs; no cloud acknowledgement is required for an offline register to continue. Manager refund documents and a new receipt print template are **not** included in V39.

## Test-only endpoints
With V33 private TLS allowlist and `ZHIROX_V34_RECEIPT_PREVIEW_ENABLED=true`, `ZHIROX_V35_PRINT_QUEUE_ENABLED=true`, `ZHIROX_V36_LAN_PILOT_ENABLED=true`, `ZHIROX_V37_LOCAL_SHIFTS_ENABLED=true`, `ZHIROX_V38_CASH_LEDGER_ENABLED=true`, enable **`ZHIROX_V39_DUAL_APPROVAL_REFUNDS_ENABLED=true`** in a disposable LAN lab only.

- `GET /api/local/v39/refundable-lines?sale_id=<uuid>` — signed cashier-only, server-derived sale lines and already-refunded flags.
- `POST /api/local/v39/refund` — signed cashier bearer + independent manager token, strict JSON and server-derived refund amount. Never log or persist approver secrets.

Compile the *separate* non-production staging frontend only:
```bash
VITE_V36_ISOLATED_LAN_PILOT=true VITE_V37_LOCAL_SHIFTS=true VITE_V38_CASH_LEDGER=true VITE_V39_REFUNDS=true npm run build
node scripts/package-lan-pilot-v36.mjs dist
```

Apply migrations 001–007, 009, 011–015 **only to a new, throwaway PostgreSQL 16 database** in order. `offline-foundation.yml` runs older V33–V38 tests first, then V39 migration and SQL tests. The V39 API and headless Chromium tests verify separately logged-in cashier/manager, original-line derivation and cash reconciliation. No live DB/PC Relay/legacy market data is touched.

## Mandatory NO-GO work still outstanding
Partial-line quantity and weight refunds with deterministic rounding; explicit manager approval workflow audit and independent manager station; printable refund vouchers; correct ledger and fiscal treatment for mixed tender, credit, split payments, taxes or discounts; final least-privilege SQL role and protected operator terminals; device TLS enrollments and key lifecycle; actual Windows 58/80 mm thermal printing and script rasterization; encrypted independent backup and measured restoration; real LAN/UPS/power failover; release-signed installer; approved physical acceptance and supervised real-cash test.

No formal Windows install, physical printer trial, Supabase write, market-data migration, or production approval has taken place.
