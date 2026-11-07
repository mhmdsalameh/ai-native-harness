# Harness Builder

An open-source [Claude Code](https://code.claude.com) plugin that builds, tests and improves
**agent harnesses**, and measures whether they actually make Claude better.

```
claude plugin marketplace add mhmdsalameh/ai-native-harness
claude plugin install harness-builder@ai-native-harness
```

## What is a harness?

The model is half of an agent. The other half is the **harness**: everything around the model that
turns it into a working agent.

| Part | What it does | Example |
|---|---|---|
| `CLAUDE.md` and rules | facts and conventions loaded at the start of every session | "Tests live in `tests/`, run them with `npm test`" |
| Skills | know-how the model loads only when a task needs it | a `release-checklist` skill |
| Hooks | code that checks or blocks the model's actions | block edits to `.env` files |
| Subagents | separate agents with a fresh context for one job | a read-only reviewer |
| Commands, scripts, MCP servers | tools and shortcuts | `/deploy`, a lint script |
| Evals | test cases that tell you if the harness helps | "write a test for this endpoint" |

## Why a harness makes a model better

The same model gives very different results in different harnesses:

- **The right knowledge at the right moment.** A skill loads only when its description matches the
  task, so the model gets the know-how it needs without filling its context with the rest.
- **Rules that actually hold.** A rule written only in a prompt can be forgotten halfway through a
  long task. A hook enforces it in code, every time.
- **A clean context.** Every line in `CLAUDE.md` costs tokens on every turn. A lean harness leaves
  more room for the work.

It also goes wrong easily: a skill with a vague description never triggers, a bloated `CLAUDE.md`
slows every session, and a new rule "feels better" but nobody measured it. Most harnesses are built
by guesswork.

## What Harness Builder does

It builds and improves harnesses the way you build software: research, design, tests, measurement.

1. **Research.** It reads Anthropic's published guidance on agents, skills and evals, in small
   chunks so its own context stays clean, plus any sources you give it.
2. **Design and build.** It puts each control in the right layer: hard rules become hooks, know-how
   becomes skills, facts go in `CLAUDE.md`, isolated jobs go to subagents.
3. **Test.** It writes an eval suite and runs each case twice, **with the harness and without it**.
   The score is the difference (Δ). Control cases must stay at zero.
4. **Optimize.** It changes one thing at a time and logs every eval run to a ledger. A change stays
   only if it improves its target cases beyond noise, makes no case worse and does not raise cost.
5. **Improve an existing harness.** Point it at your `~/.claude` folder, a project's `.claude/`
   folder or a plugin. It audits it against known budgets, measures a baseline, then improves it.

You stay in control. It stops for your approval at each gate: the research questions, the design,
the eval case list, every eval run (with a cost estimate and a spending ceiling) and every edit to
an existing harness.

### Results on itself

The plugin ships with its own eval suite. First run (1 run per case, $1.25 total):

| Case | Without plugin | With plugin | Δ |
|---|---|---|---|
| Write an eval suite for a skill | 0.00 | 1.00 | **+1.00** |
| Audit a plugin against the budgets | 0.80 | 1.00 | **+0.20** |
| Put each rule in the right layer | 1.00 | 1.00 | 0.00 |
| Fix a skill that does not trigger (control) | 1.00 | 1.00 | 0.00 |
| Unrelated git question (must not fire) | 1.00 | 1.00 | 0.00 |

One run per case is a starting point, not a benchmark. Confirmation at 3 runs per case is open.

## Requirements

- [Claude Code](https://code.claude.com) 2.1.269 or later (for `claude plugin eval`)
- Node.js 22 or later
- git

## Install

```
claude plugin marketplace add mhmdsalameh/ai-native-harness
claude plugin install harness-builder@ai-native-harness
```

## Quick start

The plugin keeps its working files in a `.harness/` folder in the directory where you start it, so
start it in a working folder, not inside the harness you want to change.

```
mkdir harness-work && cd harness-work
claude --agent harness-builder:harness-orchestrator
```

To start the orchestrator by default in a folder, add this to that folder's `.claude/settings.json`:

```json
{ "agent": "harness-builder:harness-orchestrator" }
```

The orchestrator asks two things first:

1. **Mode.** `new` to build a harness from scratch, `improve` to work on one you have.
2. **Target.** The folder to build in, or the harness to improve (for example `~/.claude`).

Then it works through the stages one at a time and tells you the next step. You can stop at any time
and continue in a new session. It reads its progress from `.harness/`.

### Example: build a new harness

```
> build a harness for our TypeScript web app
```

It proposes research questions and sources, then a design with one row per control and the layer
it belongs in. After your approval it builds the files, proposes eval cases, shows a cost estimate
and runs the baseline eval.

### Example: improve your own setup

```
> improve the harness in ~/.claude
```

It audits the folder (component counts, always-loaded tokens, skills with weak trigger descriptions,
files over budget), proposes fixes, wraps the folder into a temporary plugin so it can be evaluated,
measures a baseline, then tries one change at a time.

**Before you approve edits to a harness that is a git repo, commit or stash your own changes first,**
so every change the plugin makes can be reviewed and reverted.

### Without the orchestrator

The skills also work on their own in any Claude Code session:

| Skill | Use it to |
|---|---|
| `/harness-builder:harness` | see the stage map and rules |
| `/harness-builder:harness-research` | research a domain in chunks |
| `/harness-builder:harness-design` | decide where each control belongs |
| `/harness-builder:harness-audit` | audit an existing harness |
| `/harness-builder:harness-eval` | write an eval suite and read results |
| `/harness-builder:harness-optimize` | run the one-change-at-a-time loop |

## Cost and safety

Eval runs call the model and cost money. The plugin protects you three ways:

- `hb estimate` shows the number of agent runs and a cost range before any run.
- A hook stops every `claude plugin eval` in a harness session and asks for your approval.
- The same hook refuses any eval run without `--max-cost-usd`.

For scale: the plugin's own 5-case suite cost $1.25 at 1 run per case.

## The `hb` command line

Deterministic helpers the agent uses, also usable by hand. Node built-ins only, no install step.

```
node <plugin>/scripts/hb.cjs help
```

| Command | Use |
|---|---|
| `init --mode new\|improve --target <path>` | create `.harness/` (never overwrites) |
| `status` | current stage and next step |
| `inventory <path>` | audit a plugin, project or `~/.claude`: counts, always-loaded tokens, budget findings |
| `estimate <eval dir>` | agent runs, judge calls, cost range, suggested ceiling |
| `record <results dir> --label "<change>"` | add an eval run to the ledger |
| `compare [a] [b]` | per-case change between two runs: improved, regressed or noise |
| `wrap <harness> <out>` | make an eval-ready plugin copy of a non-plugin harness |
| `variant <plugin> --from <evals> --to <evals-ctx> --append <context.md>` | measure always-loaded text such as `CLAUDE.md` |

## Limits

- `claude plugin eval` loads plugins only. Non-plugin harnesses (`~/.claude`, a project's `.claude/`)
  are evaluated through `hb wrap`, which copies them into a temporary plugin.
- `CLAUDE.md` and rules load at a different position in an eval run than in a real session.
  `hb variant` measures them as appended system prompt text, which is close but not identical.
- On native Windows, eval runs cannot grant Bash or PowerShell (Claude Code has no sandbox backend
  there). Cases that use Read, Write, Edit, Glob, Grep and Skill work everywhere. Use WSL2 for cases
  that need a shell.

## Repository layout

| Path | Contents |
|---|---|
| [`plugins/harness-builder/`](plugins/harness-builder) | the plugin: agents, skills, hook, `hb` CLI, its own eval suite |
| [`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json) | marketplace entry |
| [`docs/research/`](docs/research) | the research behind the design: 20 Anthropic articles, 21 cookbook entries, Claude Code docs |
| [`docs/sdlc/harness-builder/`](docs/sdlc/harness-builder) | intent, requirements and plan |
| [`media/promo/`](media/promo) | the promo film, rendered from code |

## Development

```
cd plugins/harness-builder
node --test scripts/test/*.test.cjs
claude plugin validate .
```

Run the self-test suite (costs money, about $2–6 at 3 runs per case):

```
claude plugin eval plugins/harness-builder --runs 3 --max-cost-usd 15 --allow-tools Write Edit --no-publish
```

To release, raise `version` in `plugins/harness-builder/.claude-plugin/plugin.json` and
`.claude-plugin/marketplace.json`, run the tests and validation, then the self-test suite.

Issues and pull requests are welcome. A change to a skill or agent should come with an eval case
that shows the difference.

## License

[MIT](LICENSE)
