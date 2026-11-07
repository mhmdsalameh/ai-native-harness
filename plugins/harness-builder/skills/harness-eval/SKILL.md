---
name: harness-eval
description: Write and run evals that prove a harness beats Claude without it, in the claude plugin eval format (prompt.md + graders/, with-plugin vs no-plugin arms, delta per case), with cost estimates and an experiment ledger. Use when writing eval cases or graders for a plugin, skill or harness, when running claude plugin eval, comparing with a baseline, or reading eval results.
---

# Harness evals

An eval case is a realistic prompt plus graders. `claude plugin eval` runs each case with the plugin
(WITH) and without it (W/OUT); Δ = WITH − W/OUT is what the harness adds. Full grader reference:
[references/grader-cookbook.md](references/grader-cookbook.md).

## 1. Choose cases (gate)

Start with 8–20 cases; quality beats count. Sources, best first:

1. Real failures: the research baseline probe, user reports, transcripts where plain Claude failed.
2. The work the harness exists for, phrased the way a user types it (never name the skill).
3. Should-not-fire cases: nearby requests the harness must leave alone (at least 1 in 5 cases).
4. One negative control: a task plain Claude already does well. It should show Δ ≈ 0, not harm.

Each case must be unambiguous: two experts would agree on pass/fail, and everything a grader checks
is stated in the prompt. Write the list (name, prompt, what passes, why plain Claude fails) and ask
the user to approve it.

## 2. Write cases

```
evals/<case-name>/
  prompt.md        frontmatter (run limits, tools) + the prompt
  graders/*.md     one grader per file
  case.yaml        only for fixtures: context.add_dirs, scaffold_script, history_file
```

```markdown
---
max_turns: 15
allowed_tools: [Read, Write, Edit, Glob, Grep, Skill]
tags: [core]
---
<the request, as the user would type it; name the output file path if a grader reads it>
```

Graders, per case: one on the **outcome** (a file or the final reply) and one on the **process**
(`tool_used` with `tool: Skill` — scored as a "plugin fired" indicator only). Prefer free graders:

| Check | Grader |
|---|---|
| a file was created | `file_exists` with `path:` glob |
| a produced file contains / lacks something | `regex` with `target: {source: file, path: <path>}`, `match: not_contains` for absence |
| the reply says something | `regex` on `last_message` |
| a tool was or was not used | `tool_used` (`min: 0`, `max: 0`, `arm: both` for must-not) |
| order of steps | `tool_order` |
| quality that needs judgment | `llm` with a short PASS/FAIL rubric on a short target |

Rules that keep scores stable: regex for long outputs; `llm` only on short text with concrete
PASS and FAIL lines; several small graders give partial credit; never check the exact path the
agent took when the outcome can be checked.

Platform limits: each run starts in an empty folder with no user config. On native Windows a run
cannot use Bash or PowerShell (WSL2 can, with `--allow-tools "Bash(<pattern>)"`). Fixtures go in
the case folder via `context.add_dirs` (read-only), or inline in the prompt.

## 3. Check the suite before spending on it

- `claude plugin eval <plugin> --case <name> --runs 1 --ablation none --max-cost-usd 1 --allow-tools Write Edit`
  on one or two cases: graders load and behave. A grader that fails on a correct result is a grader bug.
- A case at 0% in both arms over several runs is usually a broken case, not a hard one.
- Non-plugin targets: `hb wrap <target> .harness/wrapped --evals .harness/evals`, then evaluate
  `.harness/wrapped`. Re-run wrap after every change to the target.

## 4. Run (gate: cost)

1. `node "${CLAUDE_PLUGIN_ROOT}/scripts/hb.cjs" estimate <eval dir> --runs <n>` — put the range and
   the ceiling in your message to the user.
2. Run with the suggested ceiling. The plugin's hook stops the command for the user's approval and
   denies any run without `--max-cost-usd`. If the user declines, do not retry; ask what to change.
   `claude plugin eval <plugin> --runs <n> --max-cost-usd <ceiling> --allow-tools Write Edit --no-publish --trust-plugin`
   (`--trust-plugin` only for a plugin you or the user wrote; add `--keep-temp` to keep transcripts.)
3. `hb record <plugin>/evals/results --label "<what this run measures>"`.

Runs: 1 to iterate on graders; 3 before keeping or reverting any change. Pin `--model` when results
will be compared across days.

## 5. Read results

- Per case, not just the mean: a mean Δ can hide one regressed case.
- Δ > 0 with the Skill indicator passing: the harness helped. Δ ≈ 0 with WITH = 1.0: plain Claude
  already does this; the skill may be unnecessary. Δ < 0: suspect the judge or grader first
  (re-run with `--judge-model sonnet`), then the harness.
- Skill indicator failing: the description does not trigger on natural phrasing; fix the description.
- Read transcripts of failing runs (`--keep-temp`) before changing the harness. What the agent did
  not do is often the finding.
- Skip partial runs (`partial: true`, cost ceiling) in comparisons; `hb compare` warns about them.

## Testing always-loaded text (CLAUDE.md, rules)

The eval arms differ only by plugin, and CLAUDE.md does not load from a plugin. To measure CLAUDE.md
text, compare two single-arm runs:

```
hb variant <plugin> --from evals --to evals-ctx --append .harness/wrapped/context.md
claude plugin eval <plugin> --ablation none --runs 3 ...                     # without the text
claude plugin eval <plugin> --eval-dir evals-ctx --ablation none --runs 3 ... # with the text
```

Record both and `hb compare` them. `append_system_prompt` sits in the system prompt, where real
CLAUDE.md text does not, so report this as an approximation.

## CI (document for the user; do not wire it yourself)

`claude plugin eval . --trust-plugin --json results.json --threshold 0.8 --model <m> --judge-model <m> --no-publish --max-cost-usd 20`
Exit 0 pass, 1 below threshold or error, 2 partial (cost ceiling).
