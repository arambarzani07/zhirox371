# V59 / Step 2 — Two genuine local cashiers, HTTPS, PostgreSQL, WAN-independent CI (NO-GO)

## What this acceptance test really executes
- Starts a real **PostgreSQL 16 disposable** database in GitHub Actions, migrates current SQL-only local schema, and creates two synthetic cashiers with hashed local credentials and separate shifts.
- Runs the **actual** existing V33 HTTPS peer/origin security layer and V37/V35/V34/V32/V31/V26/V3 API chain over loopback with a short-lived certificate validated by the client (not plaintext HTTP).
- Uses authenticated requests (not mocked routes) to scan barcode, reject forged client store ID, reject stale 399 vs 400 IQD server price, prepare two competing last-item requests, commit concurrently and guarantee exactly one succeeds.
- Verifies one stock deduction, a single sale/receipt, idempotent replay, cashier isolation on immutable receipts, unique queued (NOT physically printed) thermal ticket, 1 pending outbox event while there is no cloud endpoint, and cash shift reconciliation.
- The integration test cannot run against a real store; it requires explicit CI-only flag, loopback, exact disposable database name, exact synthetic store and a fresh/empty schema. All test credentials are fake and only valid for the CI container.
- Real Cloud, Vercel, production Supabase, PC Relay and original locked Home are unchanged.

## Important limitations
The GitHub Actions PostgreSQL container currently uses a disposable owner account for test setup AND API execution. A **least-privilege, separately provisioned production service DB role** is not certified yet; this must be addressed before a commercial release. The test TLS certificate is short-lived and self-issued, not a production LAN PKI. The test does not connect to a real thermal printer, UPS, Windows service, or customer network.

## GO/NO-GO
This is a substantive software acceptance milestone for step 2, **not completion of step 2**. Physical local server installation, authentic LAN TLS, scoped production role, backup/restore, two real cashier devices, correct thermal print and power-loss test must pass. Steps 3–7 must not be marked accepted until their own gates are satisfied. NO_GO.
