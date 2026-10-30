# V61 — Step 2 / Isolated PostgreSQL cash-ledger execution role (NO-GO)

## New executable test-stage protections
- The network-facing V60 PostgreSQL login no longer receives direct INSERT privileges for sales, sale_lines, stock_ledger, receipt_counters, event_outbox or immutable receipt_snapshots. It no longer receives UPDATE rights for products, receipt_counters or event_outbox.
- Exact pre-existing audited V26 cash checkout is moved to a dedicated **NOLOGIN** PostgreSQL function owner with narrowly enumerated read, insert and update grants. The function is SECURITY DEFINER and retains fixed search_path=pg_catalog,zhirox_local, with no dynamic SQL or user-controlled identifiers. Schema CREATE is revoked immediately after transfer.
- The immutable V34 receipt-capture trigger is separately moved to another **NOLOGIN** SECURITY DEFINER owner with only read rights on sale/store/lines and INSERT on receipt snapshots. The HTTP API cannot create or alter a saved receipt directly.
- The cashier server continues using the same V60 non-owner login, authenticates users through V3 local sessions and sends the same V31 checkout calls. Direct unauthorized store-stock inflation, sale insertion, ledger editing and fake delivered outbox events must now be rejected by PostgreSQL.
- V61 regression runs the **real PostgreSQL 16 server, real TLS V33 gateway and two competing logged-in cashiers** in isolated GitHub Actions with the authentic V59 end-to-end cash flow. It also tests that forbidden direct SQL is denied.
- **No real supermarket database, remote cloud receiver, PC Relay, public site, main branch or Windows cashier is modified.** No production credentials are used.

## Important remaining security limits
- The service login still has INSERT/UPDATE on checkout_intents_v31 and cash_shifts_v37 and UPDATE on stores/local_users. Those must be narrowed to an audited function boundary with explicit authorization and tenant scoping.
- PostgreSQL EXECUTE permissions alone do not bind a cashier identity to a database login. A fully compromised server process may pass arbitrary UUID parameters to an existing executor function. Production must authenticate the actor within a hardened server and enforce store isolation, evaluate a dedicated authorization wrapper and audit all SQL functions.
- The NOLOGIN executor must never be treated as sufficient isolation from a compromised migration-owner account. It is non-owner-of-tables but has narrow DML privileges; a compromised function owner or DB owner still needs independent controls.
- Work requires measured on-premises Windows/LAN TLS, physical scanner/receipt/UPS, independent restore test and owner-witnessed acceptance.
- Never run these test SQL files on real production. An actual migrator would require separate migration IDs, replay guarantees, audit and rollback planning.

## Release decision
**Step 2 IN PROGRESS. System GO-LIVE NO-GO.** Step 3 cloud delivery is not to be claimed completed until Step 2 is field-validated; physical Windows and network acceptance cannot be performed merely by a GitHub Actions green check.
