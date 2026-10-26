# LIVE CODE PREVIEW POLICY — REQUIRED

Status: REQUIRED — owner-requested on 2026-10-25
Scope: All future changes to `arambarzani07/zhirox371`
Canonical working branch: `feature/retail-os-pc-foundation`
Design lock snapshot: `design-lock/pc-home-v1`

## یاسای جێگیر
لەگەڵ **هەر گۆڕانکارییەکی گەشەپێدان**، وەڵامی ChatGPT پێویستە ڕووکاری کاراکردووی PC لەناو وەڵامەکە پیشان بدات، بە شێوەی **HTML/CSS/JavaScript ڕاستەقینە و کارلێکپێکراو**، نەک وێنەی AI یان وێنەی ساکار.

## Required update delivery
1. **Inline live PC design preview:** always include a rendered, interactive, code-powered representation of the actual changed screen; preserve the 1020px+ desktop canvas and RTL Sorani. If the change is backend-only, show the **unchanged locked Home** plus the affected module's latest working preview if appropriate.
2. **GitHub attachments/links:** include links to the exact files changed, branch, and commit SHA. Identify what was added, edited, or left unchanged.
3. **Truthful labeling:** clearly distinguish a preview/mock interaction from real Supabase connectivity. Do not claim that a screenshot/mock is the exact GitHub implementation when it has not been verified against the current source.
4. **Design protection:** keep Home visually identical to the approved `design-lock/pc-home-v1` snapshot. No new banners, help text, sample data, card layout/style changes without an explicit owner's design unlock.
5. **Data safety:** state when backend or database changed. Do not connect public previews to live financial data or embed service role / secret keys.
6. **If a live preview cannot be generated:** say so plainly, link the working source, and do not claim it is attached.

## Review checklist before each delivery
- Read latest code from GitHub, do not rely on an old screenshot.
- Identify affected files and implement/verify the change.
- Compare approved Home CSS/card definitions with locked snapshot.
- Display interactive PC preview within the response.
- Link the exact modified source and relevant commit.
- State what remains demo-only or unverified.

The user has expressly asked: “ڕووکاڕی دیزاین کۆد هەمیشە پیشان بدە و هاوپێچ بکە لەگەل هەموو گۆڕابکاریەکان”.

This file is a collaboration/process rule, **not a technical GitHub branch protection rule**.

## Whole-system preview — explicit owner instruction (2026-10-26)
The owner explicitly requires: **«هەمیشە هەموو سیستەمەکە پیشان بدە»**.

For EVERY future design or functionality iteration, display **the entire PC system** in ONE interactive, rendered code preview, rather than only the module being edited.
- Always show the complete 12 main cards, 3 rows × 4 columns, and all 48 child modules reachable from those cards.
- Include the latest available interior views of cashier/sales, products, stock, customers/debt, suppliers/purchases, finance/cash shifts, reporting, settings/users, offers, labels/printing, staff and audits, distinguishing unfinished modules from live ones.
- Keep fixed supermarket header, 1020px+ desktop width even on an iPhone, high-contrast dark bold Sorani labels, stationary card grid, and module-specific SVG icons.
- Let users navigate all sections within the preview. Do not alter or swap to a mobile layout or image preview.
- Reflect changes in the full preview every time, not just a cropped or separate changed-screen widget.
- Be transparent: the interactive preview is a **representation** of the verified working source and may contain demo-only controls; it is not evidence that all routes are production functional or live Supabase-connected.
- Preserve the existing design and database locks; this instruction is a **preview delivery requirement**, not permission to change production scope.

## Zero-extra-copy PC rule — explicit owner instruction (2026-10-26)

Owner: **«لەمەو دوا هیچ نووسینێکی زیادە وەک ڕێنمایی و نیشاندان لەسەر شاشەکە دەرمەخە»**.

This applies to all actual PC screens and **every full-system in-chat interactive preview**:
- Do not add any explanatory/instructional paragraphs, demo/preview notices, walkthroughs, filler, status decorations, repeated titles, or text just to occupy space.
- Show only necessary page titles, card/subcard names, real form labels, inputs, action labels, operational data, and actionable validation/error/safety warnings.
- Never suppress real backend failures, role-denied statuses, financial verification, print-test vs sale receipt distinctions, security warnings, or keyboard-accessibility labels. Keep accessibility descriptions non-visible when suitable.
- Remove existing optional how-to hints from diagnostic screens and nonessential QA footnote without changing business logic, card layout, SQL, Auth, or the design lock.
- If a change is preview-only, do not insert disclaimers in the PC canvas. In conversational prose outside the PC preview, still clarify whether it is a demo or connected functionality.
- Future complete 12-card, 48-subcard previews must keep their functional navigation but show no instructional footer, example disclaimer, version number, QA counter decoration, or superfluous labels.

## Locked-design source fidelity — correction after owner feedback (2026-10-26)

The owner reported that a recent chat preview changed the locked appearance. **Do not hand-design an alternative desktop UI in the chat and represent it as the approved screen.**

- The authoritative working Home source is `index.html` plus `ui-global.css`, `ui-fixed-pc.css`, `card-icons.css` and `card-icons.js` on `feature/retail-os-pc-foundation`.
- The historical `design-lock/pc-home-v1` **Git branch** is an older snapshot; subsequent explicitly accepted persistent market banner, fixed PC viewport, high-contrast labels and 60 distinct SVG icons are part of the currently locked working appearance and must not be silently reverted.
- In all chat previews preserve the REAL Home structure: 4 columns × 3 rows; card dimensions, spacing, header and banner; current SVGs; 12 Home cards and 48 child cards; submenu overlays float over later card rows without displacing them. Do not invent a persistent sidebar, alternate Home card design, modified card texts, unnecessary status copy or alternative layout.
- If a user requests only barcode/scanner functionality, change only cashier scanning controls, NOT Home's locked appearance.
- `tests/owner_locked_home_sha.test.mjs` records byte-for-byte Git blob checks for the five current locked Home files; any future mutation fails CI unless the owner explicitly unlocks the design and authorizes a new baseline. A green check does not certify the visual equivalence of an in-chat generated preview; inspect its rendering against source.
- In-chat previews are illustrative representations unless they run the unmodified GitHub source; do not falsely claim pixel identity or production connectivity.
