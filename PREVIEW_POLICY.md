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
