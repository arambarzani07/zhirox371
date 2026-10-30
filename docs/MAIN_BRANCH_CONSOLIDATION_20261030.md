# ZHIROX371 main consolidation — 2026-10-30

## Live default branch
- Before this archival PR, main was `58a20dea0bc15ec8f088c11289157d6750c6cc59` (V30 PR #26).
- The active V23–V30 React, isolated local PostgreSQL pilot, outbox sync and owner preview changes have all been merged into main. Older foundational feature branches such as V20, offline V1–V5 and receipt-grid fixes are also ancestors of main.
- **Production readiness is NOT implied**: the primary React checkout is still a browser-only DEMO. Local PostgreSQL and owner cloud work remain explicitly opt-in, loopback-limited tests, with no production cloud deployment or multi-PC store acceptance.

## Newly preserved historical artifact
- `design/source-faithful-home-preview.html` is an exact standalone historical source-faithful bundle from `feature/source-faithful-home-preview` (Git blob `de57472e89371d1b446a1eaddaf2c454f2654ace`).
- This preview is for **reference only**. It is not used by the current React router, has no live database connection, and must not be interpreted as a real checkout. It does not edit `index.html`, `src/components/HomeScreen.tsx`, locked legacy Home, shared styles, any DB or PC Relay.

## Older open Draft PRs — deliberately NOT blindly merged

| PR | Historical branch | Current status and risk |
|---|---|---|
| [#2](https://github.com/arambarzani07/zhirox371/pull/2) | `feature/scale-plu-registration-fix` | 15 commits ahead / 216 behind main at audit; operates on retired `workspace.js`, `product-catalog.js` and old browser fixtures. Historically passed pre-React CI; not a test of current React. |
| [#3](https://github.com/arambarzani07/zhirox371/pull/3) | `feature/scale-plu-registration-v19` | 16 ahead / 216 behind; overlapping scale PLU changes for retired POS; historically passed old CI. Requires feature-port analysis, not unconditional merge. |
| [#4](https://github.com/arambarzani07/zhirox371/pull/4) | `fix/scale-only-product-registration` | 17 ahead / 216 behind; overlapping old scale-only product registration. Requires reconciliation with V26 PostgreSQL PLU/gram models and React, not an automatic merge. |
| [#12](https://github.com/arambarzani07/zhirox371/pull/12) | `fix/transaction-security-consistency` | 33 ahead / 135 behind; 94 changed files, including obsolete `operations.js`, SQL migration and workflows. GitHub reports a merge conflict; may undermine the newer React/offline trust boundary if force merged. Must be reviewed module by module. |

Other unmerged/diverged historical refs at audit included `fix/scale-plu-registration-v19`, `feature/retail-os-pc-foundation`, and `feature/v28-receipt-history-00e4775` (shares the #12 tip). Old independent prototypes are **not a justification to reintroduce obsolete operational code**.

## Safe integration rule

No open legacy draft has been marked merged or closed as part of this archival PR. No production code from those old branches has been silently copied into live React. To finish their outstanding work, first map each intended feature to the modern React/isolated PostgreSQL system, port with atomic server contracts and Sorani RTL where relevant, test it against the **current** CI and lock hashes, and merge in independent verified PRs. Preserve the historical PRs until that comparison is completed.

This consolidation is a truthful inventory and safe archive, **not** a claim that all unfinished historical branch code now runs in production.
