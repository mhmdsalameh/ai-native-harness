# Placement reference

Sources: "Steering Claude Code" and "When to fold subagents" (claude.com/resources/articles),
code.claude.com/docs/en/skills, /memory, /sub-agents, /hooks. Numbers are from those pages.

## When each mechanism loads and what it costs

| Mechanism | Loads | Survives compaction | Always-loaded cost |
|---|---|---|---|
| Root CLAUDE.md (+ @imports) | session start | re-read | high: every line, every session |
| Subfolder CLAUDE.md | when a file in that folder is read | — | low |
| `.claude/rules/*.md` without `paths` | session start | re-injected | medium |
| `.claude/rules/*.md` with `paths:` | when a matching file is touched | — | low |
| Skill | name + description at start; body when invoked | re-attached up to 5,000 tokens per skill, 25,000 total | low |
| Skill with `disable-model-invocation: true` | only when the user types `/name` | — | none |
| Subagent | name + description at start; only its final message returns | — | low |
| Hook | runs on lifecycle events, outside the model | not affected | none unless it prints to context or is a prompt/agent hook |
| Output style | system prompt | never compacted | high; replaces default coding instructions unless `keep-coding-instructions: true` |
| `--append-system-prompt` | per invocation | — | the more text, the less strictly followed |

## Decision rules

- Procedure of about 30 lines or more → skill. Shorter, always-true facts → CLAUDE.md.
- "Must always run" (formatter, tests before stop, logging) → hook. The model choosing to run a
  formatter is different from the formatter running.
- "Must never happen" (edit `.env`, push to main, delete outside the repo) → PreToolUse hook that
  denies (exit 2 with a reason on stderr, or JSON `permissionDecision: "deny"`), or a permission
  rule. A reason that reaches Claude lets it recover.
- Noisy side task → subagent. Thresholds from the subagents article: ten or more files to read, or
  three or more independent pieces of work.
- Do not use subagents for: dependent sequential steps, edits to the same files, small tasks,
  agents that must talk to each other.
- Reference material (policies, specs, schemas) → skill `references/` files or a lookup tool, not
  pasted into prompts.
- Validation, approval gates, mid-task lookups → tools or hooks. Cheap always-needed steps → code.

## Skill frontmatter (code.claude.com/docs/en/skills)

`name`, `description`, `when_to_use`, `argument-hint`, `disable-model-invocation`, `user-invocable`,
`allowed-tools`, `model`, `effort`, `context` (`fork`), `agent`, `hooks`, `paths`, `shell`.
Unknown keys are ignored silently, so a typo (`allowed_tools`) does nothing. Reserved skill folder
names: `synced`, `anthropic-skills`.

## Subagent frontmatter (code.claude.com/docs/en/sub-agents)

Required: `name`, `description`. Optional: `tools`, `disallowedTools`, `model`, `permissionMode`,
`maxTurns`, `skills`, `mcpServers`, `hooks`, `memory`, `background`, `effort`, `isolation`, `color`,
`initialPrompt`. Plugin agents ignore `hooks`, `mcpServers`, `permissionMode`.

Read-only research or review agents get read tools only. The description states the trigger:
"Reviews code for security issues before commits" beats "security expert".

## Tools and scripts (anthropic.com/engineering/writing-tools-for-agents)

- Fewer, consolidated tools by user intent (`search_logs`, not `list_logs` + `filter_logs`).
  Tool choice degrades past 30–50 definitions; use deferred tool search for large catalogs.
- Return high-signal fields only; offer a concise/detailed switch; paginate and truncate with a
  message that says how to narrow (Claude Code caps a tool result at 25,000 tokens).
- Errors say what to do next, not a stack trace.
- Script output that only Claude reads can be compact JSON; output a person reads is a short table.

## Long-running work (anthropic.com/engineering/effective-harnesses-for-long-running-agents)

For harnesses that run across many sessions: a state/progress file, a JSON feature list where the
agent changes only `passes`, an init script, a smoke test at session start, one feature at a time,
`passes: true` only after end-to-end verification.

## Re-audit on model change

Each model release: re-run the eval suite and ask "what can I stop doing?". Workarounds written for
older models (repeated warnings, forced resets, ALL-CAPS rules) often hurt newer ones.
