# V13 — چارەسەری مۆڵەتە ناپارێزراوەکان

## دۆخی V13
- The only running security repair is a **local, disposable GitHub Actions Supabase stack**.
- No production migration is applied. The original live Supabase project remains untouched.
- The PC Relay/legacy POS remain under strict no-write lock.
- The owner requires the complete navigable PC 12-card/48-child design in every progress preview.

## Verified underlying issue (V12)
Read-only PostgreSQL permission introspection established an excessive TRUNCATE grant to 'authenticated' on several Retail OS tables. RLS does not restrict TRUNCATE. V12 reproduced customer-table truncation only within the disposable QA database.

Authoritative PostgreSQL RLS reference: https://www.postgresql.org/docs/current/ddl-rowsecurity.html

## Proposed minimal remediation
File **tests/v12/least_privilege_revoke.local.sql** contains the scoped SQL. It names exactly 13 public.retail_* tables and only revokes TRUNCATE from the two end-user database roles `anon` and `authenticated`.

It does **not** modify public schemas outside Retail OS, service_role/owner permissions, RLS policies, rows, triggers or functions.

V13 validation first checks the bad grant can indeed cause total data loss *in QA*. It then applies the scoped revocation *in QA*, confirms all 13 tables deny TRUNCATE, attempts TRUNCATE as authenticated and requires SQL permission-denied while preserving row counts. It finally exercises real GoTrue/PostgREST owner product creation, manager stock receiving, owner staff reactivation and cashier checkout after the repair, and ensures cross-tenant isolation survives.

## Gate before hosted deployment
1. Obtain explicit approval for a separate narrowly scoped production change. This document is not permission.
2. Confirm reliable backup/recovery and administrative DB role access.
3. Recheck actual current ACLs, role inheritance, policy definitions and 13 table IDs; do not run blind broad-schema changes.
4. Apply only reviewed explicit REVOKE statements transactionally.
5. Immediately verify `has_table_privilege('authenticated','public.retail_customers','TRUNCATE')=false` and same for every retail table, including inherited permissions.
6. Test real signed-in owner, manager and cashier accounts against least-privilege access.
7. Revalidate POS, checkout, returns/stock, shift, barcode hardware and receipts; keep release blocked on failures.
8. Preserve immutable audit logs and backups; never use TRUNCATE for rollback.

This phase changes **GitHub QA-only files**, not the hosted Supabase DB.

## Source
- tests/v12/least_privilege_revoke.local.sql
- tests/v12/auth_rls_e2e.mjs
- tests/v13_least_privilege.test.mjs
- .github/workflows/pc-foundation.yml
- docs/V12_AUTH_RLS_SECURITY.md
