# V102 — owner-only market CSV snapshot reader (NO-GO official cashier)

**Implementation status:** isolated source-code and CI test integration. **No
connection to the actual Windows SQL Server, no transaction writes, no
public-domain exposure, and no real-market database mutation.**

## Verified source inventory (read-only inspection on 2026-11-01)

The connected market PC Relay project `vllwundrtrgdqmkqbduy` has
`pc_live_csv_manifest` with a 44,027-row export, source captured at
2026-11-01 08:17:25 UTC; `pc_os_events` contains only a sparse
`itemname_delta` event stream, not a real-time, authoritatively
transactional stock/price/receipt database.

A separate earlier user-owned Library SQL Server export contains
`ItemNameID`, `ItemCode`, `ItemName`, `SalePrice`, and
`WholeSalePrice`. The older 15-column extraction also has
`Item Name` and `SalePrice (IQD)`.

**Never expose the full file, wholesale/purchase costs, Windows paths,
database credentials, or customer data through GitHub Pages.**

## What V102 actually does

- With explicit operator approval, reads **only a locally supplied
  CSV file** using `O_RDONLY|O_NOFOLLOW`, a size limit, and strict
  UTF-8 validation. Does not connect to, write to, or remotely control
  SQL Server or PC Relay. Files are loaded once on server start.
- Correctly handles UTF-8 Sorani names, quoted commas/embedded newlines,
  and EAN/other alphanumeric scan codes preserved as strings.
- Validates required header columns and whole-IQD sale price; excludes
  invalid records. Conflicting barcode/item/price rows are marked
  ambiguous and never returned as an authoritative scan.
- Exposes only the public-facing item's ID, name, barcode and **sale**
  price, **never wholesale cost** or guessed stock.
- One private, operator-token-protected HTTP GET-only local endpoint at
  `127.0.0.1:3320`. Disallows any HTTP writes, no CORS opt-in,
  no public service, and ignores cookies. Status clearly marks
  source as `OPERATOR_CSV_SNAPSHOT_NOT_LIVE_SQL_SERVER`, stale
  after 24 hours, with source file SHA256.
- A separate Sorani RTL desktop catalog reader can be mounted only
  with `import.meta.env.DEV`, `VITE_ENABLE_LOCAL_PILOT=true` and
  `VITE_V102_READONLY_CATALOG=true`. No Demo financial state is
  mounted and **no checkout exists**.

## Operator trial (local isolated machine only)

1. Prepare an approved, genuine UTF-8 CSV export on the same test PC,
   outside GitHub and any public web server. Do not create an export
   from production SQL Server until properly authorized.
2. Supply environment variables in the private shell:
   - `ZHIROX_V102_OPERATOR_READONLY_CSV=YES_OPERATOR_READONLY_CSV`
   - `ZHIROX_V102_CSV_PATH=<absolute local existing CSV file path>`
   - `ZHIROX_V102_READ_TOKEN=<independently generated random 32+ character secret>`
   Do not commit or paste the token into public logs/chat.
3. Start only the local reader using
   `node offline/market-catalog-http-v102.mjs`.
4. Separately start the Vite DEV server on the same machine:
   `VITE_ENABLE_LOCAL_PILOT=true VITE_V102_READONLY_CATALOG=true npm run dev`
   (on Windows use equivalent private process environment variables).
   Visit `http://127.0.0.1:3000`. Type the token once, then search
   by barcode/name; the browser keeps it in React memory only.
5. **Do not run this on a public web server** and do not deploy this
   backend/token to GitHub Pages or Vercel. A browser-only screenshot
   cannot show trustworthy live market price unless the real CSV is
   mounted locally.

## Non-negotiable blockers for true live cashier

- Get access to the genuine on-premises SQL Server through a formally
  approved *read-only*, scoped credential or an existing safe PC Relay
  export. Identify verified schema, full price/stock semantics, and
  updated-at provenance. Do not assume Supabase CSV rows are live
  SQL Server inventory.
- Provide signed, authenticated *private* transport for multi-PC LAN
  read-only catalog queries; local HTTP in V102 is **loopback only**.
- Validate dataset freshness, price conflict resolution, stock parity,
  scan products/scale, printer, restart and network outage on physical
  market hardware without modifying production.
- Checkout uses a separate restricted, idempotent, transactional
  PostgreSQL path with formal owner sign-off, NOT this CSV service.

**V102 is a concrete read-only import/lookup foundation. The official
Windows market is not connected or changed.**
