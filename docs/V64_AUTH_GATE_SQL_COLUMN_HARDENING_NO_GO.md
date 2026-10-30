# V64 — Step 2 / Cashier login and network-facing SQL privilege guard

**CI TEST ONLY · official release NO-GO**

The V64 feature gate uses the existing V63 DB-issued identity proof, and adds:

1. A separate in-memory per-TLS-socket-peer budget of 8 POST /api/local/v3/login attempts per 60 seconds, including unknown users and wrong passwords. It is independent of the older general 25-requests-per-IP rate limiter. The peer is the encrypted socket's remote address; X-Forwarded-For is ignored. Unregistered routes and peers fail closed. Accounts still use DB-backed 5-failure lockout.
2. A strict list of inspected cash-only V63 endpoints. In V64 protected mode, refund, tender, reservation and manager APIs outside that list are denied (410) rather than accidentally falling through to an older handler. V63 legacy checkout route responses remain 410.
3. PostgreSQL role hardening in isolated disposable DB: remove table-wide UPDATE on local_users, allow UPDATE only on failed_attempts and locked_until, remove all store UPDATE from API login. The V60-V63 protected SQL executors keep their own restricted row-lock and finance permissions.

## Genuine CI acceptance
- A newly created, empty, disposable PostgreSQL 16 service, schema through V54 plus isolated role gates V60-V64.
- Two independently logged-in and DB-proof-bound cashiers over verified loopback TLS with stock race, one commit, printed-ticket queue, receipt snapshot and offline event outbox.
- SQL role has no direct UPDATE grants on account role/password_hash/enabled/session_version or the store row; the login handler still counts invalid attempts and can perform good local authentication.
- Five additional invalid logins consume the remaining quota after the first invalid and two successful logins; the following POST returns 429. Health remains available and an unreviewed refund URL returns 410.
- Unit tests verify limits, time-window resets, peer independence, and fail-closed upper bound.
- Regression when V63 is disabled verifies historical session/auth contract remains unchanged.

## Limits
- In-memory limiter resets on process restart and is not shared across multiple HTTPS gateway processes. Distributed attempt throttling needs a durable local store/device policy.
- V64 endpoint allowlist covers the currently implemented cash-only path; other essential store functions require individually reviewed DB-proof authorization before enabling.
- Postgres test role/grant files include synthetic credentials and only refuse real/ populated databases; not reusable production migration code.
- DB-proof bearer is still usable if stolen; an attacker who controls the gateway process can misuse active sessions.
- No validated real Windows PC, real LAN CA/cert renewal, physical printer, scanner, power-loss testing, backup restore, or Cloud sync production proof.

No changes to main, Supabase production, PC Relay, store PC or locked Home. **Step 2 IN PROGRESS; official deployment NO-GO.**
