# V57 — Locked PC Home + isolated local cashier (STEP 1 OF 7; NO-GO)

## Purpose
Bring back the approved PC Home (12 categories × 4 subcards, 3 rows × 4 cards) around the existing isolated PostgreSQL cashier UI. This is a deliberately isolated *test build*. It is NOT a new visual mockup nor a deploy of official cashier code.

## Implementation
- Feature-flag opt-in: VITE_V36_ISOLATED_LAN_PILOT=true AND VITE_V57_ISOLATED_DESKTOP_SHELL=true with production-mode Vite build. Unflagged production Demo and existing V36 cashier-only test builds remain unchanged.
- New OfflineDesktopShellV57 uses the unchanged MODULE_SPECS + 60 local pictograms, exact Sorani module names, white 3×4 desktop geometry, an anchored fixed-size drawer of 4 subcards, a 70px supermarket banner and 75px header.
- Only new sale and receipt-history navigation under module 01 route to the pre-existing PostgreSQL V36 cashier. They open the real local API-backed test interface, not a browser Demo. All other 46 subcards are disabled and cannot create financial data or pretend to work. This is intentional fail-closed UX until later tasks complete.
- ESC, F1 and Home navigation wired. Actual cashier authentication is still required by the existing V36 backend; this V57 UI makes no claim that a PostgreSQL production server is installed.
- Existing owner-locked index.html, ui-global.css, ui-fixed-pc.css, card-icons.js, card-icons.css, HomeScreen.tsx remain byte-for-byte untouched.
- The default V55 one-click Windows Preview is still the V36 cashier-only read-only visual preview, not yet this new shell. Integrating the safe shell into a functional commercial EXE is a separate step.
- No Supabase, production PC Relay, Vercel, old SQL Server, real cashier database, or owner data changed.

## Acceptance criteria
1. Owner-locked source SHA tests pass without changed source.
2. V57 production-mode isolated React build passes and packages with verified V36 signed/static manifest.
3. Browser test confirms exactly 12 cards in 3 rows, 4 equal-size cards per row and 4 subcards per drawer; 48 subcards visited, at most one drawer open, row overlay does not reflow layout.
4. Confirm 46 unfinished subcards fail closed, while both module-01 sale and receipt subcards open local PostgreSQL cashier (no DEMO-RCP fake sale).
5. Confirm no outside-domain requests during offline UI navigation; F1/ESC/Home work and browser emits no errors.
6. Explicit Vite official-release mode remains blocked.
7. Physical owner screenshot comparison against the locked source remains necessary for pixel-perfect approval. CI geometry alone does not prove the image is visually identical on target PC.

## Do not advance to step 2 as completed until the above tests pass
Step 2 needs a hardened, provisioned *local* PostgreSQL server and real financial transactions under full user and device authorization. After that: step 3 Cloud production sender, step 4 price/catalog/stock reconciliation, step 5 signed EXE and service, step 6 physical scanner/printer/power-loss, step 7 independent backup/restore + witnessed GO/NO-GO.

RELEASE STATUS: NO-GO. Neither V57 nor earlier V56 authorizes a real sale or production deployment.
