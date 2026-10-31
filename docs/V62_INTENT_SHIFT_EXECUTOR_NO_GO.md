# V62 — Step 2: cashier intent + shift SQL isolation (CI only / NO-GO)

**Objective.** Prevent network-facing cashier API DB login from directly creating, cancelling, or rewriting checkout intents and cash shifts; continue legitimate authenticated HTTPS checkout using existing V31/V37 routines.

## Implemented
- Two dedicated **NOLOGIN** PostgreSQL roles: V62 intent executor (limited intent writes + calls into V61 checkout and V60 reservation functions) and V62 shift executor (cash shift open/close + V42 financial summary).
- Existing static-SQL V31 prepare/commit/cancel, and V37 open/close shifts, change to SECURITY DEFINER with fixed search paths and separately owned by NOLOGIN roles.
- REVOKE direct INSERT/UPDATE on checkout_intents_v31 and cash_shifts_v37 from zhirox_v60_api_ci; REVOKE direct EXECUTE of V26 checkout and V43 reservation consume to prevent bypass of durable checkout intents.
- Runtime SQL role security regression asserts its privileges cannot directly mutate these tables or invoke the V26 checkout. A real PostgreSQL 16 CI database hosts the actual V33 HTTPS gateway and two distinct authenticated cashiers: price change rollback, concurrent last-item sale, receipt idempotency, offline outbox, print-queue idempotency and reconciled shifts.
- Strict test-only database zhirox_v59_ci_test, synthetic cashier/store identifiers, no production access or real data edits.

## Remaining NO-GO concerns
SECURITY DEFINER and role isolation do not independently prove identity binding against a fully compromised API process that can pass arbitrary store/cashier UUIDs. Tenant-scoped authentication, audited SQL wrapper design, credential protection, physical Windows LAN TLS, printer/scanner, UPS and independent backup/restore are all mandatory before production. The runtime login still has narrowly scoped stores/local_users writes needed for old row locks and auth counters.

**Release decision:** STEP 2 IN PROGRESS; GO-LIVE NO-GO. Steps 3-7 must not be marked completed or production-ready.
