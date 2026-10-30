# ZHIROX371 V46 — Cash-only offline rehearsal and physical GO-LIVE gate

**Date: 2026-10-30. Status: NO-GO for the actual supermarket.** This is a disposable PostgreSQL CI rehearsal, not approval for taking customer money. The legacy SQL Server, Supabase production, PC Relay, real scanner, physical printer and owner-locked Home **are not changed**.

## Why V46 exists

The public Vercel URL is a useful, stable way to inspect the original PC website; it does **not** host the real local LAN PostgreSQL cashier and does **not** prove offline transactions. Earlier V31–V45 tests cover individual financial modules, yet a shop needs a single joined acceptance: scan, shift, checkout idempotency, cartons, stock, receipt, print queue, close, and recover from a locally restored backup.

## New tests

- `offline/tests/023_v46_airgap_cash_only_acceptance.sql` executes a **single end-to-end CASH-only** rehearsal across **two separately authenticated local cashiers**. Cashier A sells two units and one carton; B sells shared stock from a second shift. Tests strict IQD totals, unit/carton base stock, receipt sequence, append-only V34 snapshot, unique V31 UUID replay after hypothetical lost reply, one completed outbox event per sale (cloud optional), 80/58-mm **queued, never falsely printed** receipts, cash-in/out/expenses, pending-checkout protection and accurate independent shift closures. This SQL never contacts the cloud.
- `offline/tests/024_v46_disposable_restore_seed.sql` persists one fake local sale in GitHub Actions **disposable** PostgreSQL. Workflow exports the complete *current* `zhirox_local` schema **after all V45 migrations**, restoring it to a **different disposable database**, not the market. `offline/tests/025_v46_disposable_restore_verify.sql` checks sale/receipt/stock/print/job/shift/outbox and confirms replay cannot double-charge or double-decrement. Backups use owner-only permissions in the CI sandbox and are deleted at the end.
- `scripts/release-readiness-v46.mjs --json` issues a machine-readable **NO_GO** report, separating laboratory evidence from physical acceptance. A green test or environment flag can never turn NO_GO into GO. V46 tests run as part of `.github/workflows/offline-foundation.yml` and the V35 formal release workflow.

## Real market GO-LIVE acceptance checklist (not yet executed)

| Required owner-witnessed result | Acceptance evidence |
| --- | --- |
| Installed signed Windows build on the actual checkout PC | Version/hash, working launch, safe rollback proof |
| Two cashier PCs on private store LAN with internet DISCONNECTED | One sale each; exactly-once IDs; stock never negative; offline inventory and shifts |
| Real scanner and **prefix-27 weighted labels**, unit and carton | Original scanned barcode, quantities, IQD stock and receipt totals |
| 58/80-mm real receipt printer | Correct Sorani print, no unexpected duplicate after retry/power cut |
| UPS and power failure/restore | Cash/stock/receipt integrity after restart, no lost committed sale |
| Encrypted backup and separate PC restore | File/hash, restore time, RPO/RTO, tested full close/reopen |
| Local roles, firewall and database least privilege | Device approvals, secrets protected, security review signed |
| Zero unexpected tender/refund anomalies and reconciliation | Owner-reviewed V45 audit with zero unresolved critical/urgent findings |
| Account recovery and correct public Auth redirect | Owner login verified after an actual email/password recovery |
| Electronic mixed tenders | **Remain disabled** until licensed merchant provider verification, reversals and settlement reconciliation are physically accepted |

Record evidence privately in a secured operator acceptance log—never upload passwords, real customer records or database backups to public GitHub.

## Demo vs operational layers

- **Public HTTPS Vercel page:** stable original HTML/PC layout and login. It can show Supabase-backed web views subject to RLS, but **not certified offline POS**.
- **Local PostgreSQL LAN cashier:** checkout/shifts/receipts work without internet **by design**. A disposable CI pass does not verify the actual PC hardware or power supply.
- **Bank/FIB:** separate authorization/settlement rail. Do not accept user-entered confirmation codes as settlement. Full offline cash mode is independent of online card approval.
- **Printed receipt:** V35 is a durable print **queue**, not a verified print service. Do not say a job is printed without a successful physical worker.

## Lab-only commands

```bash
node --test scripts/release-readiness-v46.test.mjs
node scripts/release-readiness-v46.mjs --json
# SQL tests run against a disposable PostgreSQL 16 CI service via
# .github/workflows/offline-foundation.yml; do not run on production!
```

**Owner approval cannot be inferred from source code, a URL, or a passing GitHub Action. NO-GO remains until every required physical acceptance item is documented.**
