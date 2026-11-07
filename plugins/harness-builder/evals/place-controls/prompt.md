---
description: Should fire harness-design. Tests placement, including the path-scoped rule plain Claude tends to miss.
max_turns: 12
allowed_tools: [Read, Write, Edit, Glob, Grep, Skill]
tags: [core]
---

I'm setting up Claude Code for my team's repo. Write `design.md` with a Markdown table, one row per item, saying where each of these should live in our Claude Code setup and why. Start each row with the item's number and its text.

1. Never edit anything under `secrets/`.
2. The build command is `pnpm build`.
3. Our 45-line release procedure.
4. Run prettier on every file Claude edits.
5. API handlers in `src/api/` must validate input with zod.

Don't ask me questions.
