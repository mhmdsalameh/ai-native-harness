---
name: harness-audit
description: Audit an existing Claude Code harness (a plugin, a project .claude folder with CLAUDE.md, or ~/.claude) for always-loaded token cost, budget breaches, misplaced rules, conflicting instructions, weak skill descriptions and missing evals, and rank what to fix. Use when the user asks to review, audit, clean up, slim down or improve an existing harness, CLAUDE.md, skill set or plugin.
---

# Harness audit

Output: `.harness/audit.md` — the script's measurements plus your reading, ending in a ranked fix
list. The audit changes nothing; fixes go through harness-optimize with an eval before and after.

## 1. Measure (script)

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/hb.cjs" inventory <target> --out .harness/audit.md
```

It reports the layout kind, component counts, always-loaded token estimate (CLAUDE.md + imports +
unscoped rules + skill/agent/command listing), and findings:

- missing descriptions; description + `when_to_use` over 1,536 characters (the listing truncates it)
- SKILL.md over 500 lines; CLAUDE.md over 200 lines
- unknown frontmatter keys, which Claude Code ignores silently (`allowed_tools` instead of `allowed-tools`)
- duplicate skill or agent names
- plugin agents with `hooks`, `mcpServers` or `permissionMode` (plugin agents ignore them)
- a CLAUDE.md at a plugin's root (never loaded)
- prompt/agent hooks (a model call on every event); no eval suite

If you cannot run the script, check the same list by reading the files.

## 2. Read (model)

The script cannot judge meaning. Read the always-loaded files and every description, and add a
"Reading" section to audit.md with findings in these classes:

| Class | Look for | Typical fix |
|---|---|---|
| Misplaced control | a hard rule written as an instruction ("never…", "always…") with no hook; a long procedure in CLAUDE.md | hook or permission; move procedure into a skill |
| Conflict | two instructions that cannot both hold, or the same rule stated twice with different wording ("Frankenprompt") | keep one, delete the other |
| Stale workaround | rules aimed at old model failures: repeated warnings, ALL CAPS, "IMPORTANT" stacking, forced resets | remove, then confirm with an eval |
| Weak trigger | description says what but not when; jargon the user never types; two skills whose descriptions overlap | rewrite in the user's words; merge |
| Subagent sprawl | many agents split by job title; agents that just hand work to each other | fold into one agent + skills |
| Missing determinism | the model is told to count, parse, format or check something a script could do | script |
| No proof | no eval suite, or a suite with only should-fire cases | write the suite (harness-eval) |

Quote the line and file for each finding. Mark each one **measured** (the script reported it) or
**judged** (your reading). Do not claim a finding hurts results until an eval shows it.

## 3. Rank (gate)

End audit.md with a fix list ranked by (expected effect on outcomes) × (always-loaded tokens saved),
cheapest safe fixes first. For each fix: the change, the files, the eval case that will show the
effect. Ask the user which fixes to pursue. Then load harness-eval to build the baseline before
changing anything.
