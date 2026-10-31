# ZHIROX V91 — Real PostgreSQL concurrent unified LOT checkout acceptance

## Safety boundary

**Status: isolated CI trial, not permission for official cashier deployment.**
All financial amounts and LOT quantities are synthetic, but the operations execute as
real committed PostgreSQL transactions on the one-store disposable
`zhirox_v80_disposable` test database with the explicit name
«مارکێتی تاقیکردنەوە».

V91 does **not** change the original locked 12×4 PC Home, scanner, customer
production records, actual store stock, Supabase, Vercel, Windows, or PC Relay.
It does not expose a financial write route through the browser.
No user-requested test store/data, backup or GitHub branch is deleted.
The CI database is ephemeral; the successful PostgreSQL `pg_dump -Fc` archive
is retained by GitHub Actions for 30 days and is **not** a permanent server.

## V91 concrete risk reduced

V90's sequential SQL fixture proved unified opening/supplier LOT attribution,
but not collisions between separate cashier connections or near-simultaneous
responses lost during a checkout/refund retry.

`offline/tests/v91_unified_lot_concurrency_real_pg.mjs` opens a PostgreSQL
pool with multiple independently connected sessions, and fails closed unless
the CI is on loopback, using database `zhirox_v80_disposable`, role `v80test`
and the explicit isolated test-market environment flag. It verifies the exact
V90 initial stock, receipts and sale totals before writing.

Four real concurrency cases:
1. **Same cashier, same request UUID, same sugar item:** two calls execute
   concurrently. Exactly one new sale and one replay are accepted. A single
   receipt, stock decrement, outbox event and LOT allocation are recorded.
2. **Two different authorized actors, different request UUIDs, last two
   units of sugar:** both try to sell two. Exactly one commits and the other
   is refused with PostgreSQL `23514`; there is no ghost receipt/event, and
   the received supplier LOT balance cannot become negative.
3. **Conflicting replay and retry after no stock:** a changed payload cannot
   reuse the prior successful UUID (V90 `P9003`), and retrying the loser
   cannot create a sale after stock has been exhausted.
4. **Same manager, same LOT return request UUID:** two concurrent returns
   from the exact winning sale/LOT create one immutable accounting-only return,
   one stock restock, no duplicated return value and **no physical cash payout**.

Expected final **committed synthetic** CI state:

| Invariant | After V90 | After V91 |
| --- | ---: | ---: |
| Sale receipts | 5 | 7 |
| Gross trial sales (IQD) | 89,000 | 98,000 |
| Outbox sale events | 5 | 7 |
| Sugar global stock (base units) | 3 | 1 |
| Sugar tracked unified LOT balance | 3 | 1 |
| V90 unified sale references | 1 | 3 |
| V90 lot-linked return records | 1 | 2 |
| Accounting-only return *face values* (IQD) | 11,000 | 14,000 |

## Acceptance and isolation

The CI executes legacy migrations and V80–V90 fixtures first, checks the
48 Sorani desktop pages via Chromium without UI changes, refuses the official
release build, then runs the V91 concurrent database transactions and snapshots
their committed state. It fails if a duplicate, oversell, ghost event, changed
replay or double return is observed.

**Remaining NO-GO:** This does **not** prove the security of the test GUC
route (privileged SQL connections can spoof it), real physical stock count,
a production least-privilege cashier gateway, a physical printer/Windows
installer, multi-PC LAN outage/recovery, payment settlement or an approved
operator witness. These require a separate real-world gate before live sales.
