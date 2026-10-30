# V65 — Digital Twin of Supermarket Cashier Operation (live CI lab)

## Real services, synthetic peripherals
- REAL PostgreSQL 16 disposable service and real migrations (through V54), V60-V64 restricted SQL identities, authenticated live HTTPS Node gateway on 127.0.0.1.
- Two distinct authenticated cashier logins, two independent open/closed shifts and a shared database. A concurrent last-two-unit stock race must yield exactly one winner with no oversell, duplicate receipt or fake outbox event.
- WAN is disconnected FOR THE NODE TEST PROCESS using a socket-level test preload: outbound non-loopback connections fail before DNS/connection. This is not an actual router, ISP or PC cable disconnect.
- The HTTPS listener is closed and restarted on a new loopback port while the same PostgreSQL stays alive. Receipt, outbox, existing signed session and idempotent sale replay survive. This is not a PostgreSQL crash or mains failure.
- HID keyboard simulated as scanner keyboard characters with CR, LF and CRLF; authenticated HTTPS scans use real barcode/PLU matching and checksum rejection.
- Real mixed SQL sale: 2 units x 500 IQD + 1 carton x 5,500 IQD + 0.480kg tomatoes at 11,000 IQD/kg = **11,780 IQD**. Also a separate last-stock sale of 2,500 IQD.
- Actual PostgreSQL immutable receipt rows, print queue and 80mm/58mm HTML receipts are validated with the Windows V54 print snapshot validator. No physical printer or paper is connected. hardware_printed=false stays mandatory.
- Expected totals: exactly 2 sales, 2 receipts, 2 queued print jobs, 2 undelivered offline events, water stock 16 units and tomato stock 1,520 grams; cash shift reconciles.

## CI evidence bundle
The GitHub Actions run uploads artifact: zhirox-v65-market-digital-twin-evidence
- lab-report.json: measured DB state and checkpoints
- scanner-simulated.txt: raw scanner bytes and normalized labels
- receipt-80mm.html: rendered immutable snapshot (not actual paper output)
- receipt-58mm.html: rendered immutable snapshot (not actual paper output)

The workflow and its artifact certify only the code and synthetic isolated lab at that exact commit. Never substitute an earlier green run for the latest result.

## Safety and limits
All market rows, login IDs, certificates and credentials are synthetic. Schema migration refuses nonempty or wrong database. No production SQL Server, Supabase, PC Relay or locked Home changes.

Unverified: real Windows EXE installation, actual HID scanner, actual LAN switch/cable outage, genuine printer driver/physical paper, PostgreSQL power cut/restart, backups/restores, cloud catch-up with an actual Internet return, production credential enrollment and TLS trust.

**Step 2 in progress. Official production GO-LIVE: NO-GO.**
