# V63 — Database-issued cash actor proof (Step 2, staging only; NO-GO)

## Real implemented scope
- Separate local DB-authenticated, randomly issued 32-byte session proof is minted by a PostgreSQL SECURITY DEFINER issuer only after it independently verifies the cashier's enrolled bcrypt password, enabled account, store and unlocked status. Proof is stored **only as SHA-256 digest** in restricted table; 15-minute expiry and session_version checks bind it to the current user record.
- Existing Node local Scrypt login remains mandatory. New V63 isolated opt-in additionally calls DB password verification; the signed 15-minute local bearer includes the opaque proof and is transmitted only over the V33 tested HTTPS transport.
- V31 prepare/commit/cancel and V37 shift open/close API routes use new proof-guarded V63 SQL wrappers. Original unguarded V31/V37 EXECUTE is revoked from the network-facing SQL role. A random UUID supplied to the SQL function alone is not sufficient; a database-issued proof matching the exact cashier AND store is required.
- Two cashier acceptance over real disposable PostgreSQL 16 and HTTPS tests successful session creation, distinct proofs, denied cross-cashier/store/malformed proofs, revoked session version, expired proof, denied unguarded SQL, concurrent last-stock race and idempotent receipt/outbox/print/shift operations.
- Isolated PostgreSQL CI database only, synthetic users. **No existing password hashes are converted.** In a real system, secure enrollment with user authorization is required; cannot silently add a second password verifier.
- All existing V59–V62 paths remain as non-V63 feature-flagged tests. No actual production PostgreSQL, market PC, Supabase, legacy SQL Server, owner-locked Home or PC Relay changed.

## Limits: NOT security-certified for production
- A compromised API process can misuse **currently active bearer/proof tokens it observes**; this is not proof against all forms of API compromise or stolen tokens. The system does reject invented actor/store identities without the matching independent DB credential.
- Some other routes (direct V3/V26 legacy endpoints, other mutations such as print queue and returns) have not been moved behind V63 proof wrappers and must be independently audited/restricted before production. This V63 check covers V31 and V37, not the full application.
- Actor verifier lifecycle, bootstrap enrollment, DB migrations, TLS trust and device enrollment still require secure, audited production design. The CI HMAC/session secret and bcrypt credential are synthetic only.
- Complete local PC installation, LAN outage, power-loss, printer, reconciliation and recoverable backup/restore remain unverified.

**Release decision: NO-GO. Step 2 remains IN PROGRESS; do not count Steps 3–7 as completed.**
