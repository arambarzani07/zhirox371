# V44 — Offline external-tender exception worklist and manager investigation log

**Status: isolated PostgreSQL/HTTPS LAN test only, NO-GO for official banking.** User/manager review notes are NOT payment verification, bank reversal, cash refund, nor consent to delete locked stock.

## Reconciliation without inventing bank funds

V44 reads the actual V31 durable checkout intent, the V41 external tender plan, the V43 held inventory, and any V42 **database evidence record**. It produces a derived store-scoped manager worklist for unresolved cases:

- `evidence_without_committed_sale`: V42 DB evidence exists, but sale remains prepared. **Highest priority.** Investigate provider settlement with authenticated merchant records before any manual recovery.
- `expired_unresolved_hold`: inventory reservation expired, checkout still prepared; do not silently release stock or assume bank funds never arrived.
- `active_unverified_hold`: reservation still held, provider has not supplied a recorded external proof.
- `external_quote_without_hold`: a mixed-tender quote exists without V43 stock reservation; bank charge must never start.
- `cancelled_with_external_evidence`: impossible under normal V42 guards, but surfaced as an exception if corrupted/legacy data is later discovered.
- Other unusual prepared/cancelled combinations are shown for investigation, not silently corrected.

The query is deterministic and capped at 100 cases, ordered with recorded evidence first. Every row has original request UUID, operator/cashier identity, exact IQD allocation, reservation state/expiry, age and review note count. It **never** declares the bank paid: a V42 database row is evidence awaiting source validation until a real bank adapter exists.

## Manager permissions and immutable notes

An independent enabled manager/owner session may read the worklist and append investigation notes with a category restricted to `investigating`, `contacted_provider`, `awaiting_bank_response`, `requires_supervisor_followup`, `hardware_network_check`. Both the HTTPS API and PostgreSQL guard require the manager role. Note UUID retries are idempotent, but changed payloads fail; no UPDATE/DELETE is allowed.

**There is deliberately no `paid`, `verified`, `settled`, `reversed`, `refund_completed`, `close_case`, `release_stock` or `cancel_payment` manager action.** A note cannot change tender, stock, sale, customer money, bank evidence or shift balances. The cashier has no access to the manager's bank-exception API.

## API (lab only)

- `GET /api/local/v44/bank-exceptions?limit=100`: manager-only, exact store from signed session.
- `GET /api/local/v44/review-notes?request_id=<UUID>`: manager-only, latest 100 immutable notes.
- `POST /api/local/v44/review-notes`: manager-only `{note_id,request_id,category,note}` (strict UUIDs, category and 10–500-character text).
- All bank settlement/reversal actions remain absent. No cashier-supplied merchant identifiers, amounts, store IDs or provider result flags accepted.

The Sorani V44 manager panel, behind a special staging-only flag, asks the manager to reauthenticate separately. Notes are stored server-side only. No passwords or manager access token are saved to local/session storage.

## Disposable CI / steps

Apply migrations through `offline/migrations/020_reservation_v43.sql`, then **only on a fresh test PostgreSQL** apply `offline/migrations/021_tender_reconciliation_v44.sql`. Run `offline/tests/021_tender_reconciliation_v44.sql` (transaction rolls back), Node API tests, and headless Chromium. The test sets up expired holds and a CI **synthetic** evidence-without-sale case: this is not a bank test transaction.

Special isolated frontend build:
```bash
VITE_V36_ISOLATED_LAN_PILOT=true VITE_V37_LOCAL_SHIFTS=true VITE_V38_CASH_LEDGER=true VITE_V39_REFUNDS=true VITE_V40_PARTIAL_REFUNDS=true VITE_V41_TENDER_PREFLIGHT=true VITE_V42_TENDER_REPORT=true VITE_V43_RESERVATIONS=true VITE_V44_RECONCILIATION_LAB=true npm run build
```

The V33 LAN gateway still requires all prior explicit private-TLS pilot flags plus `ZHIROX_V44_RECONCILIATION_LAB_ENABLED=true`. These flags must never be enabled on the actual supermarket's production database.

## Formal-payment blockers (unchanged)

A named bank/acquirer/FIB merchant account and its official documented signed API, independent payment-verification service, full payment reversal/refund, durable provider idempotency/replay protection, post-capture commit recovery, verified multi-PC stock/price reservation, protected local SQL roles, certified Windows thermal printer/installer, real LAN backup restore/UPS trial, merchant reconciliation and physical acceptance remain mandatory. A green CI is not formal approval.

**Production release status remains NO-GO.**
