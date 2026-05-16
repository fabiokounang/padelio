"""Add theme + dual classes to standalone .html pages (not index)."""
import importlib.util
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

STATIC_PAGES = [
    "about.html",
    "guides.html",
    "contact.html",
    "terms.html",
    "privacy-policy.html",
    "guide-americano-format.html",
    "guide-common-mistakes.html",
    "guide-mexicano-and-modes.html",
    "guide-mix-americano.html",
    "guide-organizer-checklist.html",
    "guide-scoring-and-leaderboard.html",
]

THEME_BTN = """
  <button type="button" onclick="padelioToggleTheme()" class="fixed bottom-6 right-6 z-[300] flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200/90 dark:border-white/15 bg-white/95 dark:bg-slate-800/95 text-amber-500 dark:text-amber-200 shadow-cozy-sm backdrop-blur-md" title="Toggle light / dark theme" aria-label="Toggle light and dark theme">
    <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  </button>
"""


def fix_doubles(s: str) -> str:
    repl = [
        ("dark:bg-slate-50 dark:bg-slate-950/95", "dark:bg-slate-950/95"),
        ("dark:bg-slate-100 dark:bg-slate-900/60", "dark:bg-slate-900/60"),
        ("dark:bg-slate-200 dark:bg-slate-800/95", "dark:bg-slate-800/95"),
        ("dark:bg-slate-100 dark:bg-slate-900/40", "dark:bg-slate-900/40"),
        ("dark:bg-slate-100 dark:bg-slate-900/70", "dark:bg-slate-900/70"),
        ("dark:bg-slate-50 dark:bg-slate-950/50", "dark:bg-slate-950/50"),
        ("dark:bg-slate-50 dark:bg-slate-950/90", "dark:bg-slate-950/90"),
        ("dark:bg-slate-100 dark:bg-slate-900/95", "dark:bg-slate-900/95"),
        ("text-slate-700/95 dark:text-slate-700 dark:text-slate-200/95", "text-slate-700/95 dark:text-slate-200/95"),
    ]
    for a, b in repl:
        s = s.replace(a, b)
    return s


def migrate_content(s: str, subs) -> str:
    for old, new in subs:
        s = s.replace(old, new)
    s = fix_doubles(s)
    s = s.replace(
        "selection:bg-pink-400/25 selection:text-white",
        "selection:bg-pink-400/20 selection:text-slate-900 dark:selection:text-white",
    )
    s = s.replace(
        "bg-slate-50 dark:bg-slate-950 text-white ",
        "bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white ",
    )
    return s


def patch_head(s: str) -> str:
    s = re.sub(
        r'<html lang="en" class="h-full">',
        '<html lang="en" class="h-full dark">',
        s,
        count=1,
    )
    if "tailwind-padelio-config" in s:
        return s
    s = s.replace(
        '<script src="https://cdn.tailwindcss.com/3.4.17"></script>',
        '<script src="https://cdn.tailwindcss.com/3.4.17"></script>\n  <script src="js/tailwind-padelio-config.js"></script>',
        1,
    )
    s = s.replace(
        '<link rel="stylesheet" href="styles.css">',
        '<link rel="stylesheet" href="styles.css">\n  <script src="js/theme.js"></script>',
        1,
    )
    return s


def patch_body_btn(s: str) -> str:
    if "fixed bottom-6 right-6" in s and "padelioToggleTheme" in s:
        return s
    return s.replace("</body>", THEME_BTN + "\n</body>", 1)


def main():
    spec = importlib.util.spec_from_file_location(
        "theme_migrate_index",
        Path(__file__).parent / "theme_migrate_index.py",
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    subs = mod.SUBS

    for name in STATIC_PAGES:
        path = ROOT / name
        if not path.exists():
            print("SKIP missing", path)
            continue
        text = path.read_text(encoding="utf-8")
        if "tailwind-padelio-config" in text:
            print("SKIP already", name)
            continue
        text = patch_head(text)
        text = migrate_content(text, subs)
        text = patch_body_btn(text)
        path.write_text(text, encoding="utf-8")
        print("OK", name)


if __name__ == "__main__":
    main()
