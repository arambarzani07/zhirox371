# V68 — 5 simultaneous cashier + LAN gateway recovery in the SAME supermarket Digital Twin

## Test plan (all synthetic and disposable)
- Repeat V65 live PostgreSQL 16 + actual HTTPS two-cashier shopping with unit/carton/scale barcodes, price lock, paper HTML queue.
- Repeat V66 actual PostgreSQL container restart, one post-restart HTTPS sale, correct pg_dump/pg_restore to a second disposable database, and restored API SQL role checks.
- Repeat V67 actual V27 outbox and separate V28 receiver with synthetic loopback outage, successful reconnection, strict event-ID parity, rejected duplicate/conflicting financial events.
- V68 adds five **independent HTTPS bearer login sessions and cashier-specific open shifts**, all backed by the same real localhost PostgreSQL. These are five simulated clients, not five separate Windows terminals.
- A new store SKU has 15 units of stock. Five cashiers simultaneously prepare and commit purchases of four units each (20 requested). The database MUST allow **exactly three sales (12 units)** and reject exactly two purchases due to insufficient stock. Remaining stock must be exactly three. No oversell or duplicate receipt.
- Both failed requests must be explicitly cancelled (never leave ambiguous stock or intents). A loser prepares a different 400 IQD item and leaves that intent in the durable journal.
- **Actual HTTPS listener shuts down.** A separate test client TCP request to the old port MUST fail with ECONNREFUSED while PostgreSQL stays available, and the pending intent plus receipts remain durable. Restart the HTTPS service on the **same port**, with already-issued signed cashier sessions still active; GET /api/local/v31/recover must find the intended cashier's pending request, but another cashier cannot see it.
- Commit that exact request once after reconnection, verify subsequent repeat is replay-only, verify immutable server-authored receipt and queued 58mm print intent. Close five independent cash shifts with zero variances.
- The V67 receiver remains at exactly 3 already synced test sales; four new V68 sales remain queued for later background sync. Cashier writes must NOT automatically invoke cloud.
- Final synthetic lab totals: **7 committed sales**, **27,080 IQD**, 7 receipts, 7 queued print jobs, 4 new pending outbox events, zero still-open shifts.
- Publish v68-five-cashier-lan-recovery-report.json along with V65–V67 authentic evidence in CI artifacts. Tests fail closed on an unexpected response.

## Explicit limits and release decision
- The interruption is real **loopback HTTPS TCP listener shutdown**, NOT physical LAN switch, router/cable failure, real Wi-Fi instability, power cut or PostgreSQL host crash. It proves server/gateway reconnection while local DB survives, not full end-to-end network partition recovery.
- Five cashiers are authenticated sessions on one loopback client host, NOT separate PCs. This tests transactional contention, not five Windows installations or real network bandwidth.
- Receipt printing is queued and paper-width rendered, with hardware_printed=false. No physical scanner, printer, driver or store peripheral tested.
- No production Supabase, SQL Server, real store PC or PC Relay are touched; no modifications to locked Home or main branch. CI credentials and purchases are synthetic.
- Step 2 field work, seven physical acceptance gates, Windows installer and actual market rollout remain incomplete. **GO-LIVE: NO-GO**.
