---
description: Should fire harness-eval. Plain Claude does not know the claude plugin eval file format.
max_turns: 20
allowed_tools: [Read, Write, Edit, Glob, Grep, Skill]
tags: [core]
---

My Claude Code plugin has a skill named `commit-msg` that writes Conventional Commits messages from a short description of a change. I want to measure whether it actually helps compared with Claude without the plugin, using `claude plugin eval`.

Create the eval suite in this folder under `evals/`: one case where the skill should be used, and one case with an unrelated request where it must not be used. Use the real file format so the suite runs without edits. Don't ask me questions; make reasonable choices. When you are done, show me the full contents of every grader file you wrote.
