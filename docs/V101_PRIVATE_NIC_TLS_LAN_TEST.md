# V101 — real private NIC TLS laboratory, **not a physical multi-PC deployment**

Status: **NO-GO for official supermarket use.** This version validates the
authenticated HTTPS gateway on a non-loopback RFC1918 interface assigned
to the GitHub Actions runner and its disposable local PostgreSQL
instance. It is **one CI host** with two independent synthetic client
instances, **not two real Windows computers** on the market LAN.

## Changes

- RFC1918 exact-interface allowlist (10/8, 172.16/12, 192.168/16),
  requiring the explicitly chosen IP to exist on the host and rejecting
  public, link-local, loopback and 0.0.0.0 as bind targets.
- The opt-in `/api/local/v101/` gateway is served with TLS 1.3 and mTLS:
  the previously tested CA trust, per-device X.509 fingerprint registry
  and immediate PostgreSQL revocation, separate device HMAC nonces,
  cashier session auth and signed atomic FEFO checkout still apply.
- Each HTTPS request also checks the TCP socket's exact local private
  interface, the trusted source IP allowlist and the exact numeric
  Host header. It ignores forwarded-IP headers, DNS claims and proxy
  metadata. Legacy V98 through V100 routes preserve strict loopback.
- A V101 disposable-only gateway factory, with an explicit
  `ZHIROX_V101_PRIVATE_NIC=YES_DISPOSABLE_PRIVATE_NIC_LAB`
  opt-in, no CLI/autostart or default LAN binding. The PostgreSQL
  backend remains on 127.0.0.1 in the disposable CI database.
- V100 mTLS client and V99 immutable checkout client gain opt-in private
  HTTPS support for the distinct v101 route, still pinned to exactly
  one permitted origin. No public/WAN fallback.

## Automated checks

The real PostgreSQL acceptance starts with 17 synthetic receipts and
17 outbox events inherited from V100. The test creates a throwaway
OpenSSL CA, server certificate with the **actual runner private IP
SAN**, and two device certificates in the temporary CI directory.

Both device clients authenticate and commit two simultaneous test sales
to a common local PostgreSQL inventory/FEFO ledger. The test then
**stops the real TLS listener**, confirms that the next checkout
attempt cannot connect and leaves the database unchanged, restarts the
listener on the exact same private IP and TCP port, and retries the
**same request UUID and unchanged basket**. The resumed sale commits,
the HTTP response is deliberately destroyed after COMMIT, and the
client automatically retries to retrieve the one original receipt.
A later replay returns the same sale. A now-revoked second device
cannot perform another sale.

It rejects missing client certs, untrusted TLS, non-RFC1918 addresses,
fake bind IPs and disallowed IP peers; private-IP/Host/source-policy
logic has separate executable unit tests. Expected final test ledger:
20 synthetic receipts, 20 outbox events, exactly three stock/LOT units
deducted, no duplicate sale from retries. Temporary database roles are
returned to NOLOGIN; the encrypted-material-free PostgreSQL archive
is kept as a CI artifact for up to 30 days.

## Unfinished before physical deployment

- Separate Windows 10 cashier computers on an actual isolated LAN,
  firewall ACLs, DHCP/static IP handling, mTLS certificate issuance
  into a protected Windows key store, and device provisioning/recovery
- True WAN disconnect tests with market network equipment, printer,
  scanner, cash drawer, UPS and site power interruption
- Restart/durability of transaction-request journals on Windows PCs,
  password rotation, durable HMAC nonce defense, operator monitoring,
  backup/restore drill and controlled upgrade/rollback
- Windows `Setup.exe`, official payment/returns receipt acceptance,
  full 12×4 module readiness, staging import of market products
- Formal release and independent security review

**No physical LAN, Windows PC, production SQL/Supabase, domain, PC
Relay/DVR or locked Sorani Home was changed.** The central local
PostgreSQL server must stay available over LAN: an internet outage is
not the same as an on-premises server failure.
