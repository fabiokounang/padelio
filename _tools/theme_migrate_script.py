"""Apply same dual-theme class replacements to js/script.js template strings."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "js" / "script.js"

# Import subs from sister script — duplicated for one-off run
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
    ("from-slate-900/30", "from-slate-100/50 dark:from-slate-900/30"),
    ("via-slate-900/30", "via-slate-50/40 dark:via-slate-900/30"),
    ("bg-black/75", "bg-black/40 dark:bg-black/75"),
    ("bg-black/70", "bg-black/35 dark:bg-black/70"),
    ("bg-red-900/90", "bg-red-100/95 dark:bg-red-900/90"),
    ("bg-emerald-800/50", "bg-emerald-50/95 dark:bg-emerald-800/50"),
    ("hover:bg-emerald-700/50", "hover:bg-emerald-100/80 dark:hover:bg-emerald-700/50"),
    ("border-emerald-600/50", "border-emerald-300/70 dark:border-emerald-600/50"),
    ("border-emerald-600/45", "border-emerald-300/75 dark:border-emerald-600/45"),
    ("border-emerald-600/40", "border-emerald-300/70 dark:border-emerald-600/40"),
    ("bg-emerald-700/90", "bg-emerald-100 dark:bg-emerald-700/90"),
    ("border-emerald-500/50", "border-emerald-400/70 dark:border-emerald-500/50"),
    ("border-emerald-700/45", "border-emerald-200/80 dark:border-emerald-700/45"),
    ("font-bold text-white focus", "font-bold text-slate-900 dark:text-white focus"),
]


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


def main():
    s = SCRIPT.read_text(encoding="utf-8")
    for old, new in SUBS:
        s = s.replace(old, new)
    s = fix_doubles(s)
    s = s.replace(
        "selection:bg-pink-400/25 selection:text-white",
        "selection:bg-pink-400/20 selection:text-slate-900 dark:selection:text-white",
    )
    SCRIPT.write_text(s, encoding="utf-8")
    print("OK", SCRIPT)


if __name__ == "__main__":
    main()
