# Intent + spec: harness-builder

Status: draft for approval · 2026-11-07 · process: compressed (intent+spec, then plan), chosen by the user

## What

A Claude Code plugin, `harness-builder`, whose main-session agent builds and improves agent
harnesses (skills, agents, commands, hooks, scripts, CLAUDE.md/rules) the way Anthropic recommends:
research the domain in chunks, design with the fewest always-loaded tokens, build, prove with evals
that the harness beats a no-harness baseline, then optimize cost and accuracy one change at a time.
It works on a new harness or an existing one (a plugin, a project `.claude/`, or `~/.claude`).

## Why

Harnesses are usually grown by appending instructions and never measured. The user wants an agent
that produces harnesses that measurably do the work better than Claude with no skills or with
unoptimized skills, and that can take an existing harness and make it better and cheaper.

## Sources (committed under docs/research/)

- `articles.md` — 20 claude.com / anthropic.com engineering articles (harness design, steering,
  skill-creator, subagents, context engineering, tools, multi-agent research, long-running
  harnesses, evals).
- `cookbook.md` — 21 cookbook entries (building evals, evaluator-optimizer, orchestrator-workers,
  Agent SDK agents, skills, tool evaluation, outcome grader, context management, caching).
- `claude-code-docs.md`, `plugin-evals-doc.md` — Claude Code docs: `claude plugin eval`, skills,
  subagents, manifest, headless flags.

Practices the design commits to (each traced in the notes):
1. One agent with skills before subagents; subagents only for context isolation or parallel
   independent work, with an objective/format/scope/budget brief, returning a short summary + file path.
2. Put each control where it belongs: always-true facts → CLAUDE.md (≤200 lines); procedures → skills
   (SKILL.md ≤500 lines, progressive disclosure); hard rules → hooks/permissions (deterministic);
   noisy side work → subagents; repeatable computation → scripts.
3. The skill description is the trigger: test should-fire and should-not-fire prompts.
4. Evals before claims: 10–20 real tasks, outcome graders first (code, then rubric judge), with and
   without the harness, several trials, per-case deltas, read transcripts, a 0% task is suspect.
5. Optimize as a hill climb: fix the bar first, change one thing, measure, keep what holds; track cost
   and tokens per completed task; re-audit after model changes.
6. Long work is resumable: state file, experiment ledger, one change at a time.

## Requirements

- **R1 Package.** New repo `~/ai-native-harness` laid out like `~/ai-native-qa`: marketplace file +
  `plugins/harness-builder`. `claude plugin validate` passes on both.
  - Given the repo, when `claude plugin validate plugins/harness-builder` runs, then exit 0.
- **R2 Orchestrator agent.** `harness-orchestrator` runs as the main session agent
  (`claude --agent harness-builder:harness-orchestrator`, or a project `"agent"` setting). It loads the
  `harness` skill first, does each stage itself, and stops at four gates: research scope, design,
  every eval run (cost estimate shown, user approves), and every change applied to an existing harness.
  - Given an existing harness path, when the user asks to improve it, then the agent runs the audit and
    asks before any eval spend or any edit to the target.
- **R3 Project state.** `hb init` creates `.harness/` in the working folder (config, STATE.md,
  research/, design.md, experiments.jsonl); `hb status` names the current stage and the next step from
  the files present. Never overwrites.
- **R4 Research in chunks.** The `harness-research` skill: questions first, one source at a time,
  one notes file per source, a cited `findings.md`; at most 3 parallel research subagents, each
  writing its own notes file and returning ≤400 words.
- **R5 Design and build.** The `harness-design` skill: the placement table, size budgets, single-agent
  default, description-as-trigger, tool/script rules, and templates for SKILL.md, agent, hook and
  plugin manifest. Output: `design.md` with one row per control (what, where, why, token cost).
- **R6 Audit.** `hb inventory <path>` statically audits a plugin, a project `.claude/`, or `~/.claude`:
  counts components, estimates always-loaded size, and flags budget breaches (description length,
  SKILL.md lines, CLAUDE.md lines, missing descriptions, missing evals, duplicate names). JSON and
  Markdown output.
  - Given a fixture harness with a 600-line SKILL.md and a 250-line CLAUDE.md, then both are flagged.
- **R7 Evals.** The `harness-eval` skill writes suites in the `claude plugin eval` format (prompt.md +
  graders/), balanced should/shouldn't-trigger cases, outcome graders first. `hb estimate` prints
  runs × arms and a cost range before any run; the run passes `--max-cost-usd`. On native Windows,
  cases use only Read/Write/Edit/Glob/Grep/Skill (the eval sandbox refuses Bash without WSL).
- **R8 Ledger.** `hb record <aggregate-result.json> --label <change>` appends one line per eval run;
  `hb compare <a> <b>` prints per-case score/Δ changes, regressions, and cost change, and marks a
  difference smaller than one run's weight as noise.
- **R9 Optimize.** The `harness-optimize` skill: the hill-climb loop (one change per experiment, keep
  only if suite Δ holds and no case regresses), the cost/context levers in priority order, and stop
  rules (iteration cap, repeated failure, budget).
- **R10 Non-plugin harnesses.** `hb wrap <.claude dir | ~/.claude> <out>` builds an eval-ready plugin
  copy: skills, agents, commands copied; settings.json hooks written to hooks/hooks.json with paths
  rewritten to `${CLAUDE_PLUGIN_ROOT}`; CLAUDE.md + unscoped rules concatenated to `context.md`.
  `hb variant` copies a suite with `append_system_prompt` from `context.md`, so always-loaded text is
  compared as two single-arm runs. The report lists what was not carried over.
- **R11 Self-proof.** The plugin ships its own `evals/` suite; one run shows a positive mean Δ against
  no plugin.
- **R12 Portability.** Scripts use Node built-ins only; tests run with `node --test`.

## Non-goals

- An Agent SDK or Managed Agents application (the harness targets Claude Code).
- CI wiring (the skill documents the CI command; the user adds it).
- Applying changes to an existing harness without approval.

## Risks and unknowns

- The per-run fields in `aggregate-result.json` (score, tokens) are not in the docs; `hb record` is
  built against a real run's output, not a guess.
- `append_system_prompt` is an approximation of CLAUDE.md loading (different position and weight);
  the report says so.
- Each eval run costs real money; the agent never starts one without an estimate and approval.
