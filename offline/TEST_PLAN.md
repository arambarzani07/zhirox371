# Offline transaction foundation validation (isolated environment)
Do not promote this migration to production until the following gates are automated and green.

1. Apply 001_core.sql to an empty isolated PostgreSQL database; repeat migration and verify idempotence.
2. Insert products and barcodes for two stores; verify composite foreign keys prevent cross-store references.
3. Run 20 concurrent transactions selling the last unit; only one can succeed after row-lock + conditional decrement in the checkout procedure (not yet implemented).
4. On idempotency replay, request_id must return prior receipt; different payload for same key must be rejected (not yet implemented).
5. Force rollback before COMMIT; confirm sales, sale_lines, ledger, outbox and stock remain unchanged.
6. Make WAN/DNS unavailable and reload all UI from local origin. Local API authentication and printing must work (not yet implemented).
7. Outbox delivery must allow at-least-once transport with deduplicated destination side effects.
8. Verify independent backup restore and receipts/stock reconciliation.

SECURITY: this is a skeletal schema, not complete authorization, ledger, payment, refund, shift or accounting functionality. Never grant direct table writes to cashier clients.
