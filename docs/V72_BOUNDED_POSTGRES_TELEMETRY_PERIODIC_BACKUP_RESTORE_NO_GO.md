# V72 — bounded real PostgreSQL telemetry, five authenticated HTTPS cashier reads, automated backup/restore (NO-GO)

This phase continues the **same V65–V71 synthetic supermarket Digital Twin**. The end-to-end CI job first performs actual PostgreSQL 16 sales, Docker bridge five-PC virtual checkout, 100-sale V70 bounded load, and V71 non-graceful SIGKILL/PostgreSQL WAL restoration and manual-review printer fencing. Only then may V72 run.

## Real experiment
- Require the precise post-V71 baseline: **112 actual committed sales**, **112 immutable receipts**, **112 print intents**, **112,230 IQD**, **109 pending outbox events**, one print dispatch fenced for manual review, zero open shifts and 49 units remaining of the V70 test SKU. Refuse any preexisting or real DB.
- Start real TLS 1.2+ cashier gateway backed by the isolated PostgreSQL 16 service and restricted API database login. Authenticate **five independent cashier identities** with their own cryptographically signed session tokens.
- For **75 discrete one-second intervals**, each cashier sends one real HTTPS `/api/local/v32/receipts?limit=20` request, totaling **375 genuine authenticated database-backed HTTPS requests**. Assert every request is 200 with cashier-specific receipt data and measure observed client timing. It is a **bounded read-heavy test**; V70 already covers 100 committed sales, and this is *not* 24-hour continuous checkout stress.
- Take **six real Docker container CPU percentage / memory MiB samples** and PostgreSQL `pg_stat_database` / `pg_stat_activity` snapshots at ticks 0,15,30,45,60,74. Do not estimate missing data or label a synthetic dashboard as telemetry.
- At ticks **0, 25, 50**, invoke actual asynchronous PostgreSQL **`pg_dump --format=custom`** while HTTPS requests are in progress. Validate nonempty PGDMP signature, archive catalog, byte size and archive SHA-256. Backups and TLS private keys stay inside the ephemeral CI runner; **only evidence metadata** is uploaded.
- Create a **new disposable PostgreSQL database**, use genuine `pg_restore --exit-on-error` from the **third** timed snapshot, then compare all original PostgreSQL sales, receipt JSON, products, stock ledger, intents, shifts, outbox, print queue, manual-review dispatch and cashier roles, plus SHA-256 exact normalized state. Confirm original database did not mutate under read workload and backup.
- Recheck restored restricted API DB role cannot directly insert forged sales or update stock. Report actual elapsed runtime, p50/p95/p99 read HTTPS latency, throughput of read probes, actual CPU/RAM readings, backup checksums and recovery verdict.

## Scope and explicit exclusions
- This is **75 seconds**, not 24 hours, a durability burn-in, or a commercially representative busy-hour production load.
- Five separate signed cashier sessions in one loopback HTTPS test process, not five physical Windows PCs; preceding V69/V70 steps separately test five Docker network namespaces and real virtual NIC disconnect.
- CPU/RAM measurements are point samples from a **Docker PostgreSQL container**, not Windows PC hardware, and no extrapolation to physical market energy or throughput should be made.
- Three timed local backups within this one CI run are **not a persistent scheduling service**, cloud storage, incremental PITR or encrypted off-site backups. Production requires a separate backup schedule, encryption, storage retention and restore drills.
- No physical Windows Spooler/thermal printer, scanner, UPS, cable or power event tested. The V71 ambiguous print remains **manual_review**, not automatically printed.
- No production Supabase, legacy SQL Server, PC Relay, real cashiers, real customer information, locked Home files, or main branch touched.

**Physical seven-gate acceptance remains incomplete. Commercial deployment NO-GO.**
