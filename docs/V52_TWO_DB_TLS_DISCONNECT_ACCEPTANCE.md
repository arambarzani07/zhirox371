# ZHIROX371 V52 — Real disposable PostgreSQL and TLS disconnection rehearsal

**Date: 2026-10-30. Status: NO-GO for real supermarket cash sales and cloud data replication.**

## Scope

V52 upgrades earlier synthetic HTTP/SQL mocks to a single end-to-end GitHub Actions acceptance using **two real, separate PostgreSQL 16 databases** in an ephemeral runner:

- Local isolated DB: `zhirox_v52_local_test`
- Cloud-style isolated DB: `zhirox_v52_cloud_test`

Both databases are created inside CI using **test-only credentials**, not Supabase or the supermarket's legacy data. No actual Internet-reachable server is provisioned. No Vercel deployment is updated. The original locked Home design and PC Relay are unchanged.

The test has a **real TLS 1.2+ verified HTTPS connection**, with an ephemeral self-signed certificate for a synthetic lab hostname `sync.zhirox-lab.example`. A test-only network adapter maps that hostname to the loopback-only server. Thus the HTTPS handshake, certificate validation and real two-database writes are genuine, **but public Internet routing is deliberately simulated**. There is no claim that a Cloud-hosted server is running.

## Acceptance sequence

1. Apply 001 and 002 local PostgreSQL migrations, then 007 Outbox leasing, to the local **disposable** database. Apply Cloud migration 008 to the distinct Cloud **disposable** database.
2. Commit one actual PostgreSQL cash checkout for a synthetic product priced at 11,000 IQD, quantity 2, stock 10 → 8, total 22,000 IQD. The same committed transaction creates one durable Outbox event, without Internet.
3. Simulate a WAN disconnect. Sending fails, the local sale remains committed, Outbox is **not** marked delivered, Cloud still has zero rows, and retry count increments.
4. Restore connectivity in the **test adapter** and send a signed event through genuine certificate-verified TLS to the isolated receiver. Simulate loss of its acknowledgement **after** the remote PostgreSQL commit. Cloud has one receipt, but Outbox still shows pending.
5. Retry the identical event with a new Outbox lease. The receiver treats it as an idempotent duplicate and returns a matching authenticated acknowledgement. Local Outbox marks it delivered. Cloud still has **one** sale, not two.
6. Query the owner event-ID endpoint through HTTPS, then compare actual PostgreSQL counts and event IDs on both databases. Require matching receipt, amount, event ID and zero pending Outbox rows. Confirm the Cloud schema does not store product names, barcode or basket data.
7. Repeat the original cash checkout request UUID. Local PostgreSQL returns replayed=true, without reducing stock twice.

**NO-GO is unconditional.** A successful CI test is not proof of continuous operation on shop hardware, a signed Windows installer, production security, public HTTPS host, or bank settlement.

## How to verify

GitHub workflow: `.github/workflows/v52-two-db-tls-lab.yml`.
Test: `offline/tests/v52-two-real-postgres-tls.test.mjs`.

The integration command intentionally refuses to run unless `ZHIROX_V52_REAL_DB_CI_ENABLED=true` and two different PostgreSQL URLs both point at loopback and databases named for the v52 disposable trial. Never point these test credentials or migration scripts at an existing market or Supabase database.

## What is still required before an Internet-hosted production Cloud receiver

- Owner-approved isolated hosting account and domain, TLS cert chain, DNS restrictions/egress firewall and tenant isolation.
- Separate production Cloud PostgreSQL roles, schema migration plan, encrypted backups and restore-on-another-host acceptance; no use of this temporary test schema as a live database.
- Production secret lifecycle with per-store device enrollment, rotation, replay defense, rate limiting and event privacy controls.
- External HTTPS end-to-end field test from shop PCs, validated reconciliation of all historical queued event IDs, operational failure alerts and safe rollback.
- Windows service signing, no-password-on-commandline configuration, secure startup, automatic update and local database durability.
- Physical LAN offline cashier, scanner, thermal printer, scale, UPS and two-register negative-stock acceptance.
- Full catalog, stock and price direction/conflict resolution; V52 tests **outbound sales events only**. The V51 catalog system is a dry-run validator, not an operational sync engine.

**Stacked GitHub branches V48–V52 are not automatically merged to main.** Merging requires separate verification of locked Home integrity and protected production deployment mapping.
