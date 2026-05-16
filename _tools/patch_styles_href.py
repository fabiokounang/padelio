#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HREF = '/styles.css?v=1.6.6'

for path in ROOT.glob("*.html"):
    text = path.read_text(encoding="utf-8")
    new = text.replace('href="styles.css"', f'href="{HREF}"')
    new = new.replace('href="/styles.css"', f'href="{HREF}"')
    if new != text:
        path.write_text(new, encoding="utf-8")
        print("patched", path.name)
