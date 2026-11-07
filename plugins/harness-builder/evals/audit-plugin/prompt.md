---
description: Should fire harness-audit. Needs platform facts plain Claude may not know (listing truncation, ignored keys, plugin limits).
max_turns: 12
allowed_tools: [Read, Write, Edit, Glob, Grep, Skill]
tags: [core]
---

Review this Claude Code plugin for problems that affect how it loads or gets triggered, and write the findings to `audit.md`, most severe first, one finding per line. Don't ask me questions.

Files in the plugin:

`.claude-plugin/plugin.json`
```json
{ "name": "pdf-tools", "version": "1.0.0" }
```

`skills/pdf-fill/SKILL.md` — 640 lines long. Its frontmatter:
```yaml
---
name: pdf-fill
description: Fills PDF forms. <...the description continues for 1,700 characters in total, listing every PDF feature the skill supports...>
allowed_tools: [Read, Bash]
---
```

`agents/pdf-checker.md`
```markdown
---
name: pdf-checker
description: Checks filled PDFs against the source data. Use after pdf-fill.
hooks:
  Stop:
    - hooks:
        - type: command
          command: node scripts/verify.js
---
You verify filled PDFs.
```

`CLAUDE.md` at the plugin root — 120 lines of team conventions for PDF work.

There is no `evals/` folder.
