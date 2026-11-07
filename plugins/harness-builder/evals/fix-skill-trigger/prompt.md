---
description: Negative control. Plain Claude already writes good trigger descriptions; expect delta near 0, not harm.
max_turns: 10
allowed_tools: [Read, Write, Edit, Glob, Grep, Skill]
tags: [control]
---

People on my team ask Claude things like "what changed since the last release?" or "draft the release notes", but this skill never gets used. Rewrite it so Claude picks it up, and save the result to `skills/changelog/SKILL.md`. Keep the body as is. Don't ask me questions.

```markdown
---
name: changelog
description: Changelog utility.
---
Read `git log` since the last tag and group the commits into Added, Changed and Fixed.
```
