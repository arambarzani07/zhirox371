# ZHIROX371 — Canva visual parity migration

## Official source and scope
- Original existing Canva folder: `FAHaXeWwwvs` (148 separate, user-owned designs).
- Stable per-screen IDs and canonical links: [canva-original-screen-map.json](./canva-original-screen-map.json).
- Source canvas: **1920 × 1080**, desktop PC, Sorani RTL.
- Current primary source screens: `001` Home, `002` Cashier, `148` final navigation.

## Implementation status (2026-11-11)
| Item | State |
|---|---|
| Original Canva screen-to-GitHub ID mapping | 148/148 committed |
| Original Canva source screens | 148 distinct single-page designs in existing folder; unmodified |
| Native 1920×1080 text-container geometry captured | 022 (34), 023 (30), 024 (40) |
| GitHub React design-reference route | `?canva-source=001..148` (explicit opt-in) |
| React UI alignment work | 001, 002, 021, 022, 023 **partial only** |
| In-screen product editor 023 | Source-measured column proportions, item search and permissions panel; live editor remains the existing DEMO implementation |
| Original screen 024 | Text geometry recorded; **React layout and workflow parity not yet implemented** |
| Pixel-perfect typography, shapes, icons, colors, responsive states | **Not verified** |
| Real role-based permission approval for price edits | **Not verified in preview**; approval request is disabled rather than presented as real |
| Functional POS parity for all 148 screens | **Not done — NO-GO** |
| Production deploy, real printer/offline cash testing | **Not verified by source geometry or preview CI** |

Geometry files are grounded in the original Canva editable text container positions, not guesswork:
- [022 original text bounds](./canva-original-screen-022-geometry.json)
- [023 original text bounds](./canva-original-screen-023-geometry.json)
- [024 original text bounds](./canva-original-screen-024-geometry.json)

These do **not** include full editable vector/shape styling, fonts/weights, backgrounds, icon geometry or all visual states. Until a rendered 1920×1080 screen is compared to the authentic original using exported artwork/layer styles and functional tests, label each screen **partial**, not "pixel-perfect." Preserve the same project and never replace existing Canva originals.

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
