# V8 — Isolated PostgreSQL Concurrency Verification

Project: Zhirox-New-Project / qcfmlyyzfykzszvtllrw
Repository: arambarzani07/zhirox371
Branch: feature/retail-os-pc-foundation
Approved Home reference: design-lock/pc-home-v1

## Actual parallel PostgreSQL SQL execution
GitHub Actions starts disposable PostgreSQL 16 and runs real SQL transactions in distinct psql processes.
The fixture copies the VERIFIED PL/pgSQL function definitions from Supabase as of 2026-10-25.
No production Supabase API keys, Auth users, products, sales or store data are used or created.

## Executed concurrency checks
1. Two cashiers race to sell the final unit: exactly one sale and no negative stock.
2. Identical UUID retried simultaneously: one persisted sale and one stock decrement.
3. Reused request UUID with changed tender amount is rejected.
4. Second cashier reusing the first cashier's request ID is rejected.
5. Shift close racing checkout: closing ledger remains consistent.
6. Same cash-in request concurrently retried: one movement.
7. No open shift: transaction is rejected and fully rolled back.
8. Non-member user: checkout denied.
9. Previous posted checkout replayed after shift closure: same sale returned.
10. Twelve concurrent checkout attempts against three units: exactly three sales and receipt sequence 1,2,3.

Files: tests/integration/fixture.sql, tests/integration/concurrency.test.mjs.
CI: .github/workflows/pc-foundation.yml; jobs static-tests and postgres-concurrency.
PC QA center: qa.html, linked from Audit/Permissions > Transaction Checks via navigation-only Home edit.

## Scope limitation
The fixture reproduces the relevant tables, constraints and deployed function bodies, NOT the complete Supabase schema.
Authentication is emulated with a test-only auth.uid() session claim and explicit authenticated role.
Real Supabase Auth/session validation, cross-tenant RLS and actual user roles in the hosted service have NOT been end-to-end tested.
No Windows printer, scanner, cashier PC, physical cash or cash drawer was used.
Tests run once per push; high-volume sustained stress, deadlock detection and realistic failure injection remain.
After any live database function migration, refresh the fixture from verified function definitions to avoid testing stale code.

## Production gate
Still NOT READY for real supermarket use until isolated end-to-end live Auth/RLS and Windows device QA passes.
Never seed the actual project with sample sales or accounts for this suite.
Never alter the locked Home design without an explicit unlock. Preserve DESIGN_LOCK.md and PREVIEW_POLICY.md.
