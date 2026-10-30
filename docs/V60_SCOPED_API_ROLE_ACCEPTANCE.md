# V60 — Step 2 remains in progress: non-owner PostgreSQL API cash-only regression

## Implemented
- A new isolated CI-only PostgreSQL API login zhirox_v60_api_ci. This login is not a superuser, cannot create roles or databases, cannot bypass RLS and is not schema owner.
- An explicit allowlist of SELECT/INSERT/UPDATE table permissions and narrowly selected SQL routines for the existing V59 checkout, shift and printing workflow. The role deliberately has no DELETE, TRUNCATE, CREATE, ALTER or DROP privileges.
- The reservation consumption/cancellation functions and thermal print queue function are individually moved to small **NOLOGIN** execution identities with audited SECURITY DEFINER SQL and fixed search paths. The API cannot directly delete reservation items or update thermal job states. The executor roles also have no permanent CREATE on the schema.
- The V59 *real PostgreSQL / TLS* two-cashier acceptance test now supports a separate DB login for the HTTPS gateway, unlike the previous test that used the database migration owner for both test fixture setup and runtime.
- Its new restricted-role mode must reject direct DDL, TRUNCATE, DELETE and immutable receipt changes, and still prove real cash login, scan, two shifts, price-lock rollback, concurrent last-stock contention, exactly one durable sale, idempotent replay, receipt and print-queue idempotency, and pending outbox while the Internet is not used.
- All credentials and database names are synthetic; hardcoded **CI-only** values must never be installed on a store PC or reused. SQL explicitly refuses any populated database or any database name other than zhirox_v59_ci_test.
- Both Home sources remain byte-locked; this changes no UI.

## Security caution
This is NOT yet a fully least-privilege commercial role: legacy SECURITY INVOKER routines require direct UPDATE and INSERT permissions on some financial tables, and a compromised backend login can perform additional DML if allowed by those grants. A later hardening gate must eliminate direct financial table writes by the API login using safely owned, carefully audited SECURITY DEFINER functions, restrictive schema ownership, database policy, store isolation and audit logs. The current role is a demonstrably *less privileged* transitional CI account, not a complete hardened production role.

## Official release conditions
- Independent production service DB role with no direct financial DML, per-store least privilege, audited functions and isolated protected secrets.
- Actual on-premises Windows PostgreSQL service, LAN certificate trust and firewall, enrollment, startup and update behavior.
- Physically unplugged Internet with real two-cashier Windows terminals, scanner and printed thermal receipts.
- Physical restart, power cut, backup restore, cloud sync recovery and independent finance reconciliation.

**Step 2 remains NO-GO** for real store use. Step 3 cannot be certified before step 2. This branch is a draft stacked PR; no production DB, PC Relay, Vercel or main changes.
