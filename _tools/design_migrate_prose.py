#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GUIDES = list(ROOT.glob("guide-*.html")) + [ROOT / "about.html", ROOT / "contact.html"]

for path in GUIDES:
    t = path.read_text(encoding="utf-8")
    orig = t
    t = t.replace(
        'class="text-slate-700 dark:text-slate-200 text-sm leading-relaxed mb-6"',
        'class="padel-lead mb-6"',
    )
    t = t.replace(
        'class="text-slate-700 dark:text-slate-200 text-sm leading-relaxed mb-4"',
        'class="padel-lead mb-4"',
    )
    if '<article>' in t and 'padel-prose' not in t:
        t = t.replace('<article>', '<article class="padel-prose">')
    if path.name == "about.html":
        t = t.replace('class="font-semibold text-lg mb-2"', 'class="padel-section-title"')
        t = t.replace(
            'class="text-slate-600/95 dark:text-slate-300/95 text-sm space-y-2 list-disc list-outside pl-4 leading-relaxed"',
            'class="padel-prose"',
        )
        t = t.replace(
            'class="text-slate-600 dark:text-slate-300/90 text-sm leading-relaxed"',
            'class="padel-muted"',
        )
    if t != orig:
        path.write_text(t, encoding="utf-8")
        print("ok", path.name)
