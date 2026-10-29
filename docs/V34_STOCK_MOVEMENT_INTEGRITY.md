# V34 — verified bounded stock movement display

Both stock-event and audit reads now require successful responses, exact counts, store-matching rows, valid timestamps and valid quantities. Each source has stable created_at/id ordering. Loading or failed reads clear the displayed rows and metrics and disable CSV. Request, store and actor guards discard obsolete replies; logout clears the history immediately. Browser-local movement records no longer enter this remote history.

The retained limits are 250 stock events and 200 audit events. The UI displays each source's loaded/total count. Search, aggregates and CSV cover loaded records only; this change does not implement full historical pagination. Audit fallback retains existing request/product deduplication. Counts describe each source, not a union count or consistent database snapshot.

Piece and kilogram totals are separate. Products missing from the bounded catalog are marked as unknown and excluded from unit totals. Missing current stock balances display a dash, including an empty CSV cell, rather than zero. Current-stock cells still reflect the independently loaded balance cache, not historical balances or a newly verified inventory snapshot.

Validation: read failures, malformed and cross-store replies, signed quantities, separate unit math, unknown products, source deduplication, local-cache exclusion, and obsolete replies after identity change. No database schema or production data changes.
