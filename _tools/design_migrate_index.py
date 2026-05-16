#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / "index.html"
text = path.read_text(encoding="utf-8")

replacements = [
    (
        """      <motion.div class="grid grid-cols-2 gap-3 mb-6">
        <div class="bg-slate-900/[0.03] dark:bg-white/[0.04] border border-slate-200/80 dark:border-white/10 rounded-3xl p-4 text-center shadow-cozy-sm backdrop-blur-sm">
          <motion.div class="text-lg font-extrabold text-pink-600 dark:text-pink-100">Fast</div>
          <p class="text-slate-600 dark:text-slate-400 text-xs mt-1.5 leading-snug">Set up rounds and scores in minutes</p>
        </div>
        <div class="bg-slate-900/[0.03] dark:bg-white/[0.04] border border-slate-200/80 dark:border-white/10 rounded-3xl p-4 text-center shadow-cozy-sm backdrop-blur-sm">
          <div class="text-lg font-extrabold text-teal-600 dark:text-teal-100">Simple</div>
          <p class="text-slate-600 dark:text-slate-400 text-xs mt-1.5 leading-snug">Made for friendly clubs and social sessions</p>
        </div>
      </div>""",
        """      <div class="grid grid-cols-2 gap-3 mb-6 padel-shell">
        <div class="padel-stat-tile">
          <strong>Fast</strong>
          <span>Set up rounds and scores in minutes</span>
        </div>
        <div class="padel-stat-tile">
          <strong>Simple</strong>
          <span>Made for friendly clubs and social sessions</span>
        </motion.div>
      </div>""",
    ),
]

# fix - remove motion.div typo in replacement
replacements[0] = (
    """      <div class="grid grid-cols-2 gap-3 mb-6">
        <div class="bg-slate-900/[0.03] dark:bg-white/[0.04] border border-slate-200/80 dark:border-white/10 rounded-3xl p-4 text-center shadow-cozy-sm backdrop-blur-sm">
          <motion.div class="text-lg font-extrabold text-pink-600 dark:text-pink-100">Fast</div>""",
    "STAT_START",
)

# Simpler approach - read file and do string replaces one by one
old_stat = """      <div class="grid grid-cols-2 gap-3 mb-6">
        <div class="bg-slate-900/[0.03] dark:bg-white/[0.04] border border-slate-200/80 dark:border-white/10 rounded-3xl p-4 text-center shadow-cozy-sm backdrop-blur-sm">
          <div class="text-lg font-extrabold text-pink-600 dark:text-pink-100">Fast</div>
          <p class="text-slate-600 dark:text-slate-400 text-xs mt-1.5 leading-snug">Set up rounds and scores in minutes</p>
        </div>
        <div class="bg-slate-900/[0.03] dark:bg-white/[0.04] border border-slate-200/80 dark:border-white/10 rounded-3xl p-4 text-center shadow-cozy-sm backdrop-blur-sm">
          <div class="text-lg font-extrabold text-teal-600 dark:text-teal-100">Simple</div>
          <p class="text-slate-600 dark:text-slate-400 text-xs mt-1.5 leading-snug">Made for friendly clubs and social sessions</p>
        </div>
      </div>"""

new_stat = """      <div class="grid grid-cols-2 gap-3 mb-6 padel-shell">
        <div class="padel-stat-tile">
          <strong>Fast</strong>
          <span>Set up rounds and scores in minutes</span>
        </div>
        <div class="padel-stat-tile">
          <strong>Simple</strong>
          <span>Made for friendly clubs and social sessions</span>
        </div>
      </div>"""

old_guides = """      <div class="mb-6 bg-gradient-to-br from-violet-500/10 via-pink-500/10 to-teal-500/10 border border-slate-200/80 dark:border-white/10 rounded-3xl p-5 shadow-cozy-sm backdrop-blur-sm">
        <h2 class="text-lg font-extrabold mb-2 text-slate-900 dark:text-slate-50">Free organizer guides</h2>
        <p class="text-slate-600/95 dark:text-slate-300/95 text-sm leading-relaxed mb-3">
          Read practical guides for Americano format setup, score handling, mix planning,
          Mexicano-style modes (including Mix Mexicano and Balanced Americano), and common mistakes that can reduce session quality.
          Start from the index—each topic has its own page, including Mexicano &amp; advanced modes.
        </p>
        <a
          href="guides.html"
          onclick="navigateTo('guides'); return false;"
          class="inline-flex items-center gap-2 text-sm font-semibold text-pink-800 dark:text-pink-100 hover:text-pink-950 dark:hover:text-white transition-colors"
        >
          Open all guides
          <span aria-hidden="true">→</span>
        </a>
      </div>"""

new_guides = """      <div class="padel-card mb-6 padel-shell">
        <h2 class="padel-section-title">Free organizer guides</h2>
        <p class="padel-muted mb-3">
          Read practical guides for Americano format setup, score handling, mix planning,
          Mexicano-style modes (including Mix Mexicano and Balanced Americano), and common mistakes that can reduce session quality.
          Start from the index—each topic has its own page, including Mexicano &amp; advanced modes.
        </p>
        <a href="guides.html" onclick="navigateTo('guides'); return false;" class="padel-link inline-flex items-center gap-2">
          Open all guides <span aria-hidden="true">→</span>
        </a>
      </div>"""

for old, new in [(old_stat, new_stat), (old_guides, new_guides)]:
    if old in text:
        text = text.replace(old, new)
        print("replaced block")
    else:
        print("MISSING:", old[:60])

path.write_text(text, encoding="utf-8")
