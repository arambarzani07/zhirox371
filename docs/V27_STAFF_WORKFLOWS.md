# V27 — five server-backed management workflows

Replaces the five production placeholders with one shared Kurdish RTL workspace at `staff-workflows.html`: Attendance, Workhours, Evaluation, Alerts and Approvals. All existing Home destinations and interior subsection links now route to it. Old placeholder URLs redirect to the implemented pages. The old browser-local prototypes are not used as production data or silently imported.

## Data and authority

`retail_workflow_records` stores individual records by store/topic with immutable creator, server timestamps, updater, status and optimistic version. Authenticated SELECT is restricted by active owner/manager membership. Anonymous access, direct writes and TRUNCATE are revoked. A protected RPC validates and canonicalizes every payload, requires the expected version, journals actor/payload/request IDs for durable replay, preserves private version snapshots, and appends a minimal audit event atomically. Failure of the audit insert rolls back the record, history and request journal.

Staff entries can be edited while active, archived and restored. Alerts can be resolved. Requests start pending and permit exactly one approve/reject transition. Decisions do not grant roles, authorize another transaction, change credit limits, post payroll or move cash. Requester/staff names are manual management entries, not biometric identity or authenticated self-service claims.

Hours, rates, overtime rates and adjustments must be explicitly entered. Hours per record cannot exceed 24. The server computes a rounded whole-IQD estimate from those supplied values; there is no assumed overtime multiplier. It remains an estimate, not paid wages. Review scores are explicitly chosen 1–5 and the server computes their average; no default perfect score or automated employment decision exists. Attendance date and optional times are validated without inventing missing times.

Alert signals count all active out-of-stock products and active customers exceeding a positive credit limit on the server. Manual alerts are stored separately from these derived counts. No external notifications are sent.

## Client behavior

All reads come from the authenticated server. Errors hide unconfirmed lists and never substitute local records. Forms retain input after failed writes and show success only after a matching returned row/version. Create draft IDs persist in session storage by actor/store/topic; only UUIDs are stored, not names, notes or scores. Identical in-page retries reuse their request ID. Responses from a previous store/session are discarded, and logout clears displayed staff data.

Lists have 50-record pages, server totals, status filtering, and server search over the complete matching store/topic dataset. Archive/restore and terminal decisions use current versions. Concurrent stale changes fail with a refresh instruction rather than silently overwriting another manager. Per-record creator/updater, timestamps and version are visible in the UI. Complete private snapshots are retained in `retail_internal.workflow_history`; public audit events contain actor/action/status/version identifiers, not employee review content.

## Validation and deployment boundary

- 183 Node tests, including retry acknowledgment, malformed/cross-store responses and draft identity isolation.
- 46 PGlite SQL tests, including all topics, semantic validation, permissions, role revocation, rollback, archive/restore, terminal decisions, pagination and complete search/counts.
- Real PostgreSQL concurrency tests cover racing decisions and concurrent identical retries.
- Browser CI covers all 48 Home destinations, all five new forms, explicit rates/scores, failed-save behavior, stale versions, archive/restore, store isolation and logout.
- Real local Supabase Auth/PostgREST smoke checks exercise actual workflow writes, replay, reads and denied direct writes. Local security advisors run against that disposable CI database.

The migration was created with the pinned Supabase CLI at `supabase/migrations/20261028203750_staff_workflows.sql` and embedded exactly in `db/v19_complete_production_upgrade.sql`. No hosted migration or live employee/financial record has been changed. Production requires this reviewed migration before the five RPC-backed screens can work. A missing endpoint produces an explicit upgrade message.

The self-contained preview includes isolated QA adapters; its sample records are not hosted data and do not demonstrate physical attendance, payroll payment or a real financial approval. Only the offline preview holds sample workflow rows in its parent page so navigating between its cards preserves demo records.
