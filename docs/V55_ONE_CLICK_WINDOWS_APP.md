# ZHIROX371 V55 — One-click Windows Offline UI (PREVIEW, NO SALES)

## Fixed from previous V54
V54's desktop shortcut pointed to README-OFFLINE-TRIAL.txt and post-install launched Notepad. V55 replaces both with an actual compiled GUI executable named **ZHIROX371.exe**:
- One-click Start Menu and Desktop shortcuts target ZHIROX371.exe (not a TXT, ZIP or PowerShell script).
- Installer optionally launches ZHIROX371.exe immediately after installation.
- The real Windows GUI starts bundled Node.js in a hidden local process, verifies it serves the expected ZHIROX preview health marker and automatically opens Microsoft Edge or Google Chrome as a standalone app window (or default browser fallback).
- The app uses bundled V36 Sorani frontend and verified SHA-256 assets, requiring no internet to view.
- If the local runtime or assets are missing, the EXE shows a direct error dialog instead of silently showing a README.
- A visible Sorani/English banner states **OFFLINE PREVIEW — SALES DISABLED**.

## Important functional limit
This is a **read-only offline UI preview**. It is not a real offline cashier: no PostgreSQL service or store data are supplied, no checkout/refund/API route accepts writes, no invoice is created, and no production Cloud sync is running. The V36 preview UI may show forms, but actions that require a real local server cannot commit a transaction. The code deliberately refuses all HTTP POST, PUT, PATCH and DELETE requests and rejects even GET /api/local routes. On startup only the loopback interface 127.0.0.1:3555 is bound.

V55 is intentionally separate from the V33 HTTPS local test gateway: it DOES NOT bypass its required TLS/auth/PostgreSQL controls to simulate working sales. Windows checkout and hardware remain NO-GO.

## Windows deployment
Installer: ZHIROX371-V55-Offline-App-Setup.exe, x64, unsigned, separate from V54 installs.
Installation path: %LOCALAPPDATA%\ZHIROX371-Desktop-V55-PREVIEW.
After install, use Desktop **ZHIROX371 Offline** or Start Menu **ZHIROX371 Offline**. Closing the controller GUI stops its own local preview process; reopen the icon to start it again.

The release workflow tests:
- Node actual HTTP server in test fixture: genuine app HTML/JS/CSS returned and security banner present.
- No Internet/public access (loopback bind), no database, reject checkout API or any mutation.
- Detect bad/missing or changed manifest-listed assets.
- Compiled ZHIROX371.exe --self-test on Windows runner: startup, health probe and failed checkout POST before artifact upload.
- V53 SHA-256 package integrity, plus V54 printer trial gates.

No customer CSV, service role key, passwords, SQL backups or private keys are bundled. No production Vercel, Supabase, or PC Relay is modified.

## For an actually transactional offline Windows POS
Provision and validate a separate local PostgreSQL with audited migrations and least-privilege permissions; implement approved local Windows service and trusted TLS/certificates, then complete actual sales, stock, receipt printer, scanner, UPS, independent database restore and automatic Internet-to-Cloud reconciliation. Sign the installer and gain explicit operational GO-LIVE approval. Green V55 checks establish visual open-on-click ONLY, not commercial readiness.
