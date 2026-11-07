# Claude Code docs — harness building facts (fetched 2026-11-07 by claude-code-guide subagent)

## claude plugin eval — https://code.claude.com/docs/en/plugin-evals.md
- Suite: `<plugin>/evals/<case>/prompt.md` + `graders/<name>.md`. Grader types: regex, tool_used, tool_order, file_exists, llm, baseline. Defaults: runs 3, timeout 300s.
- Each case runs WITH and WITHOUT the plugin (WITH, W/OUT, delta).
- Sandbox: temp HOME + config, only the plugin loaded, read-only tools unless `--allow-tools`. Not an OS sandbox.
- Output: `evals/results/<ts>/aggregate-result.json` (schemaVersion 1), `report.html`, `--json [path]`.
- CI: `claude plugin eval . --trust-plugin --json results.json --threshold 0.8 --model <m> --judge-model <m> --no-publish --max-cost-usd 20`. Exit 0 pass, 1 fail, 2 partial or cost ceiling.
- prompt.md frontmatter: `max_turns`, `allowed_tools`. Grader example: `type: tool_used`, `tool: Skill`, `input_match: '"skill"\s*:\s*"(?:[\w-]+:)?my-skill"'`.
- Requires Claude Code 2.1.269+.

## /skill-doctor — https://code.claude.com/docs/en/skills.md#find-unused-skills, https://code.claude.com/docs/en/plugins/measure.md
- Per-skill context cost, usage, never-invoked skills, unused plugins. Interactive opens /plugin Stats tab; `-p` prints text. 2.1.252+. Not a linter.

## Headless baseline — https://code.claude.com/docs/en/headless.md, cli-reference.md
- `--bare`: skips hooks, skills, subagents, plugins, MCP, auto memory, CLAUDE.md. Needs ANTHROPIC_API_KEY (OAuth not read). Drops system reminders.
- `--safe-mode`: disables CLAUDE.md, skills, plugins, hooks, MCP, custom agents, auto memory; keeps auth, built-in tools, permissions. Documented as troubleshooting flag.
- `--disable-slash-commands`: skills+commands only.
- `--setting-sources`: effect on CLAUDE.md/plugins not documented.
- Prefer `--append-system-prompt`; `--system-prompt` drops default tool guidance.
- Others: `--plugin-dir`, `--agents`, `--tools`, `--allowedTools`, `--disallowedTools`, `--max-turns`, `--max-budget-usd` (client estimate), `--no-session-persistence`.
- JSON output: result, session_id, total_cost_usd, per-model breakdown, structured_output; usage/modelUsage per agent-sdk/cost-tracking.md. num_turns not documented in fetched pages.
- Verify isolation via `system/init` event (plugins, plugin_errors, mcp_servers).

## Skills — https://code.claude.com/docs/en/skills.md
- description + when_to_use truncated at 1,536 chars in listing. SKILL.md under 500 lines; detail in supporting files.
- Descriptions load every turn; bodies on invocation. Compaction re-attaches 5,000 tokens/skill, 25,000 combined.
- Frontmatter: name, description, when_to_use, argument-hint, disable-model-invocation, user-invocable, allowed-tools, model, effort, context (fork), agent, hooks, paths, shell. Unknown fields ignored silently.
- Reserved names: synced, anthropic-skills.

## Subagents & manifest — sub-agents.md, plugins/manifest-reference.md
- Subagent frontmatter: name, description (required); tools, disallowedTools, model, permissionMode, maxTurns, skills, mcpServers, hooks, memory, background, effort, isolation, color, initialPrompt.
- Plugin subagents ignore hooks, mcpServers, permissionMode.
- plugin.json: only `name` required (kebab-case); component paths start `./`. Plugin-root CLAUDE.md not loaded.
- `claude plugin validate <path> [--strict] [--json]`: exit 0/1, 2 on unexpected error.
- CLAUDE.md target under 200 lines per file (memory.md).
