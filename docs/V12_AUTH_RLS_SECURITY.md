# V12 — Auth / RLS / Role Security QA

## Isolation
- Source: arambarzani07/zhirox371, branch feature/retail-os-pc-foundation.
- **No hosted Supabase mutations, no PC Relay and no old POS access.**
- Hosted Supabase (project qcfmlyyzfykzszvtllrw) is consulted with SELECT-only schema/permission introspection.
- Disposable local Supabase CLI starts GoTrue/Auth, PostgREST and PostgreSQL in a GitHub Actions runner. Four test-only accounts are issued real passwords, tokens and sessions.
- Node E2E refuses any service URL other than 127.0.0.1:54321 or localhost:54321 and rejects a SUPABASE_ACCESS_TOKEN environment variable.
- Local seed SQL mirrors the checked-in V8 function bodies and READ-ONLY-observed selected RLS policies/grants. Local fixtures are not production migrations.

## Twelve access and workflow assertions
1. Four GoTrue sign-ups, logins, JWTs and verified getUser.
2. Store owner is immutable across user IDs; forged store ownership is denied.
3. Two stores cannot read each other's store records.
4. Owner-only role assignment: manager/cashier/self-promotion forbidden.
5. Store memberships visible only within permitted scope.
6. Product create owner-only, catalogue reading scoped to tenant.
7. Customer data visible to managers/owners but not cashiers or another tenant.
8. Stock receiving manager/owner only.
9. Cash shift + checkout restricted to authorized cashier/store.
10. Audit events withheld from cashier and outsider.
11. Deactivated cashier loses catalogue/RPC access, anonymous users rejected.
12. Local-only TRUNCATE proof-of-risk using the observed hosted grant.

## CRITICAL: permission security blocker
Read-only inspection on 2026-10-26 confirmed PostgreSQL authenticated role has TRUNCATE privileges on retail_customers, retail_products, retail_barcodes, and retail_stores.

PostgreSQL RLS DOES NOT apply to TRUNCATE or REFERENCES. A normal browser using PostgREST does not automatically expose a TRUNCATE SQL command, but this excessive privilege is still unsafe where SQL-capable connections, functions or injection are present. It violates least privilege and must be fixed **before production release**.

Source: https://www.postgresql.org/docs/current/ddl-rowsecurity.html
Supabase grant guidance: https://supabase.com/docs/guides/database/postgres/row-level-security

### Proposed fix, for independent review only; NOT executed
SQL: REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
Also review unnecessary REFERENCES, TRIGGER, DELETE and TRUNCATE grants in public. Apply only after explicit owner authorization and a backup/verification plan.

## Status and limits
V12 Auth/RLS job: GitHub Actions pc-foundation.yml / v12-real-auth-rls. The run result is authoritative: test files alone do not establish successful completion.
**Release gate: BLOCKED** until least-privilege grant fix is approved and executed separately, E2E tests pass, and PC device/printing tests are completed.
CI-green is not production readiness. The hosted database remained unchanged during this phase.
