---
name: harness
description: Stage map and operating rules for building or improving a Claude Code harness (skills, agents, commands, hooks, CLAUDE.md, scripts) with research, evals against a no-harness baseline, and cost optimization. Use at the start of any harness-building session, when the user asks to create, audit, evaluate, optimize or improve a harness, plugin, skill set or CLAUDE.md, or to decide which harness-builder skill to load next.
---

# Harness builder — stage map

A harness is everything around the model: CLAUDE.md and rules, skills, agents, commands, hooks,
scripts, MCP servers. The goal is a harness that **measurably** does the work better than Claude
with no harness, at the lowest token cost. Every claim of "better" comes from an eval run.

## Session start (every session)

1. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/hb.cjs" status` in the project folder. It prints the stage and the next step.
2. Read `.harness/STATE.md` if it exists. Do not re-derive facts it records.
3. Stage `none`: ask the user (AskUserQuestion) whether this is a **new** harness or an **improve**
   job, and for the target path. Then run `hb init --mode new|improve --target <path>`.

## Stages

| Mode | Stage | Skill to load | Output | Gate (stop and ask) |
|---|---|---|---|---|
| new | research | harness-research | `.harness/research/findings.md` | approve the question list and sources first |
| new | design | harness-design | `.harness/design.md` | approve the design before building |
| new | build | harness-design | the harness files | — |
| improve | audit | harness-audit | `.harness/audit.md` | approve which findings to act on |
| both | eval-suite | harness-eval | eval cases | approve the case list |
| both | wrap (non-plugin targets) | harness-eval | `.harness/wrapped/` | — |
| both | baseline | harness-eval | first ledger entry | approve the cost estimate |
| both | optimize | harness-optimize | ledger entries, changed files | approve each eval run and each edit to an existing harness |

Load the stage's skill with the Skill tool before doing the stage. Work one stage at a time; when a
stage's output exists, `hb status` moves on by itself.

## hb commands

`node "${CLAUDE_PLUGIN_ROOT}/scripts/hb.cjs" <command>` (Node built-ins only):

| Command | Use |
|---|---|
| `init --mode new\|improve --target <path>` | create `.harness/` (never overwrites) |
| `status` | stage + next step |
| `inventory <path> [--out file] [--json]` | static audit: counts, always-loaded tokens, budget findings |
| `estimate <eval dir> [--runs n] [--ablation none]` | agent runs, judge calls, cost range, suggested ceiling |
| `record <results dir> --label "<one change>"` | add an eval run to `.harness/experiments.jsonl` |
| `compare [a] [b]` | per-case change between two runs: improved / regressed / noise |
| `wrap <.claude dir or project> .harness/wrapped --evals .harness/evals` | eval-ready plugin copy of a non-plugin harness |
| `variant <plugin> --from evals --to evals-ctx --append <context.md>` | suite that carries CLAUDE.md text as `append_system_prompt` |

## Project folder

```
.harness/
  harness.json        mode, target, models
  STATE.md            verified facts, decisions, open failures, last session
  research/           questions.md, notes/<source>.md, findings.md
  design.md           one row per control
  audit.md            hb inventory output + your reading of it
  evals/              eval suite for non-plugin targets (plugin targets keep evals/ in the plugin)
  wrapped/            hb wrap output (generated; safe to replace)
  experiments.jsonl   one line per eval run
```

## Rules that hold in every stage

- **Measure before claiming.** "Better" means a positive Δ against the no-harness arm in a recorded
  eval run. Say "not measured" when there is none.
- **Spend only with approval.** Before any `claude plugin eval`, run `hb estimate` and show the range.
  Always pass `--max-cost-usd`. The plugin's hook stops each eval run for the user's approval and
  denies a run without a ceiling.
- **Never edit an existing harness without approval.** Work on a git branch when the target is a
  repo. Show the diff of each change before keeping it.
- **One agent with skills first.** Do the stages yourself. Spawn a subagent only for 3+ independent
  research sources or a fresh-context review; brief it with objective, output format, sources,
  scope and a tool budget; it returns ≤400 words plus a file path.
- **Never guess platform facts.** Frontmatter keys, flags and limits come from the docs or a live
  check. Record verified facts in STATE.md with how they were verified.
- **End of session:** update STATE.md "Last session" (tried / passed / failed / next).

## Platform limits to plan around

- `claude plugin eval` loads only plugins. Non-plugin harnesses go through `hb wrap`.
- Eval runs on native Windows cannot grant Bash or PowerShell (no OS sandbox backend; WSL2 works).
  Cases there use Read, Write, Edit, Glob, Grep and Skill, granted with `--allow-tools Write Edit`.
- Eval runs load nothing from the user's own config: no CLAUDE.md, user skills or other plugins.
- Traces are deleted after a run unless `--keep-temp` is passed. Pass it when you need to read transcripts.
