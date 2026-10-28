# ZHIROX Local API security gate (NOT IMPLEMENTED IN PRODUCTION)
The local-session.mjs module implements integrity-protected, expiring, store-scoped session tickets as an isolated building block. It is NOT an authentication solution: tokens must not be issued until a locally stored account has been authenticated with a password hash or an enrolled device mechanism.

Before exposing API on LAN:
1. Local users table with Argon2id password hashes, role, disabled flag and store membership.
2. Server-side password verification + lockout and request throttling; never trust cashier_id/store_id supplied in the body.
3. Bind session principal to checkout SQL's actor/store; derive from verified session, not arbitrary request JSON.
4. Short expiry, revocation/session epochs, audit logging, per-cashier authorization for discounts/refunds.
5. HTTPS on LAN with managed trust (or mutually authenticated tunnel), DNS-independent local discovery, firewall restrictions and CSRF protection if cookies are used.
6. Integration tests confirming cross-store/role impersonation is impossible.
7. Protection of local keys and secrets through Windows credential management or equivalent.
8. PostgreSQL application role with least privilege and approved function grants; no browser-facing database credentials.

No credentials, database migration, production connection or LAN listener is created by this change.
