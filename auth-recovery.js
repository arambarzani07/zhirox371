'use strict';
/* ZHIROX371 original PC source: existing-account self-service recovery.
 * Public browser key only. No admin auth, new users, store mutation or
 * password telemetry. Never put service_role / sb_secret_ here.
 */
(() => {
  function init() {
    const form = document.getElementById('login-form');
    const emailInput = form?.querySelector('input[type="email"]');
    if (!form || !emailInput || document.getElementById('zhirox-password-recovery')) return;

    const button = document.createElement('button');
    button.id = 'zhirox-password-recovery';
    button.type = 'button';
    button.textContent = 'وشەی نهێنیت لەبیرچووە؟';
    button.style.cssText = 'display:block;margin:14px 0 0;padding:11px 15px;border:1px solid #c4d0df;border-radius:9px;background:#f2f5fa;color:#254365;font-weight:800;cursor:pointer;';

    const message = document.createElement('p');
    message.id = 'zhirox-password-recovery-message';
    message.setAttribute('role', 'status');
    message.style.cssText = 'font-weight:700;line-height:1.8;max-width:550px;white-space:normal;color:#254365;';
    form.after(button, message);

    button.addEventListener('click', async () => {
      const email = emailInput.value.trim();
      if (!email || !emailInput.checkValidity()) {
        message.textContent = 'سەرەتا ئیمەیڵەکەت بە دروستی بنووسە.';
        emailInput.focus();
        return;
      }
      const cfg = window.RETAIL_CONFIG;
      if (!window.supabase?.createClient || !cfg?.supabaseUrl || !cfg?.publishableKey) {
        message.textContent = 'پەیوەندی Supabase بەردەست نییە؛ پەڕەکە نوێ بکەرەوە.';
        return;
      }
      // redirectTo must be allow-listed under Supabase Auth > URL Configuration.
      const redirectTo = new URL('./reset-password.html', location.href).href;
      button.disabled = true;
      message.textContent = 'داواکاری گەڕاندنەوەی وشەی نهێنی دەنێردرێت...';
      try {
        const client = window.supabase.createClient(cfg.supabaseUrl, cfg.publishableKey, {
          auth: {
            storageKey: 'zhirox-recovery-request',
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
          }
        });
        const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
        if (error) throw error;
        // Avoid leaking whether an arbitrary email exists.
        message.textContent = 'ئەگەر ئەم ئیمەیڵە هەژماری هەبێت، نامەی گەڕاندنەوە دەنێردرێت. Inbox و Spam بپشکنە.';
      } catch (error) {
        const limited = /rate.?limit|too many/i.test(String(error?.message || ''));
        message.textContent = limited ?
          'سنووری ناردنی نامە پڕ بووە؛ لە هەمان ئیمەیڵەوە دووبارە دواتر داوا بکە.' :
          'ناردنی داواکاری سەرکەوتوو نەبوو. ڕێکخستنی Auth Email و URL Configuration بپشکنە.';
      } finally {
        button.disabled = false;
      }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
