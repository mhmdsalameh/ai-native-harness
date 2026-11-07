# Harness Builder

A Claude Code plugin that builds a new harness or improves an existing one, the way Anthropic's
guidance recommends. A harness is the set of skills, agents, commands, hooks, scripts and CLAUDE.md
around Claude. The plugin researches the domain, designs and builds the harness, runs evals that
compare it with Claude without it, and optimizes accuracy and cost one change at a time.

## Requirements

- Claude Code 2.1.269 or later (`claude plugin eval`), Node.js (tested on 22.14), git.
- Eval runs on native Windows cannot use Bash or PowerShell (no OS sandbox backend). Install WSL2
  for cases that need a shell; cases with Read/Write/Edit/Glob/Grep/Skill work everywhere.

## Start

```
claude plugin marketplace add <path or GitHub repo of ai-native-harness>
claude plugin install harness-builder@ai-native-harness
cd <project folder>
claude --agent harness-builder:harness-orchestrator
```

Or set `"agent": "harness-builder:harness-orchestrator"` in the project's `.claude/settings.json`.
Without the agent, the skills are available as `/harness-builder:harness`, `…:harness-audit` and so on.

## What it does

| Mode | Stages |
|---|---|
| new | research → design → build → eval suite → baseline eval → optimize |
| improve | audit → eval suite → wrap (non-plugin targets) → baseline eval → optimize |

You approve: the research questions, the design, the eval case list, each eval run (the plugin's
hook stops every `claude plugin eval` for approval and refuses runs without `--max-cost-usd`), and
each edit to an existing harness.

## Contents

| Part | Purpose |
|---|---|
| `agents/harness-orchestrator.md` | main-session agent; does the stages, stops at gates |
| `agents/harness-researcher.md` | parallel research of one topic into one notes file |
| `agents/harness-reviewer.md` | fresh-context, read-only review of a design, diff or transcripts |
| `skills/harness` | stage map, project folder, rules, hb commands |
| `skills/harness-research` | chunked research protocol |
| `skills/harness-design` | where each control belongs; templates |
| `skills/harness-audit` | audit an existing harness |
| `skills/harness-eval` | eval suites in the `claude plugin eval` format; reading results |
| `skills/harness-optimize` | hill-climb loop and cost levers |
| `hooks/eval-guard.cjs` | approval + cost ceiling for eval runs (harness sessions only) |
| `scripts/hb.cjs` | `init status inventory estimate record compare wrap variant` |
| `evals/` | this plugin's own suite: 3 should-fire cases, 1 negative control, 1 should-not-fire |

## hb

`node scripts/hb.cjs help`. Node built-ins only. Highlights:

- `inventory <path>` audits a plugin, a project (`.claude/` + CLAUDE.md) or `~/.claude`: component
  counts, always-loaded token estimate, budget findings with their sources.
- `wrap <.claude dir or project> <out>` makes an eval-ready plugin copy of a non-plugin harness
  (hook paths rewritten, CLAUDE.md + rules gathered into `context.md`, a report of what did not carry).
- `variant` copies a suite with `context.md` as `append_system_prompt`, to measure always-loaded text.
- `estimate`, `record`, `compare` keep a per-project ledger of eval runs and flag regressions and noise.

## Tests

```
node --test scripts/test/*.test.cjs
claude plugin validate .
```

## Sources

The research behind the design is in the repository's `docs/research/`: 20 Anthropic articles,
21 cookbook entries, and the Claude Code docs for plugin evals, skills, subagents and headless runs.
