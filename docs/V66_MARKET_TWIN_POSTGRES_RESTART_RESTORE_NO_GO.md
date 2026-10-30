# V66 — Real PostgreSQL restart and disaster recovery lab (CI only)

Extend the **same V65 supermarket Digital Twin**; do NOT certify physical hardware.

### Real integration executed by this workflow
1. Start a clean PostgreSQL 16 GitHub service container and run V65: real HTTPS with separate cashier logins, concurrency, carton's 12 units, 0.480kg scale barcode, two committed sales (2,500 + 11,780 IQD), two receipts and queued prints, two pending offline outbox events, closed shifts.
2. Capture actual PostgreSQL rows for sales, receipt snapshots and per-line quantities, catalog stock, ledger, checkout intents, cash shifts, pending outbox events, print queues and user role states. Produce deterministic SHA-256 fingerprint.
3. Restart the **actual isolated PostgreSQL service container** via Docker, NOT simply a Node HTTPS listener. Verify all captured PostgreSQL records identical after restart.
4. Run **a NEW authenticated HTTPS cashier session and a NEW 400 IQD sale**, with shift open/close, a real database commit, idempotent replay and a new durable print intent. Recheck exactly 3 sales, 3 immutable receipts, 3 pending offline events, 3 queued print jobs; 0 oversells.
5. Generate a genuine `pg_dump --format=custom` backup in temporary CI storage. Restore with `pg_restore --exit-on-error` into a **second fresh, disposable** PostgreSQL database with roles/ACLs. Compare all financial, catalog, user and stock rows against the post-restart source exactly; verify SQL service login still cannot forge sale, stock or bypass checkout.
6. Publish only synthetic evidence, reports, 58/80mm HTML receipts and backup SHA-256 as GitHub Actions artifacts. The backup itself includes synthetic password hashes and remains in the ephemeral CI workspace, not in uploaded artifacts.

### Explicitly not certified
- Real Windows PC with physical barcode scanner and printer, thermal paper output, power loss, real LAN switch break, remote/cloud sync, recovery of compromised secret or production DB migration.
- Docker restart tests database service lifecycle with graceful container shutdown, not loss of power mid-WAL write; power-failure and crash-recovery stress remain separate unsatisfied gates.
- Authenticated recovery verifies local runtime and restricted SQL after restore, NOT production credentials, device enrollment or physical field readiness.

### Gate state
V66 is laboratory acceptance only. **Step 2 still open for real hardware; the seven field-acceptance gates are NOT all passed. Commercial GO-LIVE = NO-GO.**
No main branch, production Supabase, PC Relay, on-site data or locked Home changes.
