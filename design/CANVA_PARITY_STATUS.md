# ZHIROX371 — Canva visual parity migration

## Official source and scope
- Original existing Canva folder: `FAHaXeWwwvs` (148 separate, user-owned designs).
- Stable per-screen IDs and canonical links: [canva-original-screen-map.json](./canva-original-screen-map.json).
- Source canvas: **1920 × 1080**, desktop PC, Sorani RTL.
- Current primary source screens: `001` Home, `002` Cashier, `148` final navigation.

## Implementation status (2026-11-10)
| Item | State |
|---|---|
| Original Canva screen-to-GitHub ID mapping | 148/148 committed |
| User-owned original Canva designs | Unmodified |
| Local visual reference PNGs | 001, 002, 148 (596×335 connector previews) |
| GitHub React design-reference route | `?canva-source=001..148` (explicit opt-in) |
| React components rewritten to faithfully match Canva | **Not done** |
| Pixel-perfect typography, shapes, icons and colors | **Not verified** |
| Functional POS parity for all 148 screens | **Not done** |
| Existing operational app and 12-card Home | Unchanged by this reference route |

The Canva connector returns a low-resolution image preview, **not** the original
1920×1080 exported artwork, editable shapes, or all Canva style metadata.
Attempts to load Canva in automated CI browser resulted in HTTP 403; do not
try to bypass access controls. No temporary signed Canva URLs should remain
in the repository.

Do not mistake a screenshot or iframe of the original Canva design for an
implemented React POS interface. Do not claim the project is officially
deployable or that physical printer, database, or offline behavior has been
validated by these design reference checks.

## Non-negotiable visual and interaction contract
1. Sorani Kurdish RTL throughout, with English digits 0–9.
2. All UI is PC-only; white, formal, restrained theme; `Noto Kufi Arabic`.
3. Header: store name **سوپەرمارکێتی کانی چنار** centered, `ZHIROX` top left.
4. Locked 12-card Home: first card far right; proceed right-to-left.
5. Keep up to five cashier ticket tabs and unit/carton/kilo barcode selection.
6. Routine actions stay on their originating screen. Avoid unnecessary
   navigation, modals and double-confirmation.
7. Real checkout, barcode scanning, debt settlement, print, reprint and
   idempotency must be implemented in application logic and tested separately.
8. Keep original Canva file IDs and internal navigation target mapping.
9. Do not make changes to actual supermarket database as part of a design port.

## Required to finish the *same* design in GitHub
- Obtain authorized original full-resolution image exports or editable design
  layer metadata for **all 148 screens**. The current Canva connector does not
  supply these exports; the account owner can provide them through Canva.
- Implement each screen as React/TypeScript/CSS at 1920×1080 using original
  spacing, colors, fonts, iconography and UI states.
- Verify every screen against the authentic reference at desktop resolution,
  including RTL alignment, interactive states, and navigation.
- Add unit, E2E, printer and crash/recovery tests before calling any POS feature
  production-ready.

**No-Go**: The source map and PNG thumbnails are design evidence, not
proof that the 148 original Canva pages have been transferred as functioning UI.
