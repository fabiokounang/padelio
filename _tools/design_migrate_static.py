#!/usr/bin/env python3
"""Apply shared Padelio design classes to static HTML pages."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STATIC = [
    "about.html",
    "guides.html",
    "contact.html",
    "privacy-policy.html",
    "terms.html",
    "guide-americano-format.html",
    "guide-scoring-and-leaderboard.html",
    "guide-mix-americano.html",
    "guide-organizer-checklist.html",
    "guide-common-mistakes.html",
    "guide-mexicano-and-modes.html",
]

THEME_FAB_OLD = (
    'class="fixed bottom-6 right-6 z-[300] flex h-12 w-12 items-center justify-center rounded-2xl '
    "border border-slate-200/90 dark:border-white/15 bg-white/95 dark:bg-slate-800/95 "
    'text-amber-500 dark:text-amber-200 shadow-cozy-sm backdrop-blur-md"'
)
THEME_FAB_NEW = 'class="padel-theme-fab"'

BODY_OLD = 'class="h-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white overflow-auto pb-20"'
BODY_NEW = 'class="h-full padel-body overflow-auto pb-20"'

BACK_OLD = (
    'class="flex items-center gap-2 text-slate-600 dark:text-slate-300 '
    'hover:text-slate-900 dark:hover:text-white mb-6 transition-colors"'
)
BACK_NEW = 'class="padel-back"'

CARD_OLD = "bg-slate-200/60 dark:bg-slate-800/30 border border-slate-700 rounded-2xl p-5"
CARD_NEW = "padel-card"

CARD_ALT = "bg-slate-200 dark:bg-slate-800/40 border border-teal-500/30 rounded-2xl p-5 bg-gradient-to-br from-teal-500/5 to-pink-500/5"
CARD_ACCENT = "padel-card padel-card--accent"

FOOTER_OLD = 'class="border-t border-slate-800 bg-white/90 dark:bg-slate-950/95 px-6 py-8 mt-auto"'
FOOTER_NEW = 'class="padel-footer mt-auto"'

GUIDE_LINK_OLD = (
    'class="block bg-slate-200/60 dark:bg-slate-800/30 border border-slate-700 rounded-2xl p-5 '
    "hover:bg-slate-300/70 dark:hover:bg-slate-800/45 transition-colors\""
)
GUIDE_LINK_NEW = 'class="padel-guide-card"'

GUIDE_LINK_CYAN = (
    'class="block bg-slate-200/60 dark:bg-slate-800/30 border border-cyan-900/40 rounded-2xl p-5 '
    "hover:bg-slate-300/70 dark:hover:bg-slate-800/45 transition-colors\""
)

VERSION_SCRIPT = '  <script src="js/version.js"></script>\n'


def migrate(path: Path) -> bool:
    text = path.read_text(encoding="utf-8")
    orig = text

    text = text.replace(BODY_OLD, BODY_NEW)
    text = text.replace(BACK_OLD, BACK_NEW)
    text = text.replace(THEME_FAB_OLD, THEME_FAB_NEW)
    text = text.replace(FOOTER_OLD, FOOTER_NEW)
    text = text.replace(GUIDE_LINK_OLD, GUIDE_LINK_NEW)
    text = text.replace(GUIDE_LINK_CYAN, GUIDE_LINK_NEW)
    text = text.replace(CARD_ALT, CARD_ACCENT)
    text = text.replace(CARD_OLD, CARD_NEW)

    text = text.replace(
        "bg-slate-200/60 dark:bg-slate-800/30 border border-slate-700 rounded-2xl p-5",
        "padel-card",
    )
    text = text.replace(
        "bg-slate-200 dark:bg-slate-800/20 border border-slate-700 rounded-2xl p-4",
        "padel-card padel-card--flat",
    )

    if "js/version.js" not in text and "js/script.js" in text:
        text = text.replace(
            '  <script src="js/script.js"></script>',
            VERSION_SCRIPT + '  <script src="js/script.js"></script>',
        )
    elif "js/version.js" not in text and "</body>" in text:
        text = text.replace("</body>", VERSION_SCRIPT + "</body>")

    if path.name != "index.html" and 'class="text-3xl font-bold mb-3"' in text:
        text = text.replace(
            'class="text-3xl font-bold mb-3"',
            'class="padel-page-title mb-3"',
            1,
        )

    if path.name == "about.html" and 'class="text-2xl font-bold mb-2"' in text:
        text = text.replace('class="text-2xl font-bold mb-2"', 'class="padel-page-title"', 1)

    if path != orig:
        path.write_text(text, encoding="utf-8")
        return True
    return False


def main():
    changed = []
    for name in STATIC:
        p = ROOT / name
        if p.exists() and migrate(p):
            changed.append(name)
    print("Updated:", ", ".join(changed) or "(none)")


if __name__ == "__main__":
    main()
