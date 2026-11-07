---
name: harness-research
description: Chunked research protocol for a new harness — turn the domain into questions, read one source at a time into its own notes file, and distill a cited findings.md, with at most three parallel research subagents. Use when researching a domain, a tool, an API or Anthropic guidance before designing skills, agents or hooks, or when the user asks to research how to build a harness.
---

# Harness research

Research exists to make design decisions, not to collect material. Every question names the
decision it informs. Context is the scarce resource: read one source at a time and write it down
before reading the next.

## 1. Questions (gate)

Write `.harness/research/questions.md`. Cover these areas, skip the ones the user already answered:

| Area | Example question | Decision it informs |
|---|---|---|
| The work | What do experts do, step by step, and where do they fail? | which procedures become skills |
| Inputs and outputs | What files, systems, formats go in and out? | tools, scripts, MCP servers |
| Correctness | How does an expert check the result is right? | eval graders |
| Failure modes of Claude without help | What does plain Claude get wrong here? (try 2–3 prompts) | where a skill adds value |
| Hard rules | What must never happen? | hooks and permissions |
| Platform | Which Claude Code features and limits apply? | placement, packaging |

Ask the user to approve the questions and the source list. Prefer primary sources: official docs,
the user's own files and examples, real transcripts of failures.

## 2. One source at a time

For each source, write `.harness/research/notes/<short-name>.md`:

```
# <title>
URL/path: ...   Read: <date>
- concrete practice / fact / number (quote short phrases exactly)
- ...
[INFERRED] marks your conclusion, not the source's words.
Answers questions: Q2, Q5
```

Keep each notes file under ~80 lines. Do not keep page dumps. A web page is a lead until you read
it; a summary from a fetch tool can be wrong on numbers, so check numbers that drive a decision.

**Baseline probe (do it, it is cheap):** give plain Claude 2–3 realistic tasks from the domain in a
scratch folder (`claude -p "<task>" --safe-mode`) and note what it gets wrong. These failures are
the strongest evidence for what the harness must add, and they become eval cases later.

## 3. Parallel research (only when it pays)

Use the `harness-builder:harness-researcher` agent only for 3+ independent sources or topics; at most
3 at once. Each brief states:

- objective (one question set) and the decision it informs
- sources to read and the ones to skip
- output: the notes file path to write, and a ≤400-word summary to return
- budget: about 15 tool calls; stop when the questions are answered

Do not research the same source yourself while an agent has it.

## 4. Findings

Write `.harness/research/findings.md`: one bullet per finding, each with its source file in
brackets, grouped by the decision it informs. End with **Open questions** (what is still unknown and
what would resolve it). Record verified platform facts in `.harness/STATE.md`.

Done when every question in questions.md has an answer or an explicit "unknown" with the next step.
