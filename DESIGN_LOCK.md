# DESIGN LOCK — PC HOME V1
Status: **LOCKED / قوفڵکراو**
Approved by project owner: **2026-10-25**
Canonical live interface: `index.html` on `feature/retail-os-pc-foundation`
Original approved UI blob SHA: `690293ae5cce42c97418962fe72ce8646d1725f2`

## یاسای دیزاینی قوفڵکراو
ئەم ڕووکاری سەرەتاییە بە بڕیاری خاوەنی پڕۆژە قوفڵکراوە. بەبێ داوای ڕوونی خاوەنی پڕۆژە هیچ گۆڕانکارییەکی دیزاینی لەسەر مەکە.

### 1) Desktop PC
- ڕووکاری **PC desktop**؛ بە پانیی لاواز نەبێتە دیزاینی مۆبایل (desktop min-width: 1020px).
- کوردی سۆرانی و RTL لە تەواوی ڕووکاری سیستەمدا.
- پاشبنەمای ڕووناک، کارتێکی سپی و ستایلی پاک، ڕێکخراو و کەم-نووسین.
- سەرپەڕە تەنها ناوی سیستەم، دوگمەی سەرەتا، سەردێڕی «بەشە سەرەکییەکان» و کارتەکان پیشان بدات.
- هیچ دەقێکی ڕێنمایی، وەسفی زیادە، ژمارەی وەشان، chart یان demo badge لە شاشەی سەرەتا مەخەرە ڕوو.

### 2) Home grid
- **12 main cards in exactly 3 rows × 4 cards**. Equal size and spacing.
- Main cards are visible by default; *subcards are hidden*.
- Click a main card to open only its subcards **immediately beneath that card's row**, not at the page bottom.
- Click again to close; only one main card's subcards are open at a time.
- Keep icons, spacing, border radius, hover, and individual module accent colors as in approved `index.html`.
- Opening a subcard navigates to its feature area; Back/Home navigation stays available.

### 3) کارتە سەرەکییەکان، بە هەمان ڕیز
| # | کارت | ژێرکارتەکان |
|---|---|---|
| 01 | کاشێر و فرۆشتن | فرۆشتنی نوێ؛ پسووڵەکان؛ پارەدان؛ گەڕاندنەوە |
| 02 | کاڵاکان | کاڵای نوێ؛ لیستی کاڵاکان؛ نرخەکان؛ بارکۆدەکان |
| 03 | کۆگا | دۆخی کۆگا؛ کاڵای کەم؛ بەسەرچوون؛ هاتووچۆ |
| 04 | کڕیاران و حسابەکان | کڕیاران؛ قەرزەکان؛ مێژووی کڕین؛ پارەدانەکان |
| 05 | کڕین و دابینکەران | داواکاری؛ دابینکەران؛ وەرگرتنی کاڵا؛ حسابەکان |
| 06 | دارایی | سندووق؛ داهات؛ خەرجی؛ جووڵەی پارە |
| 07 | ڕاپۆرت و شیکاری | فرۆشتن؛ قازانج؛ ڕاپۆرتی کۆگا؛ شیکاریی زیرەک |
| 08 | ڕێکخستنەکان | بەکارهێنەران؛ دەسەڵاتەکان؛ ئامێرەکان؛ سیستەم |
| 09 | ئافەر و داشکاندن | ئافەری نوێ؛ داشکاندن؛ کوپۆن؛ کەمپەین |
| 10 | لیبڵ و چاپکردن | لیبڵی نرخ؛ بارکۆد؛ چاپی کۆمەڵەیی؛ قاڵبی چاپ |
| 11 | شێفت و کارمەندان | شێفتەکان؛ ئامادەبوون؛ کاتی کار؛ هەڵسەنگاندن |
| 12 | چاودێری و مۆڵەتەکان | ئاگادارییەکان؛ داوای مۆڵەت؛ گۆڕانکارییەکان؛ پشکنینی مامەڵە |

### 4) Development policy
- Extend the functionality of each internal page without restyling the locked Home screen.
- No generated mock screenshots as a substitute for working code preview.
- Do not rename, reorder, add, or delete main cards/subcards, or change visual styling, spacing, fonts, desktop layout, colors, or UX behavior without explicit user instruction authorizing an unlock/design change.
- Keep database migrations, POS security, authentication, and transactional improvements independent of the locked Home design.
- No edits to old POS, PC relay, or other Supabase/GitHub projects.

### 5) Unlock
Only a **new explicit direction by the owner** to change/unlock this design supersedes the design lock. A generic “بەردەوام بە” authorizes feature development only, **not redesign**.

This lock is documented in Git, and a dedicated snapshot branch preserves the baseline. It is **not** the same as GitHub branch-protection rules.

## Approved explicit exception — 2026-10-25
By the owner's direct instruction, a **site-wide typography and supermarket-name overlay** is permitted without unlocking any other aspects of the Home design:
- Every PC HTML page displays the exact supermarket name **«سوپەرمارکێتی کانی چنار»** in a full-width, fixed top banner.
- High-contrast dark text and heavier Sorani font weights are shared through `ui-global.css`.
- Banner remains fixed during scrolling; page content is offset beneath it.
- Thermal receipt paper and diagnostic test prints must NOT include the on-screen banner.
- The original 12 main cards, 48 subcards, their ordering, icons, individual colors and Home interaction rules remain unchanged.
- This explicit exception does not authorize unrelated changes to card appearance, spacing, module structure or finance logic.

The historical `design-lock/pc-home-v1` snapshot remains the original baseline. The working branch adds only this owner-approved global presentation layer.
