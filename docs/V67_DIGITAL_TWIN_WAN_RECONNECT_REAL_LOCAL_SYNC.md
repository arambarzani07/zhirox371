# V67 — WAN reconnect outbox acceptance in the same V65/V66 supermarket Digital Twin

## Real local services and failure simulation

The V67 GitHub Actions workflow **repeats V65 and V66** first: genuine disposable PostgreSQL 16, HTTPS two authenticated cashiers, 3 distinct committed sales totaling **14,680 IQD**, store stock, immutable receipts, queued printer jobs, a real PostgreSQL service container restart, and an exact pg_dump/pg_restore into a second isolated database.

Then V67 creates a **third, separate disposable PostgreSQL database** containing the existing V28 cloud-style receiver schema. The actual V27 outbox sender and actual V28 HTTP receiver are exercised in the following stages:

1. **Receiver unavailable:** no listening loopback server. The real sender attempts 3 event deliveries; all TCP connections fail. Assert 0 acknowledged, 3 pending, 3 retry records, and 0 remote received sales. Checkout and receipts were already safely committed independently of the receiver.
2. **Receiver reconnects:** an actual Node HTTP receiver starts on the previously unavailable localhost port; retry backoff expires. The sender claims and delivers all 3 HMAC-signed sale.completed events with valid server acknowledgements. Assert exact event ID parity, no pending events, and remote total **14,680 IQD**.
3. **Idempotency and tamper tests:** retry after all acknowledgements claims 0. A signed duplicate of an existing event returns the existing event unchanged; changing a financial total while reusing the same event ID triggers HTTP 409 and does not alter remote financial data.
4. **Owner summary:** actual V28 authorized owner summary reports 3 sales, total 14,680 IQD and no missing receipt numbers. It supports sale.completed ONLY, not the full six intended alert categories.

GitHub Actions uploads an evidence artifact containing lab reports, true PostgreSQL backup/restore audit, 80/58 mm HTML receipt previews, and V67 offline/reconnect sync report. No backup dump file or customer credentials are uploaded.

## Hard limits
- The WAN failure/recovery is **simulated by disconnecting and reconnecting a loopback HTTP receiver** while using real PostgreSQL and genuine Node network traffic. Not a real router, ISP, Cloud, Supabase, public TLS endpoint or external provider.
- Local sender uses a disposable database owner in this lab. A dedicated least-privilege sync identity, hardware enrollment and authenticated WAN production deployment must still be reviewed.
- No real Windows PC, scanner, printer, LAN cable outage, on-prem power cut or authentic paper receipt tested.
- The six owner notification types remain future work; only sale.completed is received. No real cloud data is changed or transmitted.

**All seven physical-acceptance gates cannot be passed in this virtual test. Commercial deployment NO-GO.** This is a new read-only / synthetic lab progression, not authorization to modify production Supabase, PC Relay or main branch.
