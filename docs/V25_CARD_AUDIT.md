# V25 — review of every Home card and child route

Reviewed all 12 groups / 48 destinations against the actual HTML and controllers in an isolated offline browser fixture. This verifies navigation and visible states; it does not certify a hosted database, live balances, production permissions, or hardware printing.

| Group | Four child destinations | Result |
|---|---|---|
| Sales | New sale, receipts, payments, returns | Opened; existing protected transaction paths preserved |
| Products | New product, list, prices, barcodes | Opened; header-aware import preflight retained |
| Stock | Status, low stock, expiry, movements | Opened |
| Customers | Customers, debts, purchase history, payments | Opened |
| Purchasing | Orders, suppliers, receiving, accounts | Opened |
| Finance | Treasury, revenue, expenses, cashflow | Opened; atomic finance write and complete server balance added |
| Reports | Sales, profit, stock, analysis | Opened; existing paged server report retained |
| Settings | Users, roles, devices, system | Opened |
| Promotions | Offers, rules, coupons, campaigns | Opened; confirmed writes, no automatic example data |
| Labels | Prices, barcodes, bulk print, template | First two and template open; bulk print explicitly unfinished |
| Shifts / staff | Shifts, attendance, worktime, review | Shifts open; three staff modules explicitly unfinished |
| Audit | Alerts, approvals, log, QA | Log and QA open; alerts and approvals explicitly unfinished |

## Corrected findings

- The shared navigation now displays all 12 main groups in two rows of six, without hiding the final cards behind horizontal scrolling. The offline badge tooltip and coupon placeholders no longer advertise unavailable sync or an example coupon.

- Browser startup used to manufacture sample offers, campaigns, coupons and discount rules when remote lists were empty. Removed every production auto-seed and local fallback: an empty server remains empty. Read errors are visible.
- The four promotion editors and their toggle/delete actions previously ignored returned Supabase errors and changed local state before acknowledgment. They now require a returned row ID before showing success or changing a list. Cashiers can read promotional records; only active owner/manager roles may manage them, enforced through RLS in the new migration.
- Usage counters were non-atomic client overwrites and could lose concurrent uses. Removed those writes and fictional local increments. Limited-use coupon redemption now fails closed with an explanation until a transaction-bound server redemption protocol exists. Unrestricted promotions still calculate receipt discounts; their displayed historical usage counters are not certified redemption counts.
- Treasury transfers, drawer revenue and drawer expenses used separate cash and finance calls. The new `retail_record_finance_v25` performs both in one database transaction, journals retries by actor/payload/request ID, locks the store before the current drawer, validates integer money and available funds, and rejects direct finance writes. A rejected finance insert rolls back its drawer movement and request journal.
- Treasury balances previously depended on truncated browser histories. `retail_finance_state_v25` aggregates all server records and validates JavaScript integer safety. Unknown/error balances display a dash instead of fabricated zero or NaN. Visible history scope is explicit: latest 500 finance records; promotional lists latest 300. Derived detail lists are still bounded histories, not full accounting statements.
- Print-template navigation now preserves the Labels group context instead of displaying Settings as its parent.

## Remaining functional boundaries

Six destinations do not yet have implemented business workflows: bulk label printing, attendance, worktime, staff review, audit alerts and approval requests. Their status and links to related working screens remain explicit. Opening a placeholder is not reported as completing that feature.

Customer/supplier ledger tables retain legacy external-safe transactions. The new finance summary includes these historical amounts; V25 does not implement a full reconciled general ledger, concurrent coupon redemption, or paginated exports for every historical list. Existing source limitations must not be presented as audited financial statements.

## Validation

- `npm test`: 177 tests passed.
- `npm run test:database`: 38 PGlite SQL tests passed, including installation twice, atomic transfer/retry after shift close, overdraft and fractional-money rejection, rollback after a forced insert failure, totals beyond 500 rows, role downgrade replay, and promotion access policies.
- `npm run build`: syntax and local asset references passed.
- Browser CI extends the 48-route suite with empty promotions, rejected promotion saves and Labels print-template context. UI fixtures are isolated from SQL tests.

New database source: `supabase/migrations/20261028162200_finance_promotions_integrity.sql`, also embedded by `scripts/sync-upgrade.mjs` in the standalone upgrade. No hosted migration has been applied. The frontend requires this migration before the new finance endpoints are available; missing endpoints show errors rather than simulated success.

## Integration with the concurrent main update

Main commit `6d59ba3` added an offline engine, customer display, browser-local staff/audit modules and a local snapshot server. During integration, the engine was found to replace the authenticated SDK by default and to report a read-only ping as successful synchronization. Production now retains the real SDK. The disposable engine requires the explicit `window.RETAIL_DEMO_MODE === true` flag, and its sync action reports that transaction replay/backup synchronization is unimplemented without sending or clearing the queue. Production quick identity switching is disabled. The static server retains its existing source-path protections and does not expose the unauthenticated snapshot/restore API.

The new staff/audit forms store browser-local records; production entry points route to the explicit unfinished status rather than presenting these as central attendance, approvals or staff records. The customer-display addition is retained. This integration does not certify every new offline-engine RPC or hardware protocol. A new regression proves production configuration does not replace the real SDK, create a local owner, or provision local storage.

The concurrent main merge also reintroduced duplicate Payments and Returns sections with repeated IDs. Removed the duplicate sections and retained the protected existing controllers. A regression checks unique IDs across every root HTML page.
