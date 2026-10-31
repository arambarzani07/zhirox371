# ZHIROX371 — Open Design Workspace

**Status: UNLOCKED** (owner instruction, 2026-10-31).

The previous PC Home visual design is not an approved or immutable layout anymore.
There is **no design freeze** on cards, subcards, icon sets, stylesheets, font,
spacing, color palette, desktop/mobile breakpoints, page navigation or visual hierarchy.
Any previous 3×4 grid, 12-card/48-subcard counts, screenshots, SHA baselines
and archived approvals are historical references only, never design acceptance gates.

## Fresh redesign
- Redesign all interface areas from the beginning, starting with the cashier workflow,
  and then the navigation/Home and each individual area.
- Kurdish Sorani RTL and a clean, low-text PC cash register layout are the user's
  current working preferences, **not** a locked visual template.
- All UI components and CSS are editable. Do not reintroduce pixel-perfect,
  byte-for-byte, Git blob, source-SHA, card-count or old screenshot design gates.
- Existing UI can continue functioning temporarily during redesign; its presence
  does not make it an approved look or restrict future changes.
- Existing modules and routes may be reorganized, but do not silently remove business
  capabilities or turn nonfunctional routes into fake financial operations.

## Safety boundary (NOT a design lock)
Maintain existing safeguards for authentication, permissions, PostgreSQL integrity,
stock and pricing validation, idempotent checkout, receipt authenticity, offline/online
separation and explicit commercial GO/NO-GO checks.
Do not access or change production databases, the old POS, relay or customer data as
part of interface redesign.

Original designs remain retrievable from historical Git commits or archived previews.
They are **not active locks** and may be replaced.
