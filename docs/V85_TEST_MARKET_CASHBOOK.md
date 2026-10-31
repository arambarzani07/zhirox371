# ZHIROX V85 — isolated simulated test-market cashbook and shift journal

This version extends only the isolated **«مارکێتی تاقیکردنەوە»**
PostgreSQL 16 test project. **No real cash, refunds, payroll, payments, bank
transfer or store reconciliation happened.** Production, PC Relay, Supabase
and the real supermarket databases are untouched.

## Deliberate separation from existing checkout shift versions V37/V38

The older `cash_shifts_v37` and `cash_movements_v38` migrations
require V31 prepared checkout intents, V34 immutable receipts and V35
printing. The V80 test store uses the simpler V1 checkout and its two
historical sales are NOT attributed to these later shift tables.

Therefore V85 does **not** install the V37/V38 chain, backfill any historical
sale into a fake shift, or claim that its cash tally includes V80 sales.
It creates entirely separate, explicitly TEST-ONLY tables:
- `test_cash_shifts_v85`: actor, enrolled cashier, opening figure,
  immutable closed count and calculated variance.
- `test_cash_movements_v85`: append-only manually recorded **simulated**
  cash-in, cash-out and expense lines.

All writes use manager/owner-only SQL functions with store-level locking,
UUID retry protection, amount bounds, insufficient simulated cash rejection,
closed-shift write rejection, immutable ledger rows, and restricted grants.
They are only invoked from a test fixture, NOT from the browser or a public
write endpoint. The closed shift is immutable even to managers at this layer.

## Genuine SQL test fixture with synthetic money amounts

The disposable CI PostgreSQL store records:
- Opening amount: **50,000 IQD** (simulated manual initial tally)
- Test cash-in: **10,000 IQD**
- Test cash-out: **4,000 IQD**
- Test expense: **3,000 IQD**
- Expected: **53,000 IQD** (opening+in−out−expense)
- Counted: **52,500 IQD** (synthetic test figure)
- Variance: **−500 IQD**

Historical gross sales of **11,000 IQD** and V84 return face values of
**5,500 IQD** stay independent of this simulated shift. A cash balance
of 53,000 is NOT a physical drawer balance, not audited profit, and
not evidence of money received.

## Four newly connected read-only PC submodules

`دارایی → سندووق` (cash-drawer): opening, simulated movements,
expected figure, variance and explicit missing sale integration.

`دارایی → خەرجی` (expense-fall): simulated expense lines only.

`دارایی → جووڵەی پارە` (cash-movements): the append-only journal.

`شێفت و کارمەندان → شێفتەکان` (shift-clock): the test shift and
counted/expected/variance totals. All four screens require manager/owner;
cashiers receive an API 403, but keep the full 12×4 navigation.

Total: **31 actual PostgreSQL-backed read-only screens**, **17 planned
screens**. This is NOT 31 fully completed production operations.

## Acceptance and retention

Run `offline/migrations/031_test_cashbook_v85.sql` only in the dedicated
isolated test DB after V80 auth setup. CI applies V80–V85 migrations,
executes `041_v85_test_cashbook_fixture.sql` in a durable transaction,
then verifies role denial, immutable records, idempotency and zero overdraw
with rollback acceptance `042_v85_cashbook_acceptance.sql`.

Chromium opens all 48 PC pages and tests the four new real SQL screens,
records screenshots and verifies that a cashier cannot read cashbook data.
CI creates a `pg_dump -Fc` backup artifact retained by GitHub Actions
for 30 days. This is an archive, not a continuously running server.
No deletion is authorized or scheduled.

## Before any official production release

A qualified local cashier system must connect physical sale transactions,
test receipts, shifts, cash-in/out, returns, counted cash and trusted actors
in a unified audited local transaction design. Then it must pass physical
LAN, Windows PC, printer, power-loss and rollback acceptance. Until that
gate is met, all V85 cash data is isolated and read-only to the user interface.
