# ZHIROX371 — Windows offline test bundle (V48)
This ZIP is for an ISOLATED TEST PC, not an approved cashier installation.
It contains a portable Node.js runtime, the V36 local cash-only trial frontend, local API code,
dependencies and a read-only signed-asset manifest. It does NOT contain store data or credentials.

IMPORTANT:
- PostgreSQL is NOT included. A trained installer must provision an isolated test PostgreSQL
  on the private LAN, apply tested migrations and create TEST-ONLY store/users/stock.
- A trusted local CA, certificate/key, enrolled client IPs and LAN firewall are required.
- The Sorani V36 screen is a separate TEST-ONLY cash interface, not the 12x4 locked production Home.
- Queueing a receipt does NOT print paper. No Windows printing service is packaged.
- Do not import real market data or accept any money through this package.

Unzip on a TEST PC to a fixed directory such as C:\ZHIROX371-Test.
Set these variables for the current PowerShell process through your organization's secure setup:
  ZHIROX_V33_BIND_IP
  ZHIROX_V33_ALLOWED_PEERS
  ZHIROX_V33_ALLOWED_ORIGIN
  ZHIROX_V33_TLS_CERT_PATH
  ZHIROX_V33_TLS_KEY_PATH
  ZHIROX_V33_DISPOSABLE_DB_URL
  ZHIROX_LOCAL_SESSION_SECRET (32+ high-entropy bytes)
DO NOT paste a password or private key into public chat or GitHub.
Use a database whose name contains test, trial or disposable and only private IPs.
Run from a regular PowerShell session: .\windows\Start-ZHIROX-Trial.ps1
The launcher refuses to run unless all mandatory prerequisites are provided.
The access URL is https://<ZHIROX_V33_BIND_IP>:3433 after the trusted CA is installed.

OFFLINE means that after the local DB, trust, dependencies and app are provisioned,
this isolated trial does not require WAN. It does NOT mean the current ZIP is
an officially certified working POS.
See docs/V36_PREINSTALLATION_SOFTWARE.md and docs/V46_OFFLINE_CASH_ONLY_GO_LIVE_ACCEPTANCE.md.
