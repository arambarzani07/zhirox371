# V70 — Five Docker cashier stations, 100-sale load and local LAN interruption

**Digital Twin / Synthetic CI acceptance only. Physical deployment remains NO-GO.**

V70 runs atop the existing cumulative V65→V69 integration: one actual PostgreSQL 16 service, genuine committed financial transactions, real HTTPS through a separate Docker-hosted cashier gateway, and five isolated Docker Linux client network namespaces with independently authenticated and revocable user sessions.

## Actual workload

- An isolated V70 fixture adds an exclusively synthetic SKU with 150 base units and a fixed server-validated cash price of **750 IQD**. An enforced SQL guard refuses to apply the fixture to any other database or dataset.
- Exactly **20 checkout cycles per client × 5 clients = 100 new sales** through the real HTTPS V31 API (durable prepare, commit, idempotent replay and one receipt-print queue request), in addition to 11 already confirmed in V65–V69.
- The five cashiers have independent open and close shifts and should each close with exactly **15,000 IQD** expected and counted, zero variance.
- At round 10, client 3 prepares a durable sale and then is **really disconnected from the Docker internal bridge**. A live HTTPS request must fail and another cashier must continue. Client 3 is reattached to its original IP, reads its persisted intent and commits the *same request ID* precisely once. No cloned sale or lost inventory.
- Each cashier includes a deterministic **client-side pacing delay** (0, 35, 70, 105, or 140 ms) before preparing an order. This is **not actual network latency emulation**. Captured durations measure observed real HTTPS prepare/commit response latency through the internal network.
- Expected SQL totals are **111 sales**, **111 immutable receipts**, **111 print queue items**, **111,480 IQD** sold in all cumulative tests, **108 new pending offline events**, 0 open shifts, and 50 remaining units of the synthetic V70 SKU. The separate local cloud-style receiver still contains exactly 3 earlier synced transactions.
- Validate exactly 100 unique committed request IDs, matching receipt rows and sale-line values, minus 100 base units in the real PostgreSQL stock ledger, and 100 valid latency samples. Report p50, p95, p99, max and throughput as observed, never as guessed metrics.
- Upload reports and nonsecret client verdicts to GitHub Actions artifacts, not bearer tokens, private TLS keys or real customer details.

## Safety, time and claims

This is a **bounded 20-round load test**, not an overnight/24-hour soak. It can measure practical application transaction contention and detect regressions but cannot certify sustained market throughput across days. Five Docker Linux clients are separate virtual network stations **not five Windows PCs**. The internal bridge disconnect/reconnect is a real virtual NIC event, not an unplugged physical switch/router, ISP outage or Wi-Fi roaming. No Windows printer, actual USB barcode hardware, real mains loss, production payment settlement or cloud Supabase is involved.

No changes to production Supabase, SQL Server, PC Relay, real PCs, locked Home or main. **Step 2 physical field acceptance remains pending; commercial release NO-GO.**
