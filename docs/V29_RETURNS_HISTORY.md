# V29 — paginated return receipt selection

The Returns list now reads 50 posted receipts per server page with exact RLS-scoped counts, stable created_at/id ordering, server refund-status filtering and out-of-range page clamping. It reuses the read-only V28 history helper rather than the newest-100 legacy cache.

The existing V22 exact receipt-number, UUID and recorded-barcode lookup remains a separate server operation. Ambiguous barcodes require a specific receipt. Selecting a receipt outside the displayed page remains supported. Page/filter changes discard the prior selection, and the line-return form appears only after confirmed server details with remaining quantities. Full and partial returns still use the existing protected financial RPCs and server refund calculation; after a write, the displayed list and selected details refresh.

List, lookup and detail responses are guarded against later requests, tab changes, store/account changes and logout. Failed list reads clear records and selection. Logout removes receipt lines, notes, search and detail content. No new local data fallback, financial protocol, permission or migration is introduced. Other legacy report caches remain bounded.

Validation: 187 existing Node tests and build checks; a new browser regression uses 123 receipts, an old discounted line refund, ambiguous/unique barcode lookup, status filtering, failed list reads and deliberately delayed detail replies across filter changes/logout. Existing database, concurrency and Auth/RLS CI checks remain in force. No hosted database or live transaction is changed.
