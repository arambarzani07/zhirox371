# ZHIROX371 V99 — independent trial cashier devices, offline local gateway foundation

**Real-world LAN deployment: NOT DONE. Official cashier: NO-GO.**
This CI-only version exercises two independent *simulated* cash-register
PC clients through localhost HTTP and genuine isolated PostgreSQL
transactions. It is not a connection between two actual Windows PCs
across market LAN, and it cannot prove physical internet interruption.

## Verified design

The existing signed checkout and read-only/financial PostgreSQL
separation from V94–V98 are retained. V99 adds:
- `trial-pc-01` and `trial-pc-02` with independently generated
  256-bit HMAC request secrets, never sent in HTTP responses.
- A request-level 128-bit random nonce, 30-second timestamp window,
  MAC over exact device ID, method, path and JSON content, checked with
  a constant-time comparison. In-memory bounded nonce rejection protects
  the running service from signed device-request replays.
- The same local username/password and signed cashier token protocol
  as V98, with device MAC as an **additional** prerequisite to both
  login and checkout; a token or forged HMAC alone is insufficient.
- A client that keeps the original `request_id` and immutable cart.
  On a dropped HTTP connection or transient 503, it retries the
  exact request with a fresh device MAC nonce, and never generates an
  alternative sale UUID. A changed basket under the same UUID is
  explicitly rejected by the client as well as by V90.
- A strict localhost `127.0.0.1:3316` test gateway,
  `ZHIROX_V99_DUAL_DEVICE=YES_ISOLATED_V99_LOCAL_LAB` opt-in, 
  exact disposable DB and restricted PostgreSQL role checks.
  It does NOT listen on 0.0.0.0 or private LAN interfaces.

## Real CI exercise

The genuine PostgreSQL integration runs after V98, starting with 11
synthetic sale receipts. It creates two separate device HMAC keys and
two independent local clients with different user sessions and device
IDs. A transport wrapper refuses any non-loopback URL, modelling WAN
unavailability without needing external web requests.

Two simultaneous checkout requests create distinct receipts, consume
the same shared PostgreSQL inventory safely, and record one outbox
event per sale. A third test sale **COMMITs**, then its HTTP connection
is deliberately destroyed before the success response is delivered;
the matching device client transparently retries the original cart
and UUID, receiving the original sale as an idempotent replay.
Unidentified devices, a wrong-key device claim, changed body and
reused HMAC nonce are rejected. Final expectation is 14 synthetic
receipts and 14 outbox events with exactly 3 water units deducted
and 3 corresponding FEFO LOT units consumed, no extra deduction
from retry. All test SQL role credentials return to NOLOGIN, and
an isolated restorable PostgreSQL dump is retained 30 days.

## Remaining security and deployment work

Neither the device HMAC nonce cache nor the device enrollment is
durable in PostgreSQL. Sessions are not cryptographically bound to
individual device IDs; device compromise could permit token transfer.
There are only two synthetic device entries. Plain HTTP is allowed
**only on localhost** and must never be exposed directly on LAN.

**Real LAN requires** mutual TLS or equivalent strong device
authentication, secure and revocable device provisioning, protected
server key storage, firewall/private-network listener, durable nonce
tracking, network-outage and power-failure tests on actual Windows
hardware, payment/printer verification, restore testing, and formal
release approval. The WAN-blocked CI transport does not prove a
physical internet outage. A working central local PostgreSQL and
an isolated HTTP gateway would be the eventual online-independent
sale path; internet/cloud synchronisation remains optional.

No real store, production SQL Server/Supabase, DVR/PC Relay, deployed
Windows station, locked 12×4 Sorani Home, market backups or real cash
was modified or deleted. The test market stays retained.
