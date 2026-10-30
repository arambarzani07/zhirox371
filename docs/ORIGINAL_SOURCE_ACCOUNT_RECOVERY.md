# Existing-account password recovery — ZHIROX371 original PC source

This is **SOURCE READY ONLY**, not a claim that the live AppDeploy site was updated.
The deployed AppDeploy app currently cannot be republished due to account usage limits.
Original 12×4 locked `index.html`, cashier flows, products, stock and every live DB table remain untouched.

## Why
- Screenshot displayed `Invalid login credentials`.
- Read-only Supabase checks confirmed that the original account email exists, is confirmed and owns the one store in project `qcfmlyyzfykzszvtllrw`.
- A password is never read, reset or stored by the assistant.
- We must keep the **same existing auth user ID** because store ownership is tied to it; creating another user would not provide access.

## What was changed
- A forgotten-password action is added to the existing `workspace.html` and `operations.html` login forms, by `auth-recovery.js`.
- Client calls only `supabase.auth.resetPasswordForEmail(email,{redirectTo})`, using the *public publishable* key from existing `config.js`.
- `reset-password.html` checks email recovery session, then calls `supabase.auth.updateUser({password})` and signs out.
- No admin Auth key, password in chat, service_role, public data table writes, or create-user actions.
- Emails are sent by Supabase Auth subject to its rate limit and SMTP configuration. Mail may go to Spam.

## Required deployment and provider setup before using
1. Redeploy these **original HTML source files** to the exact existing domain; simply merging this branch does **not** update the current AppDeploy app, which was previously copied from this source.
2. In the same Supabase project, Authentication → URL Configuration → Redirect URLs, add the **exact HTTPS callback** `https://zhirox371-original-locked-pc-home-wzuuzr.v2.appdeploy.ai/reset-password.html` if AppDeploy remains the host (or the exact replacement domain). Do not use wildcard broad domains. Settings change must be done by an authorized project administrator.
3. Confirm the actual `reset-password.html` returns HTTP 200 and does **not** reveal a recovery token in logs/analytics or Referer. Check the `Reset password` email template and authorized SMTP sender.
4. On the original login page enter the **existing account email** (not another account), choose `وشەی نهێنیت لەبیرچووە؟`, and open the received email privately. The recovery link opens the password page to set at least 12 characters.
5. Sign back in using the same account email and new password. Verify the `retail_stores` RLS policies grant access only to the owner. Test in a staging domain before official POS use.

## Important security and readiness
- No recovery link, email OTP, password, session token, or service key may be pasted into chat.
- No changes to the production database were made by this patch.
- Live POS writes and official payment operations remain **NO-GO** until audited separately.
