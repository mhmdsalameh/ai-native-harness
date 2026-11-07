---
name: harness-design
description: Decide where each piece of a Claude Code harness belongs (CLAUDE.md, rules, skills, hooks, subagents, scripts, MCP) with token budgets, then build the files from templates. Use when designing or building skills, agents, commands, hooks or CLAUDE.md for a harness or plugin, when writing a skill description, or when the user asks where an instruction or rule should live.
---

# Harness design and build

Design goal: the smallest set of always-loaded tokens that gets the outcome, with every hard rule
enforced by code instead of by instruction.

## 1. Place each control

For each requirement from research (or each finding from the audit), pick one mechanism. Full
table with load timing and cost: [references/placement.md](references/placement.md).

| The requirement is… | Put it in | Why |
|---|---|---|
| a fact needed in almost every session (build command, layout, conventions) | CLAUDE.md (≤200 lines) | loads every session, survives compaction |
| a constraint for some paths only | `.claude/rules/*.md` with `paths:` frontmatter | loads only when matching files are touched |
| a procedure or domain know-how (~30+ lines) | a skill (SKILL.md ≤500 lines, details in references/) | only the description loads until needed |
| something that must **always** or **never** happen | a hook or a permission rule | deterministic; instructions fail under pressure |
| repeatable computation, parsing, counting, file generation | a script the skill calls | code costs no model tokens and does not drift |
| noisy side work that floods context (search 30 files, read logs) | a subagent returning a short summary | isolates context |
| access to an external system | an MCP server or CLI, wrapped by a skill | tools give typed, gateable actions |
| a fixed sequence the user starts | a skill with `disable-model-invocation: true` | no listing cost; runs only on `/name` |

Defaults that hold until an eval says otherwise:

- **One agent with skills.** Add a subagent only for context isolation or parallel independent
  work. Split by context, never by org chart. Keep the roster to a handful.
- **Description is the trigger.** Say what the skill does *and* when to use it, in the user's words.
  Under 1,536 characters (description + `when_to_use`); the listing truncates beyond that.
- **Progressive disclosure.** SKILL.md holds the procedure; long references, examples and schemas go
  in `references/` files that SKILL.md links to, read only when needed.
- **Right altitude.** Write the reasoning behind a rule, not a brittle if/else list. Give 1–3
  canonical examples instead of a list of edge cases.
- **Scripts for anything deterministic.** If two runs of the model could disagree on a count, a
  parse, a path, or a format, write a script.
- **Static first.** Stable text first, changing text last; it keeps prompt caching effective.

## 2. Write design.md (gate)

`.harness/design.md`: one table row per control, then the file tree.

| # | Requirement (source) | Mechanism | File | Always-loaded cost | How an eval will check it |
|---|---|---|---|---|---|

Estimate always-loaded cost as characters / 4 for CLAUDE.md lines and descriptions. Each row must
name the eval check that will show it works; a control nobody can check is a candidate to drop.
Ask the user to approve the design.

## 3. Build

Use the templates in [references/templates.md](references/templates.md): plugin manifest, SKILL.md,
agent, hook (with its script), CLAUDE.md skeleton. Build order:

1. Manifest and folder layout; `claude plugin validate <plugin>` passes.
2. Hooks and scripts first (they are the guarantees), each with a test you ran.
3. Skills, one at a time; after each, run `hb inventory <target>` and fix every error and warning.
4. Agents last, only those design.md justifies.
5. CLAUDE.md last and short: what is left after everything else found a better home.

Check before moving to evals:

- `claude plugin validate <plugin>` exit 0 (plugins), and `hb inventory` shows no errors.
- Every script has run once on real input. Every hook has been triggered once (a live
  `claude -p` call that the hook must decide on).
- Plugin agents ignore `hooks`, `mcpServers`, `permissionMode`: put hooks in `hooks/hooks.json`.
- `skills:` frontmatter does not put skill text in a main-session agent's context; tell the agent in
  its body to load the skill with the Skill tool.
