# V28 — server-paginated receipt history

The Receipts destination now reads 50 posted receipts per server page with an exact RLS-scoped matching count. Exact receipt-number lookup (including leading zeros and Kurdish/Arabic digits), refund status and date filters apply on the server across the complete accessible store dataset. Receipt identifiers remain bigint decimal strings without JavaScript number rounding. Today starts at Baghdad midnight; 7/30-day filters use rolling windows.

Rows order by created_at then id descending. A refresh captures an upper timestamp reused across its pages, excluding later sales until refresh. This is not a repeatable-read snapshot: concurrent refunds, corrections or deletions may change matches. Empty out-of-range pages clamp to the last available page. Totals above the list are explicitly this page's totals, not store financial statements.

No migration, mutation or new permission is introduced. Existing authenticated SELECT/RLS controls remain authoritative; missing schema, denied reads, missing counts and wrong-store rows show errors without local fallback. Request epochs reject obsolete list/detail results. Logout clears displayed receipts. Legacy bounded caches used by other return/report screens are independent and are not represented as completed pagination by this change.

Validation: 187 Node tests, build checks; browser CI adds 123-receipt pagination, lookup beyond the old newest-100 cap, status filtering, page metrics, denied-read clearing and logout. Four new unit tests cover bigint/input boundaries, Baghdad dates, query scope and fail-closed responses. No hosted data has been changed.
