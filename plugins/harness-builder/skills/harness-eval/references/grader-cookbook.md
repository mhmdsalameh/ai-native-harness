# Grader cookbook

Source: code.claude.com/docs/en/plugin-evals (copy in the repo at docs/research/plugin-evals-doc.md),
checked against a live run on Claude Code 2.1.319.

## prompt.md frontmatter

| Field | Default | Note |
|---|---|---|
| `runs` | 3 | 1–50; `--runs` overrides |
| `max_turns` | 10 | up to 200; hitting it is a run error, set it generously |
| `timeout_seconds` | 300 | up to 3600 |
| `allowed_tools` | `[]` | read-only tools are granted when listed; Write/Edit/Bash need `--allow-tools` |
| `model` | session default | `--model` overrides |
| `append_system_prompt` | | appended to the run's system prompt |
| `env` | `{}` | keys must match `EVAL_[A-Z0-9_]*` |
| `tags`, `description`, `expected_outcome`, `name`, `plugins` | | `plugins: ["../.."]` when auto-detect fails |

An unknown key is an error. `@path` in the prompt is not expanded.

## case.yaml (only when you need these)

```yaml
schema_version: "1.1"
name: audit-fixture
context:
  add_dirs: [resources]        # read-only folders inside the case folder
  # scaffold_script: setup.sh  # bash, runs only with --scaffold, 120 s limit
  # history_file: prior.jsonl  # resume a conversation; single arm by default
```

## Grader files

Frontmatter keys for all: `type`, `weight` (default 1), `arm` (`with-only` | `both`).

```markdown
---
type: regex
target: { source: file, path: out/report.md }
pattern: '1,?536'
---
```

```markdown
---
type: regex
pattern: 'TODO'
match: not_contains
---
```

```markdown
---
type: tool_used
tool: Skill
input_match: '"skill"\s*:\s*"(?:[\w-]+:)?my-skill"'
---
```

Must-not-fire (scored in both arms):

```markdown
---
type: tool_used
tool: Skill
min: 0
max: 0
arm: both
---
```

```markdown
---
type: file_exists
path: 'evals/*/prompt.md'
---
```

```markdown
---
type: llm
focus: last_message
---
PASS if the reply names a PreToolUse hook (or a permission deny rule) for blocking edits to .env.
FAIL if it only suggests an instruction in CLAUDE.md.
```

Never write `---` inside a grader's frontmatter, not even in a quoted pattern: the loader ends the
frontmatter there and the case fails to load ("invalid YAML frontmatter"). Write `-{3}` instead.

`regex` options: `pattern` (JavaScript regex, no inline `(?i)`; use `flags: i`), `flags`,
`match` (`contains` default | `not_contains` | `"count:N"`), `target`.
Targets: `last_message` (default), `trace` (JSON lines; quotes appear as `\"`), `files` (paths
created in the run, one per line), `{source: file, path}` (file contents), `mock_calls`.

`llm`: a judge votes three times, passes on two. `baseline`: compares to a reference transcript
(`baseline_file`, a .jsonl in the case folder).

There are no custom-code graders. To grade a build or test result, ask the agent to write the
outcome to a file and grade the file, plus `tool_used` on the command.

## Scoring

Run score = weighted fraction of scored graders that passed. Case score = mean over runs. In a
two-arm run, `tool_used: Skill` graders and `arm: with-only` graders are excluded from the score
in both arms and shown as "plugin fired" indicators. `--ablation none` scores everything.

## aggregate-result.json (schemaVersion 1) — fields hb reads

`costUsd`, `partial`, `partialReason`, `claudeVersion`, `aggregates.{overallScore, meanDelta,
casesPassed, casesTotal}`, `cases[].name`, `cases[].aggregates.{score, scoreWithout, delta}`,
`cases[].arms.with[]` and `.without[]` runs with `score`, `passed`, `turns`, `costUsd`,
`judgeCostUsd`, `error`, `skippedPaidGraders`, `tracePath` (deleted after the run unless
`--keep-temp`). `cases[].runsPerCase` is the case's configured value, not the runs made; count
`arms.with` instead.

## Cost (measured 2026-11-07)

A one-turn skill case: $0.04–0.05 per run. Coding tasks at high effort: about $0.30 per run.
`hb estimate` uses the ledger's measured runs when there are any.
