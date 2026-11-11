# Templates

Replace `<...>`. Delete optional lines you do not need; every line in an always-loaded file costs
tokens in every session.

## Plugin layout

```
<plugin>/
  .claude-plugin/plugin.json
  skills/<skill>/SKILL.md (+ references/, scripts/)
  agents/<agent>.md
  commands/<command>.md          optional; skills are already /invocable
  hooks/hooks.json (+ hook scripts)
  scripts/                       deterministic helpers the skills call
  evals/<case>/prompt.md + graders/
  .mcp.json                      optional
```

`plugin.json` (only `name` is required, kebab-case):

```json
{
  "name": "<plugin-name>",
  "version": "0.1.0",
  "description": "<one line: what it does for whom>",
  "author": { "name": "<owner>" }
}
```

Paths inside skills, agents, commands and hooks: `${CLAUDE_PLUGIN_ROOT}/scripts/x.cjs`.

## SKILL.md

```markdown
---
name: <skill-name>
description: <What it does, in one sentence>. Use when <the situations and the words a user would type>.
---

# <Title>

<One paragraph: the goal and the standard of done.>

## Steps
1. <step; name the script to run for anything deterministic>
2. ...

## Rules
- <rule> — <why, in one clause>

## Check before finishing
- <observable check>

Details: [references/<topic>.md](references/<topic>.md)
```

Optional frontmatter: `disable-model-invocation: true` (only the user starts it; no listing cost),
`allowed-tools: Read, Grep`, `context: fork` (runs in a subagent), `paths: ["src/**"]`.

## Agent

```markdown
---
name: <agent-name>
description: <What it does>. Use when <trigger>. <What it returns.>
tools: Read, Grep, Glob
model: <optional: sonnet | haiku | inherit>
---

You are <role>. Your output is <format, length limit, file path if any>.

<Scope: what to do and what not to do. Stop rule: when to stop.>
```

## Orchestrator (main-session agent; every harness has one)

```markdown
---
name: <harness>-orchestrator
description: <Harness> operator. Runs as the main session agent (claude --agent <launch name>) and <what it does, for whom>. Stops for the user at <gates>.
model: inherit
---

You <role>. You succeed when <observable outcome>.

First action of every session: load the `<entry skill>` skill with the Skill tool<, then run
`<status command>`>. Load each <stage or task> skill with the Skill tool before doing it.

How you work:

- Do the work yourself. Use `<subagent>` only for <context isolation or parallel work>.
- Stop and ask with AskUserQuestion at: <each gate>. Give 2–4 options, recommendation first.
- <Each hard rule a hook enforces, so the agent expects the block and does not retry.>
- Never report <done, passing, better> without a command you ran.

Report to the user in <style and length>.
```

Omit `tools` so the orchestrator keeps every tool. Its body replaces the default Claude Code system
prompt, so it states the role, the first action and the gates in full.

| Target | File | Launch command |
|---|---|---|
| plugin | `<plugin>/agents/<name>.md` | `claude --agent <plugin>:<name>` |
| project | `.claude/agents/<name>.md` | `claude --agent <name>` in the project folder |
| user (`~/.claude`) | `~/.claude/agents/<name>.md` | `claude --agent <name>` |

Default for a folder: `{ "agent": "<launch name>" }` in its `.claude/settings.json`; `--agent`
overrides it. A project agent overrides a user agent of the same name, which overrides a plugin agent.

## Hook (PreToolUse guard)

`hooks/hooks.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|PowerShell",
        "hooks": [
          { "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/guard.cjs\"; exit 0", "timeout": 15 }
        ]
      }
    ]
  }
}
```

`hooks/guard.cjs` (reads the event on stdin, prints a decision, always exits 0; `; exit 0` keeps a
missing Node from blocking other sessions):

```js
'use strict';
let raw = '';
process.stdin.on('data', (c) => (raw += c)).on('end', () => {
  let input = {};
  try { input = JSON.parse(raw || '{}'); } catch { process.exit(0); }
  const cmd = (input.tool_input && input.tool_input.command) || '';
  if (/<pattern of the forbidden action>/.test(cmd)) {
    process.stdout.write(JSON.stringify({ hookSpecificOutput: {
      hookEventName: 'PreToolUse', permissionDecision: 'deny',
      permissionDecisionReason: '<what is forbidden and what to do instead>' } }));
  }
  process.exit(0);
});
```

`permissionDecision` can be `deny`, `ask` (the user confirms) or `allow`. Plugin hooks run in every
session the plugin is enabled in: return early unless the event belongs to your harness (check
`input.cwd`, a marker file, or `input.agent_type`).

## CLAUDE.md skeleton (≤200 lines; most harnesses need far fewer)

```markdown
# <Project>

## Commands
- Build: `<cmd>`   Test one file: `<cmd>`   Lint: `<cmd>`

## Layout
- `<dir>/` — <what lives there>

## Conventions
- <convention> — <why>

## Where to find more
- <topic>: skill `<name>` / `docs/<file>.md`
```
