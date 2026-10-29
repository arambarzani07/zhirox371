# V42 — Supplier directory pagination and explicit actions

The supplier directory now reads active profiles directly from PostgREST in exact-count pages of 50, ordered by name/ID. It can traverse beyond the bounded supplier mutation snapshot. Search selects name, company, phone, category, address or note, escapes literal wildcard characters, and runs on the server. Creditors and clear/prepaid filters run on the server too.

Directory metrics and CSV describe only the current server page. Metrics show page supplier count, creditor count, positive payable balance and prepaid account count. CSV includes full supplier IDs and the page range/count in its filename. The old loaded-invoice metric has been replaced because it described another dataset.

Every directory row action re-reads the exact active store-scoped supplier before proceeding. A validated profile is pinned into the mutation cache without replacing other selected suppliers. Payment fills the fresh balance; edit loads all profile columns. Read/search/identity tokens stop obsolete actions. Snapshot refresh hydrates selected suppliers outside its first 500 rows, preserving the explicit target. Failed lookups do not substitute another supplier.

Pending/failed directory reads clear rows/metrics and disable page controls/CSV. Empty final pages recover after shrinking counts. Global supplier refresh still verifies all three V41 snapshots; directory refresh reads only the page and falls back to a full verification if snapshots are unavailable.

Validation: 264 Node tests and the syntax/assets build passed. New tests cover 623 supplier pages, six-field literal search, safe page sums and prepaid balances, exact lookups, denied/foreign/duplicate responses, stale searches/actions, shrinking pages and pin preservation. Manual PC QA reached page 501–523 of 523, verified its 23-row/eight-column CSV with full IDs, edited the profile of supplier 0521 without saving, opened payment for that exact ID/balance, and retained the selected ID through snapshot refresh. Authored browser and real Auth/PostgREST scenarios are syntax-checked, pending remote CI execution.

Limits: offset pages are live reads, not a repeatable snapshot. Orders, receiving/account history, statements and selectors retain the V41 bounded snapshot plus explicit supplier pins. This does not provide a complete supplier account statement, global store payable sum, server-owned invoice/order numbering or offline LAN transport. Locked Home, SQL/RPC definitions, grants, RLS, production database and PC Relay are unchanged.
