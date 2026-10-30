# ZHIROX371 V53 — Windows Release Candidate, PRE-FIELD INSTALLATION HANDOVER

**Release Candidate rc1. Status: NO-GO for live customer transactions.**

## Purpose

Create a distinct, versioned Windows **candidate installer** from the V48/V49 isolated V36 PostgreSQL cashier UI while preserving the V52 dual-PostgreSQL authenticated TLS and outage tests. This is a field-trial artifact, **not the final formal EXE**. It still presents the isolated V36 Sorani test cashier, NOT the locked original 12-card Home; the real hardware printer worker, database installer, and Cloud endpoint are not included.

- GitHub branch: `feature/v53-windows-release-candidate-preflight-20261030`, based on V52 test branch.
- Installer: `ZHIROX371-Windows-RC-V53-NOT-FOR-SALES-Setup.exe`.
- Separate application identity/directory: `%LOCALAPPDATA%\ZHIROX371-RC-V53-TEST`. Does not overwrite an earlier V48/V49 trial install.
- Read-only candidate checker: Start Menu **ZHIROX371 RC V53 - Verify Package Integrity**. It validates Windows x64, runtime, local cashier/sync scripts, PostgreSQL client library, the V36 source-isolated web bundle and SHA-256 of each allowlisted asset.
- Fails closed if a browser asset changes, unexpected CSV/image appears in the static folder, a file is symlinked or a required script/runtime is missing.
- All result reports continue to say `NO_GO` even when the checks pass. Integrity alone is NOT evidence of correct cash/accounting operations or safe hardware.

## Required controlled field trial on a CLEAN, dedicated test PC

1. Keep live market systems, old SQL backups and production Supabase completely separate. Use an isolated test PostgreSQL 16 database with store IDs, users and barcode/stock fixtures that cannot be mistaken for real data. No actual cash sales.
2. Verify installation SHA-256 locally and run the Start Menu **Verify Package Integrity** shortcut. Record installer SHA-256 and exact GitHub commit in a PRIVATE handover log.
3. Configure V33 local HTTPS, trusted private test certificate, client IP allowlist, restricted PostgreSQL credentials, device enrollment, local firewall and strong session secret. **No credentials or certificate keys in this repo or chat.**
4. On two physical LAN devices, disconnect WAN while keeping LAN on. Check live-authenticated test login, cashier sales, unit/carton/scale barcodes, stock lock, receipt sequence, shift open/close and UUID replay. Do not enable online payment.
5. Test actual HID scanner Enter/no-Enter and prefix-27 scale barcode; actual 58/80mm receipt printing with paper-out/power-cut and double-print audit. V35 currently supports print QUEUE only; NO claimed hardware printing.
6. Disconnect Cloud, enter a **synthetic** sale locally, restore network, then verify a private isolated HTTPS Cloud receiver ACK and event-ID reconciliation. The included V49 sync shortcut is **loopback test only**; it DOES NOT upload to your real Supabase.
7. Test UPS/power loss, local DB backup and encrypted recovery onto an independent physical PC. Compare stock, cash, shifts, sale IDs and outbox, and record RPO/RTO.
8. Perform security acceptance for user roles, cost visibility, customer data handling, secret rotation, backup access and failure alerts.
9. Owner and operator review signed evidence. The build may be promoted to a separately signed OFFICIAL release only after every blocker passes AND the official build restriction is deliberately addressed in an independently reviewed production branch.

## Safety design

- The RC contains no real customer CSV, PostgreSQL backup, credential or private key.
- No dependency on the public Vercel website for core offline checkout; the deployed website may show a different Home and must not be treated as proof of offline cashier functionality.
- No production Supabase migration, Vercel redeploy, PC Relay reconfiguration, or production host change was made.
- V27/V49 one-way sales-event sync is TEST-ONLY. V51 price/catalog/stock version checking is DRY RUN; no real bi-directional synchronization exists.
- Formal payment/tender services remain separate. Financial GO-LIVE is **NO-GO**.

## Built-in verification

`node --test offline/tests/release-candidate-v53.test.mjs`

`node offline/release-candidate-preflight-v53.mjs` (run from installed RC via the included `node.exe`, on Windows x64).

The Windows CI builds and validates the RC ZIP and EXE without customer data and records SHA-256. The physical checklist must be completed independently and stored privately.
