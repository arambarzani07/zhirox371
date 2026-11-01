# Alternative web-only domain deployment — GitHub Pages

**Purpose:** Get the **exact main-branch static React/Vite preview**
onto hosting outside Vercel's Hobby deployment quota, then optionally
move `zhirox.com` **only after successful preview testing**.

**Safety:** NO-GO fiscal POS. This publicly hosted frontend does not host
the on-premises PostgreSQL database, private TLS checkout server,
Windows cashier installer, user secrets, or real market inventory.
The browser demo must remain distinctly marked as NOT real sales.
The Sorani RTL desktop UI and owner-approved 12×4 cards are not changed
by this workflow.

## One-time GitHub preparation

1. Open the GitHub repository `arambarzani07/zhirox371`, then
   **Settings > Pages > Build and deployment > Source: GitHub Actions**.
   This repository admin setting cannot be changed by the ordinary
   restricted GitHub connector.
2. In **Actions**, select
   **Alternate static preview — GitHub Pages (NO-GO POS)**, then
   **Run workflow** on `main`. After Actions succeeds, the temporary
   URL is `https://arambarzani07.github.io/zhirox371/`.
   The workflow also runs automatically for later source changes to
   `main`; the deployed HTML/JS/CSS is always compiled from the
   checked-out commit. It does not use any Vercel API or quota.
3. Verify the actual deployed locked 12×4 PC Home, all subcards and
   clearly labelled DEMO cashier UI. For this Vite project the build
   uses `--base=./` so relative static assets work on the Pages
   project URL and at a future domain root.
4. Do **not** change DNS while the Pages site is unverified.

## Optional zhirox.com apex cutover, **only after Pages works**

1. In **GitHub > Settings > Pages**, add the custom domain
   **`zhirox.com`**; complete any domain-ownership verification that
   GitHub requires.
2. In the DNSimple **zhirox.com > DNS > Record editor**, update only
   the **apex website record**: remove/replace the Vercel apex A
   record (`216.198.79.1`, observed 2026-11-01) with an
   **ALIAS**, Name empty / `@`, Content
   `arambarzani07.github.io`. Alternatively use GitHub's published
   A/AAAA records if ALIAS is not available. Do **not** replace
   the domain's nameservers or mail-related MX/TXT/DKIM/DMARC records.
   DNSimple's official GitHub Pages one-click service can instead
   establish the apex ALIAS if used correctly.
3. Verify `https://zhirox.com` serves the expected GitHub Pages
   release, and use **Enforce HTTPS** in GitHub Pages settings once
   the certificate becomes available.
4. Rollback if the Pages check fails: restore the *previous*
   Vercel apex A value and remove the new Pages ALIAS as appropriate,
   preserving unrelated DNS records. The already-linked Vercel
   production site stays available until DNS cutover.

**Limits:** GitHub Pages is a static web host, NOT a secure offline
cashier backend or real PostgreSQL server. Avoid logging in or
entering real customer or cash transaction data in the public demo.

Official technical references:
- https://vite.dev/guide/static-deploy
- https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
- https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site
- https://support.dnsimple.com/articles/github-pages/
