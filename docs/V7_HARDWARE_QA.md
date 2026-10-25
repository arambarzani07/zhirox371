# V7 — PC Hardware Readiness Diagnostics

Repository: `arambarzani07/zhirox371`
Branch: `feature/retail-os-pc-foundation`
Approved design reference: `design-lock/pc-home-v1`

## Delivered
- `diagnostics.html`, `diagnostics.js`, `diagnostics-core.mjs`: standalone **Kurdish Sorani RTL** desktop hardware-check screen.
- Scanner read-only keyboard-wedge test: input + Enter. Detects EAN-13, validates 13th check digit, and recognizes the 13-digit **27-prefix** supermarket-scale barcode convention.
- The seven item-code digits immediately following the prefix are displayed; the remaining digits are **not** decoded into quantity, price, weight, or scale units until the user's precise scale format is verified.
- Keyboard capture shows the most recent key pressed, including F3/F5/F7/F9/F12 when the browser passes them through; it does not hijack browser/system shortcuts.
- Prints an explicitly labeled **TEST ONLY — NOT A SALE RECEIPT** diagnostic strip for 58mm or 80mm roll widths through the browser's Print dialog. There is no receipt number, amount, buyer or sale data.
- Only the paper-width preference is saved locally on the user's browser; barcode values and keyboard input are not persisted.
- The browser's `navigator.onLine` flag is informational and does not assert actual Supabase service availability.
- Device and printing subcards on Home route to `diagnostics.html` (navigation-only change).

## Safety and limitations
- Browser code cannot reliably detect the installed Windows printer name or confirm paper was physically printed. Windows printer selection, paper format, auto-cut and cash-drawer pulse require drivers or a separate native agent.
- A scanner that emulates a keyboard is indistinguishable from manual typing solely from receiving barcode text. A successful input confirms the code reached the input field, not hardware identity.
- EAN checksum validity is a check of the value, not proof that the item exists in the supermarket database.
- For the 27-prefix scale barcode, no assumption is made about units, numeric price encoding, barcode check digit conventions beyond EAN-13, or price source. Product import remains separate.
- No connections to SQL, real sales, prior PC Relay, old POS, printer spooler, or production financial data.
- The sample printed diagnostic strip is deliberately **not** a mock sale or a cashier receipt.
- Works in a modern PC browser; ES modules require HTTPS/static-server hosting rather than relying on `file://`.
- Locked Home CSS and 12 card definitions are preserved exactly; do not change without explicit permission.

## CI
- `tests/v7_diagnostics.test.mjs` adds live Node unit tests for EAN-13 and scale detection, plus static isolation/print-label tests.
- `.github/workflows/pc-foundation.yml` already runs `node --test tests/*.test.mjs` and locked-Home comparisons against `design-lock/pc-home-v1`.
- GitHub Actions run 40216110209 completed successfully (39/39 tests at that commit).
- Supabase read-only checks: 13 RLS-enabled retail tables, 0 Supabase security-advisor findings; no Auth users or financial records in selected project.
- This is not concurrent authenticated cashier QA and does not certify real thermal printer hardware.

## Next production gates
1. Add a controlled Auth/test-store fixture in a separate QA project or an explicitly authorized transactionally rolled-back test session.
2. Two authenticated sessions: concurrently post final stock unit, retry identical/different requests, race checkout with shift close, and retry cash movement.
3. Real Windows thermal printer 58/80mm: Kurdish font readability, paper width, driver cut mode, Print dialog, scanner keyboard language, cash drawer if hardware permits.
4. POS integration tests of receipt, return, reconciliation and permission-denied cases.
5. Release gate before real cash operations. **NOT PRODUCTION READY**.

Developer must attach a live code-based PC preview and changed-file links in every update: `PREVIEW_POLICY.md`.
