# V40 — Customer lookup inside transaction forms

Checkout, manual debt, receipt linking and customer payment forms now expose a collapsed server customer picker. Search by name or phone, or page through all active customers in groups of 50. Search and paging never change the selected customer. An explicit Choose action re-reads the exact active customer under the current store before pinning it into the bounded mutation cache and changing only the requested form's selection.

The controller snapshots actor/store, identity epoch, customer-read revision, selected customer and DB client. Tokens reject obsolete search and selection replies; logout clears query text, results and selection notices. Denied, unavailable or archived lookups retain the existing visible selection and show an error without substituting another customer. Account refresh invalidates open results. Empty final pages recover after shrinking counts.

The relevant target selector and submit actions are disabled during the exact lookup. Submit handlers also guard the pending selection, including keyboard/programmatic checkout and debt checkout. Existing pending-checkout retry visibility remains tied only to a real pending checkout. Pending checkout prevents picker use. No new financial writes, SQL/RPC changes, schema, RLS or grants are introduced.

The payment form fills the freshly selected customer's positive balance; zero/prepaid accounts clear the amount. Manually changing the payment selector also replaces the old customer's amount. Other forms' selected customers remain unchanged.

Validation: 249 Node tests and the syntax/assets build passed. Tests cover 623 searchable profiles, paging, exact fresh balance selection, race guards, failed selection, reset, shrinking pages and preserving other forms' selections. Manual browser checks verified all four pickers with beyond-500 customers and phone/Enter search. V40 browser CI checks additionally cover disabled/programmatic financial submission, all pages and logout during exact lookup; they are authored and syntax-checked, pending remote CI execution.

Limits: searches require the configured database connection. This does not implement offline LAN transport. Offset pages are live reads, not a repeatable snapshot. Form dropdowns retain the bounded snapshot plus explicitly selected profiles; the picker provides access beyond that snapshot. Existing V38/V39 actual PostgREST CI covers the reused search and exact-lookup queries. Home and production data are unchanged.
