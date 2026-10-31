# V69 — Closest physical-like cash-room network test to date (CI only)

This expands the exact V65 → V68 supermarket Digital Twin. Instead of 5 clients using a single HTTPS loopback network namespace, V69 launches **five persistent, separately isolated Docker Linux containers**, each acting as a cashier PC with its own private IPv4 address and short-lived bearer session. The application gateway and PostgreSQL 16 run in separate containers connected through an **internal-only Docker bridge**, with actual TCP and certificate-authenticated HTTPS traffic.

## Actual test matrix
- Five network namespace clients: 172.28.69.11 to 172.28.69.15. One gateway at 172.28.69.10 and one actual separate PostgreSQL 16 service container; no host-mapped gateway port. The internal Docker bridge is flagged internal and blocks external WAN routing.
- The V33 server accepts only those five TCP source peer IP addresses; an unregistered 6th client at 172.28.69.16 is denied 403 even with forged X-Forwarded-For.
- All five login to real PostgreSQL via distinct local auth and independently open five real cash shifts.
- Stock race: starting 7 units, five cashier clients independently prepare 2 units and issue parallel checkout commits. **Exactly 3 should commit, exactly 2 must be rejected**, remaining 1. The winning 3 produce immutable receipt and one queued print each; losers cancel their unfinished stock intent. No overselling.
- One losing cashier prepares a different 400 IQD transaction, then the actual Docker network attachment to that cashier container is disconnected. Its HTTPS request must fail; another terminal must continue using its network session, while prepared intent remains durably in PostgreSQL.
- The same container reconnects to the internal Docker bridge and resumes with its previous cashier session. Its prepared intent is recovered and committed only once, with repeat reported as replay, plus immutable receipt and queued 58mm print.
- Close all five cashier shifts with zero cash variance. Confirm final totals: 11 sales, 36,480 IQD, 11 immutable receipts, 11 queued print requests, 8 pending sync events (V67 receiver previously received the initial three only), no open shifts.
- Save machine-readable per-cashier nonsecret HTTP verdicts, synthetic network disconnect results, stock counts and final DB audit to a GitHub Actions artifact. The TLS private key, bearer session tokens and backup data are not intentionally included in artifacts.

## Boundaries
- These are **five Linux Docker containers, NOT five physical Windows PCs**; the TCP isolation and network detach/reattach are genuine operations in a software-defined bridge, NOT pulling a physical cable, restarting a hardware switch, changing router Wi-Fi, or power-cycling a POS terminal.
- The server runs the actual application routes and PostgreSQL migrations, but does not run a real printer, USB barcode scanner, keyboard-wedge driver, Windows Spooler or a certified EXE installer.
- Fully synthetic users/stock/receipts and local secrets in an ephemeral CI service only; never touch real store SQL Server, production Supabase, PC Relay, locked Home or main.
- The five-client authentication and throughput are not representative of Windows device performance, physical LAN latencies or printer behavior. Formal physical certification still requires real Windows hardware and seven field acceptance gates.

**Production release: NO-GO. Step 2 requires hands-on PC/hardware field work.**
