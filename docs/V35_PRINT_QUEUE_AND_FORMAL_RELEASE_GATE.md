# V35 — durable local print queue and hard gate for formal rollout

**Status: development foundation merged only after CI; STORE RELEASE = NO-GO.** No retail hardware was accessible in this GitHub-only task. Nothing here installs on a cashier PC or prints paper. No production data, real Supabase, PC Relay or locked Home design may be modified as part of these checks.

## Implemented in isolated source

- `offline/migrations/012_print_queue_v35.sql` adds a PostgreSQL queue with unique job ID and **one job per committed sale** (reprinting needs a future manager-only audited authorization path). It only accepts receipts captured atomically by V34. A different cashier, unknown sale, reused job ID, or changed print width is rejected.
- `offline/local-print-queue-v35.mjs` adds `POST /api/local/v35/print-jobs` and `GET /api/local/v35/print-jobs?job_id=<uuid>`. Both require an authenticated, current local session and derive the store/cashier exclusively from it. Body is exactly `{sale_id,job_id,width_mm}`, with paper size 58 or 80; arbitrary content, prices and commands are never accepted.
- Under the **existing test-only V33 HTTPS gateway**, set BOTH `ZHIROX_V34_RECEIPT_PREVIEW_ENABLED=true` and `ZHIROX_V35_PRINT_QUEUE_ENABLED=true` to enable these endpoints. Do not expose the module as a standalone HTTP or public Internet server. V33's configured TLS, peer IP allowlist, allowed Origin and rate limiter remain in force. Always use a disposable PostgreSQL instance until a full security and hardware review.
- A successful POST returns HTTP 202, `state: queued`, **`hardware_printed: false`**. There is no physical spooler and no claim of real paper delivery. The queue does not write `state=printed`; repeated submissions of the same job do not duplicate it.
- `scripts/release-readiness-v35.mjs` is a read-only, machine-readable NO-GO assessment, and the Vite build refuses an explicit `VITE_ZHIROX_RELEASE_MODE=official`. A standard `npm run build` is STILL A DEMO PREVIEW, NOT AN OFFICIAL POS.

## Run safe checks

From a developer checkout: `node scripts/release-readiness-v35.mjs --json`, `node --test scripts/release-readiness-v35.test.mjs`, `node --test offline/tests/*.test.mjs`. GitHub Actions applies migrations 001–007, 009, 011, 012 and their SQL tests only to a disposable PostgreSQL CI database. The new formal-release workflow also verifies that an explicitly official Vite build is denied. **A passing CI must NOT be treated as a go-live approval.**

## Formal acceptance — mandatory outside GitHub

1. **Cashier / finance:** Replace the remaining React browser Demo context and modules with real authenticated local PostgreSQL APIs; use real shift accounting and server-derived cash, debt, refunds, mixed tenders, discounts, purchases and stock adjustments with audit, role controls and no Demo fallback. Confirm correct basket and printed receipt rows, expiry and stock rules.
2. **PC / printer:** Install a Windows printer adapter/service after exact printer model and interface are known. Prove that a single durable queue job corresponds to one successful physical print, with explicit retry/reprint policy and recorded printer errors. Verify 58/80 mm widths, Sorani text rasterization, RTL column boundaries, scale weight, carton quantities, cutter and paper-out scenarios on actual hardware.
3. **LAN / resilience:** Register workstation credentials, trust the private local CA on each PC, configure strict firewalls and dedicated least-privilege DB user. Run two distinct cashiers simultaneously against one remaining unit and verify one sale, one receipt and no oversell. Unplug the WAN while LAN remains active: barcode scan, cash checkout, stocks, shift closure and printing must continue without Supabase.
4. **Backups / failure:** Verify UPS, WAL recovery and actual power-loss drills on a test machine. Produce independent encrypted backups to another physical device, restore into a *separate* host/database, agree on recovery-point/time targets and measure them. Verify idempotent retry after browser/PC restart and router/switch outages.
5. **Operational / data:** Validate real catalog and barcode import against duplicates, scale prefix-27 weights and units, stock counts, currency and transaction limits. Document owner-approved permission matrix and staff training; run a supervised pilot with test products before any actual market sale.
6. **Release authorization:** Record machine IDs, exact tested git SHA, operator/date, printer make/model, validation results and owner sign-off. Only then may an independent release create an official build; remove the explicit Demo release block only alongside the fully implemented real transaction routes and passing physical acceptance.

**Current NO-GO blockers remain**: production React is still DEMO; V32 operational cashier is dev-only; queue is not a print driver; hardware, SQL least-privilege rollout, production financial parity and real-market offline acceptance have not been proven.

No live store, production Supabase, PC Relay, actual customer accounts, financial records or locked PC Home code is changed by V35.
