# V5 Local Catalog — real HTML/JavaScript PC pilot

This separate V5 screen is in **offline/local-catalog-v5.html** and is served at `http://127.0.0.1:3305/catalog` by **offline/local-catalog-server-v5.mjs**. It is a real source-code-rendered Sorani RTL interface, not an image. Its **Preview** content is explicitly marked demo-only and MUST NOT be represented as actual shop stock.

## Real local data path
1. Login via V3 local authentication (store_id, username and password).
2. Bearer session is held only in browser memory.
3. `GET /api/local/v5/products?search=...&limit=20&cursor=...` lists ACTIVE products, sale unit price, base-unit stock, and all ACTIVE barcodes from the authenticated store's isolated PostgreSQL database.
4. The query scopes by session store_id. The browser cannot override the store.
5. Cursor pagination uses stable `(name,id)` ordering, returns at most 50 products per request. Prices and BIGINT stocks travel as decimal strings.
6. All UI assets are embedded in the HTML. No CDN, Supabase Auth or WAN dependency is used by this pilot page.

## Not implemented
- Updating products, adding barcodes, changing prices, receipts, sales and carton cost.
- Current `products.price_minor` is a basic base-unit sale price. A carton barcode displays `quantity_base_units`, but it does NOT mean independent carton pricing is implemented.
- Weighted prefix-27 barcode decoder, quantity conversion pricing, role-sensitive purchase cost, imports, bulk editing and inventory reconciliation.
- Full `operations.js` and `workspace.js` remain on their previous implementation.
- Secure LAN deployment (HTTPS, device credentials, firewall, provisioning, reset policy) is incomplete.
- Test with WAN disconnected **only in a disposable local environment** and do not enable a real cashier.

## Run in isolated development environment
- Apply existing migrations `001_core.sql`, `002_atomic_checkout.sql`, `003_local_users.sql`, `004_catalog_indexes.sql` in a disposable local PostgreSQL.
- Provision a safe test store and test credentials with salted password hashes; use no real store data.
- Install `pg` in an isolated checkout, set `ZHIROX_LOCAL_DB_URL` and `ZHIROX_LOCAL_SESSION_SECRET`.
- Run `node offline/local-catalog-server-v5.mjs` and visit `http://127.0.0.1:3305/catalog`.
- Without logging in, only clearly-labeled sample data appears. After successful login it fetches actual local test data.

## GitHub review gates
- `node --test offline/tests/local-catalog-v5.test.mjs`
- Existing `npm test` and isolated PostgreSQL smoke tests.
- Byte-for-byte owner-locked Home guard.
