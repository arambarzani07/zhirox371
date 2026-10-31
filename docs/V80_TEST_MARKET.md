# ZHIROX V80 — «مارکێتی تاقیکردنەوە» / Isolated Test Market

**Purpose:** A separate test-only store/account with real persisted PostgreSQL
SQL transactions, not mock data in React and not a live Kani Chnar store.

**Status:** Reproducible isolated PG16 fixture in CI, plus a restorable custom
format dump. It is **not** deployed at zhirox.com, it is not a continuously
running cloud account, and it is not reachable from the user's iPhone until
an explicitly approved local Windows/LAN test installation is connected.

## Test store identities

- Display name: **مارکێتی تاقیکردنەوە**
- Stable store UUID: `88000000-0000-4000-8000-000000000080`
- Local owner account: `test-market-owner`
- Local cashier account: `test-market-cashier`
- No hardcoded/reusable credentials. Passwords are individually scrypt-hashed
  from environment secrets and never printed, committed, or shared.
- One synthetic customer, two synthetic goods with TESTV80 barcodes.
- Actual PostgreSQL operations: two `checkout_cash_v1` sales for **8,000**
  and **3,000 IQD**, two numbered receipts, three stock journal entries,
  two outbox events, an opening accounting debt of **15,000 IQD** and a
  **5,000 IQD** *accounting-only* repayment (resulting balance **10,000 IQD**).
- The accounting-only repayment does NOT prove cash was collected or a bank
  transaction was settled. No bank API or production cash shift is used.

## Important persistence boundary

GitHub Actions runs a disposable PostgreSQL container. The test account is
**actually created and committed** in that container; a custom PostgreSQL
`pg_dump -Fc` archive is uploaded as an action artifact (30-day retention),
but the CI server itself does not stay running after the job.

To keep using the account in an installed system, restore that dump into a
**dedicated, empty, local** PostgreSQL 16 database named `zhirox_test_market`.
**Never** restore the dump to a production/live-market DB. After restore,
reset both test passwords with the guarded script below, because CI uses
ephemeral credentials. The app's external login/UI still needs a separately
approved LAN connector to this test database.

## Reproduce in a dedicated PostgreSQL instance

1. Create a brand-new **empty** database named `zhirox_test_market`
   on loopback only. Do not reuse an existing store's DB.
2. Apply migrations in this order before first provision:
   `001_core.sql`, `002_atomic_checkout.sql`, `003_local_users.sql`,
   `028_customer_debt_ledger_v79.sql`.
3. With Node's `pg` dependency installed, export:
   - `ZHIROX_LOCAL_DB_URL`: dedicated loopback PostgreSQL URL.
   - `ZHIROX_V80_CREATE_MARKET=YES_CREATE_TEST_MARKET`
   - `ZHIROX_TEST_OWNER_PASSWORD`: private unique password (12+ chars)
   - `ZHIROX_TEST_CASHIER_PASSWORD`: a separate private password (12+ chars)
4. Run `node offline/test-market-v80.mjs` once. The script refuses anything
   but one of two explicitly named isolated test databases on loopback, and
   refuses an existing store or unknown target. It commits data and never
   deletes data.

**Restoring the GitHub CI backup instead:** restore into an EMPTY
`zhirox_test_market` DB and do not run the provisioner again; then run
`node offline/test-market-reset-passwords-v80.mjs` using the same DB URL,
two newly selected private passwords, and
`ZHIROX_V80_RESET_TEST_PASSWORDS=YES_RESET_TEST_PASSWORDS`.
The reset tool rejects any DB with an unknown store or more than one store.
It changes only password hashes and revokes prior sessions.

## Deletion later — NOT authorized today

No deletion routine is executed, scheduled, or wired to the system.
At a later **separate explicit request**, first back up and confirm the
specific isolated test database and store UUID, then use the normal PostgreSQL
operator workflow to delete that **dedicated test database only**.
Never issue `DROP DATABASE` against a shared installation or against
Kani Chnar/production; never cascade-delete by name in a shared DB.
This guarantees that no live-market goods, customers, debts or receipts
are deleted when the user retires the sample market.

## Verification

- `node --test offline/tests/test-market-v80.test.mjs`
- GitHub workflow: `V80 isolated test market persisted account and real SQL actions`
- `offline/tests/036_v80_test_market_persisted.sql`
- `offline/tests/verify-test-market-login-v80.mjs`

All data and actions in this store are **authentic PostgreSQL records but
synthetic business fixtures**; they are not real-world transactions.
