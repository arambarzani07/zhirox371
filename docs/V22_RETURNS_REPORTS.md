# V22 linked receipt returns and complete server reports

Review candidate on the existing repair branch/PR. No hosted schema, financial data, POS relay or locked Home files are changed by preparing this code.

## Returns

- Partial returns reference one immutable sold line, not a current product/barcode price. Quantity is bounded by the cumulative unreturned quantity. Unit/carton quantities are whole original selling packages; kilogram quantities allow thousandths. Loose units from a carton sale require a separate agreed policy and are not silently treated as whole cartons.
- Receipt-level discounts are allocated by cumulative gross value in stable line-ID order. Repeated partial refunds use cumulative rounding, so partial + remaining/full refunds equal the receipt's original net amount exactly.
- One transaction covers stock restoration, cash payout, debt reduction, return lines, customer history and audit. The same actor/request/payload replays the completed result, including after shift closure; changed payloads and unrelated movement UUIDs are rejected.
- Credit returns reduce only the outstanding debt attributable to that receipt. Customer payments are allocated FIFO across positive ledger entries in recorded `(created_at,id)` order. Untracked positive opening balances are treated as an older debt bucket. Inconsistent/duplicate receipt debt is rejected for reconciliation. Previously paid amounts are refunded in cash; another receipt's unpaid debt is not erased.
- All flows lock shift -> customer (when present) -> sale -> stock in product-ID order. Manager/owner is required for credit returns. Owner cashier-return settings are checked on the server. Existing legacy full-return retries remain confirmable.
- The UI fetches authoritative sold-line state, shows a readonly calculated refund, and sends only line/quantity/session/reason. Receipt lookup covers all stored receipt numbers/IDs; ambiguous barcode matches require a receipt number.

## Reports

- Sales, profit, inventory and ABC views use `retail_report_v22`. Store/period totals are computed on the server over all records; only detail rows are paged (50, capped at 100).
- Sales and return events use their respective event dates. Time boundaries and day/hour grouping use Asia/Baghdad. Partial and later full returns are counted once through the return ledger, not also as a legacy full return.
- New sale lines capture the then-recorded base-unit cost. This is the current recorded cost model, not a promise of inventory lot FIFO/weighted-average accounting. Historical unknown costs are never backfilled using today's prices or guessed percentages: affected profit totals remain unknown.
- Inactive products with physical stock remain in inventory valuation. Current valuation uses recorded current costs; unknown cost prevents a falsely complete valuation. Recorded expiry flags are not a certified batch-allocation system.
- Legacy returns without a verified date make period figures incomplete. Export/print is blocked for an affected period/day/hour report until dates are reconciled. All-time totals remain usable when quantities and amounts are known.
- Export/print explicitly covers the displayed server page. No CSV is labeled as a complete 50,000-row export when it contains only one page. Unsupported numbers beyond exact browser integer range fail rather than silently lose monetary precision.

## Install and verify

Apply migrations in filename order after the existing V8+ foundation, or use the standalone `db/v19_complete_production_upgrade.sql`, which embeds all reviewed migrations in its single transaction. `node scripts/sync-upgrade.mjs` must be rerun after changing either migration. No hosted deployment is authorized by this document; backup/restore and actual hosted schema/ACL checks remain required.

`npm test`, `npm run test:database`, `npm run build`.
CI also runs four real PostgreSQL concurrent-return/payment races, real local Supabase Auth/PostgREST return/report smoke checks, and a dedicated Chromium linked-return/server-report UI test. Browser mocks demonstrate UI behavior only; SQL arithmetic is tested separately against the actual migration.

Remaining release work: tested full database backup/recovery, hosted maintenance/preflight, physical hardware/load checks, full supplier-return financial workflow, batch-level expiry reconciliation, and remaining prototype/local caches outside these report/return paths.
