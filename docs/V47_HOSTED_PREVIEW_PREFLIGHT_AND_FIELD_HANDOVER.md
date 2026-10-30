# ZHIROX371 V47 — production URL smoke and owner field handover (NO-GO)

**October 30, 2026 — NOT CERTIFIED for real supermarket checkout.**
V47 adds only an **unauthenticated, read-only** source-fidelity smoke test. It does not deploy a new POS, write a sale, change the locked 12×4 Home, touch production PostgreSQL/Supabase/PC Relay, or set an owner GO-LIVE approval.

## Distinguish 3 different environments

| Layer | State and decision |
| --- | --- |
| `https://zhirox371-source-preview.vercel.app/` | Stable public HTTPS URL serving the original source Home and browser forms, NOT the 100% offline store cashier |
| Supabase `qcfmlyyzfykzszvtllrw` | Public browser Auth API; needs the correct Site URL and password recovery redirect; this is NOT the store LAN PostgreSQL |
| ZHIROX local PostgreSQL + cashier PCs | Requires physical Windows deployment, printer/scanner/LAN/WAN-off/UPS/restore verification and owner sign-off; currently NO-GO |

The bank/mixed-tender option is deliberately not part of a cash-only physical acceptance. **It stays disabled until verified merchant/acquirer settlement, refunds, reversals and audit are accepted.**

## V47 verification

Run `node --test scripts/hosted-preview-preflight-v47.test.mjs`.
Run `node scripts/hosted-preview-preflight-v47.mjs` for a real read-only HTTP smoke against the explicit stable domain. It tests `/`, `/operations.html`, `/workspace.html`, `/reset-password.html`, `/ui-fixed-pc.css`, `/card-icons.js`, `/config.js`.

The report lists route, HTTP/source status and failure reason **without echoing page content, publishable keys or financial information**. It fails when Vercel serves a React substitute or requires a redirect, a route is missing, or client configuration includes a secret key. It never sends passwords or visits checkout RPCs. A passing smoke reports `online_preview: PASS` yet **`release_status: NO_GO`**, by construction.

## Fixing the witnessed Supabase email redirect to localhost:3000

The user observed a password reset email opening `localhost:3000`. Only the Supabase owner can change hosted Auth configuration through Dashboard; this PR does **not** claim to have changed it.

Go to [Authentication URL Configuration](https://supabase.com/dashboard/project/qcfmlyyzfykzszvtllrw/auth/url-configuration).

- **Site URL**: `https://zhirox371-source-preview.vercel.app`
- **Additional Redirect URL**: `https://zhirox371-source-preview.vercel.app/reset-password.html`
- Save and verify a **fresh** reset email; old emails can retain the localhost link.
- Check the email template if it uses `{{ .SiteURL }}` rather than the requested `{{ .RedirectTo }}`. The destination must match the allowlist.
- Do not photograph, paste or upload the reset token, password, service role key or private IPs.

**No actual password reset was performed by V47.** A 200 from the recovery page does not establish that Supabase is configured to send a working URL.

## Physical acceptance: require owner-witnessed evidence (not GitHub CI)

1. Signed Windows installer/version hash, legitimate clean start and rollback on the real shop PC.
2. LAN PostgreSQL and firewall with authenticated cashiers; disconnect WAN fully while keeping LAN up. Sell a last unit from **two** separate cashiers; no double sale or negative stock.
3. Actual HID scanner without Enter and with Enter; unit/carton barcode and real prefix-27 weighted-label scan with verified grams/IQD pricing.
4. Actual printer at 58/80 mm: printed Kurdish receipt, six-column alignment, reprint permissions, paper-out/power-cut recovery; queued receipt is not proof of printed paper.
5. Real stock and unit/carton totals, cash opening/closing, reversals and role checks; no fake demo prices or customer data.
6. UPS, local shutdown/restart while internet is disconnected; committed receipts survive without double posting.
7. Encrypted backup restored on a *second* independent physical machine. Verify audit/receipt/stock balances and record measured RPO/RTO.
8. Actual account recovery with correct public redirect and an owner-authorized sign-in; resolve production RLS and Auth security advisories.
9. Reconcile all financial-integrity warnings; written owner acceptance before any real-sale GO. If any step fails, stay NO-GO.

**Repository source and one-time CI runs cannot substitute for installed and witnessed hardware.** Store the private acceptance record outside the public repository.

## Control against accidental wrong-Vercel production rollout

The stable site currently deploys a source-faithful branch that is **different from the React/Vite `main` landing page**. Do not infer that `main` and the hosted page are interchangeable. Before any future Vercel deployment, verify exact team, project, branch, commit SHA, route smoke and rollback target; never overwrite the stable source Home with the React demo.

## Supporting sources

- `docs/V46_OFFLINE_CASH_ONLY_GO_LIVE_ACCEPTANCE.md`
- `docs/V36_PHYSICAL_ACCEPTANCE_HANDOVER.md`
- https://supabase.com/docs/guides/auth/redirect-urls
