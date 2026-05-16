# One-off migration: index.html light/dark dual Tailwind classes (longest keys first).
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / "index.html"

SUBS = [
    ("bg-slate-950/95", "bg-white/90 dark:bg-slate-950/95"),
    ("bg-slate-950/90", "bg-white/92 dark:bg-slate-950/90"),
    ("bg-slate-950/50", "bg-slate-100/85 dark:bg-slate-950/50"),
    ("border-slate-950/90", "border-slate-200/80 dark:border-slate-950/90"),
    ("bg-slate-950", "bg-slate-50 dark:bg-slate-950"),
    ("bg-slate-900/70", "bg-slate-100/90 dark:bg-slate-900/70"),
    ("bg-slate-900/60", "bg-slate-200/80 dark:bg-slate-900/60"),
    ("bg-slate-900/40", "bg-slate-100/70 dark:bg-slate-900/40"),
    ("bg-slate-900/95", "bg-white/95 dark:bg-slate-900/95"),
    ("bg-slate-900", "bg-slate-100 dark:bg-slate-900"),
    ("bg-slate-800/95", "bg-white/95 dark:bg-slate-800/95"),
    ("bg-slate-800/30", "bg-slate-200/60 dark:bg-slate-800/30"),
    ("bg-slate-800", "bg-slate-200 dark:bg-slate-800"),
    ("bg-slate-700", "bg-slate-300 dark:bg-slate-700"),
    ("border-white/15", "border-slate-200/90 dark:border-white/15"),
    ("border-white/25", "border-slate-300/90 dark:border-white/25"),
    ("border-white/20", "border-slate-200/80 dark:border-white/20"),
    ("border-amber-400/20", "border-amber-300/60 dark:border-amber-400/20"),
    ("border-teal-400/25", "border-teal-300/70 dark:border-teal-400/25"),
    ("border-teal-400/30", "border-teal-300/75 dark:border-teal-400/30"),
    ("border-pink-300/25", "border-pink-200/70 dark:border-pink-300/25"),
    ("border-white/12", "border-slate-200/80 dark:border-white/12"),
    ("border-white/10", "border-slate-200/80 dark:border-white/10"),
    ("border-white/8", "border-slate-200/70 dark:border-white/8"),
    ("border-white/5", "border-slate-200/60 dark:border-white/5"),
    ("bg-white/[0.04]", "bg-slate-900/[0.03] dark:bg-white/[0.04]"),
    ("bg-white/[0.03]", "bg-slate-900/[0.02] dark:bg-white/[0.03]"),
    ("hover:bg-white/[0.04]", "hover:bg-slate-900/[0.04] dark:hover:bg-white/[0.04]"),
    ("hover:bg-white/15", "hover:bg-slate-800/20 dark:hover:bg-white/15"),
    ("hover:bg-white/10", "hover:bg-slate-700/15 dark:hover:bg-white/10"),
    ("hover:bg-white/5", "hover:bg-slate-600/10 dark:hover:bg-white/5"),
    ("bg-white/15", "bg-slate-800/15 dark:bg-white/15"),
    ("bg-white/10", "bg-slate-800/12 dark:bg-white/10"),
    ("bg-white/5", "bg-slate-900/8 dark:bg-white/5"),
    ("text-slate-200/95", "text-slate-700/95 dark:text-slate-200/95"),
    ("text-slate-300/95", "text-slate-600/95 dark:text-slate-300/95"),
    ("text-slate-200", "text-slate-700 dark:text-slate-200"),
    ("text-slate-300", "text-slate-600 dark:text-slate-300"),
    ("hover:text-white", "hover:text-slate-900 dark:hover:text-white"),
    ("hover:text-teal-100", "hover:text-teal-800 dark:hover:text-teal-100"),
    ("hover:text-teal-200", "hover:text-teal-700 dark:hover:text-teal-200"),
    ("hover:text-pink-100", "hover:text-pink-800 dark:hover:text-pink-100"),
    ("text-slate-400", "text-slate-600 dark:text-slate-400"),
    ("placeholder-slate-500", "placeholder-slate-500 dark:placeholder-slate-500"),
    ("from-slate-900/30", "from-slate-100/50 dark:from-slate-900/30"),
    ("via-slate-900/30", "via-slate-50/40 dark:via-slate-900/30"),
    ("bg-black/75", "bg-black/40 dark:bg-black/75"),
    ("bg-black/70", "bg-black/35 dark:bg-black/70"),
    ("bg-red-900/90", "bg-red-100/95 dark:bg-red-900/90"),
]

def migrate(s: str) -> str:
    for old, new in SUBS:
        s = s.replace(old, new)
    # body line: special-case selection
    s = s.replace(
        "selection:bg-pink-400/25 selection:text-white",
        "selection:bg-pink-400/20 selection:text-slate-900 dark:selection:text-white",
    )
    s = s.replace(
        'class="text-white font-semibold text-base mb-2"',
        'class="text-slate-900 dark:text-white font-semibold text-base mb-2"',
    )
    s = s.replace(
        'class="text-white font-semibold text-sm mb-3"',
        'class="text-slate-900 dark:text-white font-semibold text-sm mb-3"',
    )
    s = s.replace(
        'id="spectator-qr-title" class="text-lg font-extrabold text-white"',
        'id="spectator-qr-title" class="text-lg font-extrabold text-slate-900 dark:text-white"',
    )
    return s


def main():
    s = INDEX.read_text(encoding="utf-8")

    s = re.sub(
        r'<script src="https://cdn\.tailwindcss\.com/3\.4\.17"></script>\s*<script>\s*tailwind\.config\s*=\s*\{[\s\S]*?\};\s*</script>',
        '<script src="https://cdn.tailwindcss.com/3.4.17"></script>\n  <script src="js/tailwind-padelio-config.js"></script>',
        s,
        count=1,
    )
    if "tailwind-padelio-config" not in s:
        raise SystemExit("tailwind config replacement failed")

    # theme.js after styles.css
    s = s.replace(
        '  <link rel="stylesheet" href="styles.css">\n\n  <!-- SDK -->',
        '  <link rel="stylesheet" href="styles.css">\n  <script src="js/theme.js"></script>\n\n  <!-- SDK -->',
        1,
    )

    s = s.replace('<html lang="en" class="h-full">', '<html lang="en" class="h-full dark">', 1)

    s = migrate(s)
    INDEX.write_text(s, encoding="utf-8")
    print("OK", INDEX)


if __name__ == "__main__":
    main()
