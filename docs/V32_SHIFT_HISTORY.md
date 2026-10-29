# V32 — verified shift state and complete own-cashier history

Active shift lookup is a separate store/cashier/status=open server query. It does not depend on the latest 30 historical sessions. Duplicate active results, incomplete summaries, mismatched summary session IDs, closed summaries and unsafe money values fail closed. Until a read succeeds, opening and active financial forms are hidden, current balances are blank and checkout has no verified session. Durable request storage and existing write/retry RPCs are unchanged. The retry control remains accessible outside the active-session forms.

Own-cashier history uses 50-row exact-count server pages, open/closed filters, Baghdad-day / rolling date filters and descending opened_at/id order with a fixed upper cutoff. History errors clear rows separately from verified active-session balances. Tokens discard delayed list and active-summary replies after logout; list navigation guards prevent replies from reopening departed panels. Refresh resets history and time cutoff; page navigation does not refresh or sum balances.

Legacy finance/staff report snapshots retain their independent latest-30-session cache and remain bounded. This change does not certify them as complete reports or implement other cashiers' history browsing.

Validation includes helper tests, 123-row browser history with the active shift outside the latest 30 rows, tenant/cashier exclusion, summary denial and recovery, delayed logout responses, and actual helper calls through the disposable local Supabase JWT/PostgREST/RLS stack. No schema migration or hosted database write is required.

The local SQL fixture now includes the unchanged V5 internal/public shift-summary functions, which were previously omitted from the disposable baseline. A database regression verifies complete totals, session identity and denied access to another cashier's session. This does not add a new production endpoint.
