from pathlib import Path

p = Path(__file__).resolve().parents[1] / "js" / "script.js"
t = p.read_text(encoding="utf-8")

start = t.index("  const ensureUpdateCacheReminderModal = () => {")
end = t.index("  const showUpdateReminderModal = () => {", start)

new_fn = r"""  const ensureUpdateCacheReminderModal = () => {
    if ($('update-cache-reminder-modal')) return;

    const wrap = document.createElement('div');
    wrap.id = 'update-cache-reminder-modal';
    wrap.className =
      'hidden fixed inset-0 z-[210] flex items-center justify-center bg-black/40 dark:bg-black/75 p-4';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-labelledby', 'update-cache-reminder-title');
    wrap.innerHTML = `
      <div class="max-w-md w-full max-h-[90vh] overflow-y-auto rounded-3xl border border-amber-400/35 bg-white/95 dark:bg-slate-900/95 p-6 shadow-cozy backdrop-blur-md" onclick="event.stopPropagation()">
        <h3 id="update-cache-reminder-title" class="text-lg font-extrabold text-amber-950 dark:text-amber-50 mb-3 leading-snug">
          Selamat datang di Padelio
        </h3>
        <p class="text-sm text-slate-700 dark:text-slate-200 mb-3 leading-relaxed">
          Setiap kali membuka Padelio, kosongkan <strong class="text-amber-950 dark:text-amber-100/95">cache aplikasi</strong> dulu supaya Anda mendapat versi terbaru (fitur &amp; perbaikan). Data turnamen di perangkat ini <span class="text-emerald-800 dark:text-emerald-200/90 font-semibold">tetap aman</span>.
        </p>
        <ul class="text-xs text-slate-600/95 dark:text-slate-300/95 space-y-2 mb-5 list-disc list-outside pl-4 leading-relaxed">
          <li>Disarankan: tap <strong>Clear cache &amp; reload</strong> di bawah.</li>
          <li>Alternatif: hard refresh
            <kbd class="px-1.5 py-0.5 rounded-md bg-slate-200 dark:bg-slate-800 border border-slate-200/80 dark:border-white/10 font-mono text-[0.65rem]">Ctrl+Shift+R</kbd>
            /
            <kbd class="px-1.5 py-0.5 rounded-md bg-slate-200 dark:bg-slate-800 border border-slate-200/80 dark:border-white/10 font-mono text-[0.65rem]">Cmd+Shift+R</kbd>
          </li>
        </ul>
        <div class="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <button type="button" data-testid="update-tip-dismiss" onclick="hideUpdateReminderModal()"
            class="order-2 sm:order-1 w-full sm:w-auto rounded-2xl border border-slate-200/90 dark:border-white/15 bg-slate-900/8 dark:bg-white/5 px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-200/90 dark:hover:bg-white/10">
            Mengerti, lanjut
          </button>
          <button type="button" onclick="clearAppCacheFromUpdateModal()"
            class="order-1 sm:order-2 w-full sm:w-auto rounded-2xl border border-amber-500/50 dark:border-amber-400/40 bg-amber-100 dark:bg-amber-500/20 px-4 py-3 text-sm font-bold text-amber-950 dark:text-amber-50 hover:bg-amber-200/90 dark:hover:bg-amber-400/30">
            Clear cache &amp; reload
          </button>
        </div>
      </div>`;

    document.body.appendChild(wrap);
  };

"""

p.write_text(t[:start] + new_fn + t[end:], encoding="utf-8")
print("patched")
