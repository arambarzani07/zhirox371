# ZHIROX V78 — One Local PostgreSQL DB, 48 Section Identities

Status: foundation only. Neither production migration nor official release.

## Implementation
- 12 main modules × 4 distinct Sorani RTL PC submodule pages.
- Existing React features remain demo/localStorage until authenticated LAN APIs are connected.
- Isolated PostgreSQL cashier foundation already includes products, barcodes, stock, sales, receipts, local users, shifts, cash movements, refunds and audit layers.
- Migration: offline/migrations/027_section_settings_v78.sql (disposable local PostgreSQL only).
- Registry: 48 semantic IDs with honest UI states demo_ui, read_only_demo, planned.
- Settings: one store_id + section_id + key, versioned JSONB for configuration only.
- Immutable settings audit with validated local manager/owner actor and optimistic concurrency.
- No PUBLIC access and no browser-facing PostgreSQL credentials.

## Required security conditions
- Server-side verified local session must establish store/actor. A caller UUID is NOT authentication.
- Never grant section settings functions to browser, cashier SQL or public roles.
- Financial amounts, debt, stock and refunds must use typed transactional domain tables, not generic settings JSON.
- Do not run this migration on an active market, Supabase or legacy SQL Server.

## What is not yet complete
- 48 real authenticated PostgreSQL API integrations are NOT in place.
- Some UI pages are read-only or unavailable: the SQL registry does not imply complete business features.
- Supplier purchases, debts, discount/offer, staff attendance, approvals and other missing domains need typed schema, domain APIs and tests.
- A separate backup/restore acceptance, Windows installer, multi-cashier airgap verification and explicit real-store migration approval are still required.

## Testing
- node --test offline/tests/section-registry-v78.test.mjs
- CI: V78 48-section local PostgreSQL settings isolation, disposable PostgreSQL 16.
- SQL integration test: offline/tests/034_v78_section_settings.sql, with fixture ROLLBACK.
