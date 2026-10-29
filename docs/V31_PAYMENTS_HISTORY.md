# V31 — current-shift payment history

Payments now reads 50 movements per server page with exact filtered counts, store + active cashier session scope, a fixed read cutoff and descending created_at/id order. Search explicitly chooses literal note/category text or an exact positive IQD amount (Arabic/Persian digits supported). Kind filters run on the server. Refresh resets the cutoff; subsequent pages retain it.

The three header values use the complete shift summary, never sums of the current page. A failed shift/session summary read leaves the payment controls unverified and balances blank until refresh succeeds. A failed movement read clears the list; successful shift verification remains separate. Request tokens and actor/store/session checks discard obsolete list replies after navigation, search changes and logout. Financial RPCs, durable request IDs and retry behavior are unchanged. Legacy bounded finance report caches remain independent.

Validation: pure helper tests, browser regression with 251 same-shift movements plus another store/session, denied reads and delayed logout responses; actual helper exercised through disposable local Supabase JWT/PostgREST/RLS. No production database migration is needed.
