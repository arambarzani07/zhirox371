# V34 — authenticated server-authored receipt snapshot and 58/80 mm preview

**30 October 2026 — development LAN test only. NOT a thermal printer driver, Windows installer or production-ready cashier.** This change never accesses production Supabase, PC Relay, real market data or the locked PC Home.

## Transactional integrity

- Apply `offline/migrations/011_immutable_receipts_v34.sql` **after migration 009** to a **disposable local PostgreSQL database only**.
- A trigger on the **existing** V31 prepared → committed transition captures the V26 checkout's store name, cashier, sale ID, receipt number, final amount, original timestamp and each of its server-written sale lines in one PostgreSQL transaction. If the line total does not match the actual sale, the whole checkout fails closed and rolls back.
- Append-only archive rows cannot be modified or deleted through normal SQL DML. An admin/superuser with DDL access could still bypass these protections; enforce least privilege in a later release.
- Catalog rename, retail price changes and checkout retries do not rewrite the recorded receipt. Older sales made before this migration are **not** retroactively captured and fail closed with 404 from the V34 endpoint.

## Authenticated HTTP API

V34 is **disabled by default**. The existing V33 HTTPS trial must first be deliberately enabled with its private bind IP, exact socket-peer allowlist, configured certificate, trusted local CA, session secret and isolated DB URL.

Set `ZHIROX_V34_RECEIPT_PREVIEW_ENABLED=true` on that **test server only**. The optional V34 local handler is then passed through the unchanged V33 TLS, peer, origin and rate-limit gate; V31/V32 checkout logic remains identical.

- `GET /api/local/v34/receipt?sale_id=<uuid>`: authenticated cashier's **own store and sale only**; JSON of the append-only receipt. No lines or amounts may be supplied by a caller.
- `GET /api/local/v34/print-preview?sale_id=<uuid>&width=58` (or `width=80`): HTML, right-to-left Sorani, English numerals, six columns (`ژمارە | ناوی کاڵا | یەکە | نرخ | بڕ | کۆ`), printable in a browser, with all store/product text HTML-escaped and a no-script CSP.
- Both endpoints require an `Authorization: Bearer` token. Simply opening the URL in a browser tab without the signed session header will not work. There are **no unauthenticated printing URLs or arbitrary print-payload endpoints**.
- Invalid receipt totals, unauthorized access and unsupported widths fail closed. Responses are private/no-store.

## CI and explicit limitations

`offline/tests/011_immutable_receipts_v34.sql` verifies atomic snapshot, original line items after catalog edits, V31 replay, and prohibited update/delete. Node tests verify authorization, store/cashier boundaries, HTML escaping, format selection and reject corrupted totals. The `offline-foundation` workflow runs these against a **disposable PostgreSQL service**, never a production database.

A print-ready browser HTML document is **not** proof of a receipt printed by a real 58/80 mm device. V34 does **not** yet include a Windows/CUPS printer driver, validated Sorani glyph rasterization, hardware paper-size tuning, authenticated print-spool idempotency, cut/cash-drawer hardware control or physical LAN pilot. Those remain hard acceptance blockers. Do not present these previews as a validated official cashier receipt or assume the browser printer automatically prints.

Next: add an operator-triggered local preview workflow, a genuine printer adapter with durable print-job ledger, and confirm sample prints on actual hardware over a secured isolated LAN before declaring a production release.
