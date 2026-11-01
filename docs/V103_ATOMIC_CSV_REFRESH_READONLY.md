# V103 — Verified five-minute CSV refresh (NO-GO live cashier)

V103 extends the V102 isolated catalog with automatic, safe updates from
an operator-approved local CSV. It neither contacts production SQL Server
nor writes to any inventory, cashier or customer database.

## Scope

- Opt-in read-only HTTP on 127.0.0.1:3321; no public or LAN listener.
- Per-request exact-file metadata check and atomic all-or-nothing CSV
  parsing and price swap. Fixed five-minute full source rehash.
- Invalid, missing, symlink or concurrently modified CSV => 503 and
  previous price no longer available. File modification over 24 hours
  old or over five minutes in future => 503. Restores only after a
  newly validated complete snapshot.
- The source can only be changed by the owner/operator, NOT this
  reader. No price/stock writes and no checkout.
- Non-guessing conflict handling: ambiguous barcode refuses scanning;
  wholesale prices, costs, customer data and unverified stock are
  excluded. Strong 32+ character bearer, localhost Host + Origin,
  GET-only, no CORS or public script.
- Private Sorani RTL viewer uses the new API only when all of these
  are explicitly true in the local development session:
  VITE_ENABLE_LOCAL_PILOT=true,
  VITE_V103_READONLY_CATALOG=true,
  DEV=true.
  Default public GitHub Pages/Vercel website never mounts this reader.

## Operator-only isolated trial

1. Prepare an already-approved, genuine UTF-8 CSV in the *test*
   machine outside any public folder; V102 accepted column names are
   ItemNameID, ItemName, ItemCode and SalePrice.
2. Set these private shell variables (not in Git or public logs):
   ZHIROX_V103_OPERATOR_READONLY_CSV_REFRESH=YES_OPERATOR_READONLY_CSV_REFRESH
   ZHIROX_V103_CSV_PATH=<absolute private CSV file path>
   ZHIROX_V103_READ_TOKEN=<random independent 32+ character secret>
3. Run: node offline/market-catalog-http-v103.mjs
4. Start local Vite with the two private VITE flags mentioned above:
   npm run dev
5. Open http://127.0.0.1:3000 and enter the private token in the
   local read-only price lookup screen. Edit/replace the *test*
   CSV via the authorized operator only; new search loads the
   new verified version. Errors appear rather than stale prices.

## Tests

Real local HTTP and temporary Sorani file are used: price changes
1000 -> 1750 -> invalid file -> 503 -> repaired 1900; old mtime,
symlink swap, spoofed Host/Origin, absent bearer, malformed search,
non-GET finance requests and parallel snapshot refreshes are rejected.
File source remains unchanged by the service.

## Unfinished

There is no automatic producer of an updated CSV from actual market
SQL Server or PC Relay, no guarantee that this snapshot matches live
stock and no public access to market prices. Hardware validation on
Windows 10, true multi-PC LAN, receipt printer, barcode/scale, full
restore audit, signed release and auto-update remain open.
Official fiscal cashier stays NO-GO; locked Home remains unchanged.
