# V71 — non-graceful PostgreSQL crash recovery and ambiguous print fence

This GitHub Actions test continues the **same V65–V70 Digital Twin of سوپەرمارکێتی کانی چنار**. All transactions, credentials and stock are synthetic; no on-prem machine, production DB or printer is touched.

## Live scenario
1. Successfully complete the cumulative V65–V70 integration: 111 real PostgreSQL financial commits and receipts, 5 separate Linux Docker cashier network namespaces, an internal-only LAN and TLS gateway, sustained 100-sale bounded test, and earlier V66 graceful DB restart/backup verification.
2. Start a separate **still-running HTTPS cashier gateway**, issue a DB-backed cashier session, open a real shift, and prepare an unpaid synthetic order of **750 IQD** in durable PostgreSQL checkout intents. Confirm that NO additional sale exists yet.
3. Simulate **an ambiguous Windows spooler scenario** using real V54 SQL: transactionally claim one genuine queued 58/80mm immutable receipt, then deliberately leave the attempt state as `claimed`. No actual printer submission occurs.
4. Snapshot actual PostgreSQL rows across sales, receipts, inventory, stock ledger, durable checkout intents, outbox, shifts, print queue and print dispatch attempts; record a SHA-256 digest.
5. Use **`docker kill --signal=KILL`** on the exact GitHub Actions disposable PostgreSQL 16 service container, while HTTPS stays alive. Verify financial API denies checkout/recover during database unavailability even though the HTTPS liveness endpoint itself responds. This is a genuine abrupt database-process termination, not physical UPS/mains power interruption.
6. Restart **the exact same container and data directory** via `docker start`. Verify real PostgreSQL 16 crash/WAL recovery, then compare every previously captured data row and SHA-256 unchanged. The prepared checkout and ambiguous print attempt must remain durable.
7. Recover the pending cashier intent under the same signed session, commit precisely once, assert an idempotent replay, immutable new receipt and a new queued 80mm print intent. Close shift with zero cash variance.
8. The already-claimed print attempt MUST refuse a second claim (`P5401`) and be moved to `manual_review`, not automatically marked printed or submitted. Repeated finalization must fail. This is a **fence**, not a physical printer recovery test.
9. Expected final counters: **112 sales, 112 receipts, 112 print intents, 112,230 IQD**, **109 queued offline events**, 0 open cashier shifts, one print job in claimed/manual-review state and **49 units** remaining on the V70 fixture.

## What this cannot certify
- Real store PostgreSQL server and real disk corruption, fsync reliability on actual hardware, power cuts and UPS.
- The actual Windows Print Spooler process, USB thermal printer, paper feed, driver acknowledgement or loss-of-power printer recovery. `hardware_printed` remains false.
- Any Windows PC EXE, real physical switch, real barcode scanner or real Supabase. Those require authorized on-prem acceptance tests.
- 24-hour soak and field network latency. V70 is only 20 test rounds per 5 Linux virtual clients.

**Commercial GO-LIVE: NO-GO.** Real physical acceptance step 2 remains outstanding. No changes to `main`, actual SQL Server, Supabase or PC Relay.