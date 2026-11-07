---
name: harness-optimize
description: Hill-climb a Claude Code harness for accuracy and cost — one change per experiment, eval before and after, keep only changes that hold with no regressed case, and cut always-loaded tokens, turns and spend per task. Use when improving, tuning, slimming or making a harness, plugin, skill set or CLAUDE.md cheaper or more accurate, or after a model upgrade.
---

# Harness optimization

Measure, change one thing, keep what holds. Every kept change has a ledger entry before and after.

## Before the first change

- A baseline ledger entry exists (harness-eval). Without it, stop and build it.
- The bar is written in `.harness/STATE.md`: the target suite score, the max regression allowed on
  any case (default: none beyond noise), and the budget for this optimization session.
- The target is on a git branch (when it is a repo), so every change can be reverted.

## The loop

1. **Pick one change** from the audit fix list or the last run's failures. Name the case(s) it should
   move and the cost it should save. One change per experiment — two at once cannot be attributed.
2. **Make it** (show the diff to the user first when the target is an existing harness).
3. **Re-wrap** if the target is not a plugin: `hb wrap <target> .harness/wrapped --evals .harness/evals`.
4. **Run** at the same settings as the baseline (same `--runs`, `--model`, judge), after
   `hb estimate` and the user's approval. Use `--case` to run only the affected cases while
   iterating; run the full suite before keeping.
5. **Record and compare**: `hb record ... --label "<the change>"`, then `hb compare <baseline label> <new label>`.
6. **Decide**:
   - Keep: target case(s) improved beyond noise, no case regressed, cost not worse (or worse by an
     amount the user accepted for the gain).
   - Revert: any regression, or no change beyond noise (unless the change only removes tokens and
     scores held — removal that holds is a win).
   - Record the decision and the reason in STATE.md.
7. Stop when: the bar is met, 3 consecutive experiments gave nothing, the same failure repeats after
   two different fixes (escalate to the user with the transcripts), or the budget is spent.

## Levers, in order of usual payoff per effort

| Lever | What to do | What to measure |
|---|---|---|
| Trigger fixes | rewrite descriptions in the user's words; split what vs when; remove overlap between skills | Skill indicator pass rate, Δ on should-fire and should-not-fire cases |
| Determinism | move counting, parsing, formatting, checking into a script; move "never" rules into hooks | case score, turns |
| Remove always-loaded text | delete stale workarounds and duplicates; move procedures from CLAUDE.md into skills; scope rules with `paths:` | `hb inventory` always-loaded tokens; scores must hold |
| Progressive disclosure | shrink SKILL.md bodies; move references, schemas and examples into files read on demand | tokens, turns |
| Fewer agents | fold subagents that hand work to each other into one agent + skills | cost, turns, score |
| Examples over rules | replace long edge-case lists with 1–3 canonical examples | score |
| Model and effort | a cheaper model or lower effort for a well-specified subagent or skill (`model:`, `effort:`) | cost per passed case |
| Tool output | concise responses, pagination, actionable errors in scripts and MCP tools | turns, tool errors |
| Caching | stable content first, nothing that changes per turn at the top of prompts | cost |

## Cost per completed task

Report cost as `costUsd / casesPassed` from the ledger, not just total cost: a cheaper harness that
passes fewer cases is not cheaper. Note the always-loaded token count (`hb inventory`) next to each
kept change.

## After a model upgrade

Re-run the full suite with the new `--model`. For each skill whose case now passes in the W/OUT arm
too, test removing it. Remove workarounds aimed at the old model, one at a time, with the loop above.
