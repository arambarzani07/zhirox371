# V104 — verified local CSV versus isolated PostgreSQL price parity

**Status: NO-GO official cashier.** This version is a real, read-only
reconciliation tool for a **disposable test market**, not a migration,
live price feed, stock update, or market SQL Server integration.

## Tested data boundaries

- The only database names permitted are `zhirox_v80_disposable` and
  `zhirox_test_market`, accessed via localhost only.
- The database must have **exactly one store**, with the known V80
  disposable test-market UUID and the name **مارکێتی تاقیکردنەوە**.
- Queries occur inside PostgreSQL **REPEATABLE READ READ ONLY**
  transaction and roll back without any mutation. It checks only
  active product IDs, sale prices, names and barcode associations.
- An operator-selected UTF-8 CSV must be parsed by the V102 reader,
  demonstrate a source SHA256 and a modified time within 24 hours;
  malformed or stale files abort before the database is contacted.
- Audit never assumes CSV ItemNameID corresponds to PostgreSQL UUIDs.
  Products are matched solely on **exact barcode**. Duplicate or
  contradictory barcode entries are explicitly flagged; price and
  normalized Sorani name mismatches, missing on either side and
  matching pairs are counted separately.
- The returned output includes **at most 30** sample barcodes and
  selling prices, never wholesale cost, stock data, debt/customer
  information or private file paths. No API is opened on public WAN.
- `ready_for_catalog_import` is deliberately **false** regardless
  of matching values, and `stock_compared` remains false because
  V102 CSV does not establish authoritative inventory quantities.

## Real CI integration

The V81 PostgreSQL 16 pipeline provisions the isolated persistent
V80 fixture, runs all acceptance and atomic checkout checks through
V101, then runs the V104 reader in a strict SQL read-only transaction.
A private synthetic CSV is generated *from the actual disposable SQL
rows* for a control set (never from production). It then intentionally
changes one CSV sale price, removes a CSV barcode, adds an unknown CSV
barcode, and introduces a conflicting same-barcode price to prove
mismatches are surfaced without SQL writes. It checks that sales,
outbox, stock, price and barcode counts remain identical before/after
and uploads only a sanitized, synthetic V104 audit JSON summary.

Unit tests verify safe mismatch taxonomy, maximum records, immutable
read-only envelope, forbidden database/store scope and refusal of
stale or non-approved operator files.

## Before any real market go-live

- Do **not** automatically import CSV into the supermarket SQL Server
  or real local POS database; obtain explicit owner authorization.
- Use a proven READ ONLY SQL Server or approved PC Relay export with
  field lineage, signed provenance, fresh capture timestamp and safe
  private transfer. **No production connection is configured by V104.**
- Reconcile all barcodes, pack units, scale prefix 27, sale price
  semantics and independently audited stock/lot/FEFO quantities.
- Prove permission-scoped cashier API, two physical Windows PCs,
  offline LAN, printing/scale/scanner, backup and restore and signed
  auto-updater/rollback on actual market hardware.
- Keep the owner-locked 12 main × 4 subcard Sorani RTL desktop design
  unchanged. GitHub Pages remains a **DEMO preview**, not a public
  financial/POS database interface.

**Explicit opt-in for isolated test only:**
`YES_ISOLATED_V104_READ_ONLY_PARITY` is required by the API;
this module has no production startup or public HTTP entrypoint.
