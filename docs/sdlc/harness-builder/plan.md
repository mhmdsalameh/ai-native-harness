# Plan: harness-builder

Implements intent.md R1–R12. Status: draft for approval · 2026-11-07

## Files

```
ai-native-harness/
  .claude-plugin/marketplace.json          R1
  README.md, STATE.md, FEATURES.json, .gitignore
  docs/research/*.md                       sources (committed)
  docs/sdlc/harness-builder/{intent,plan}.md
  plugins/harness-builder/
    .claude-plugin/plugin.json             R1
    README.md                              usage, gates, Windows limits
    agents/
      harness-orchestrator.md              R2 main-session agent
      harness-researcher.md                R4 read+web, writes one notes file
      harness-reviewer.md                  blind/fresh read-only review of a diff or transcript
    skills/
      harness/SKILL.md                     R2/R3 stage map, project layout, gates, hb commands
      harness-research/SKILL.md            R4 chunked research protocol + brief template
      harness-design/SKILL.md              R5 placement table, budgets, build steps
      harness-design/references/{placement.md,templates.md}
      harness-audit/SKILL.md               R6 audit an existing harness
      harness-eval/SKILL.md                R7 suite authoring + run + read results
      harness-eval/references/grader-cookbook.md
      harness-optimize/SKILL.md            R9 hill-climb loop, levers, stop rules
    scripts/hb.cjs                         CLI: init status inventory estimate record compare wrap variant
    scripts/lib/{fm.cjs,inventory.cjs,ledger.cjs,wrap.cjs}
    scripts/test/*.test.cjs + fixtures/    R12
    evals/<5 cases>/                       R11 self-proof suite
```

Skills are user-invocable (`/harness-builder:harness-eval` etc.), so no separate commands/.

## Work order (check per step)

1. Repo scaffold, manifests, STATE.md, FEATURES.json — `claude plugin validate` exit 0.
2. `fm.cjs` (frontmatter read/write) + `inventory` + fixtures — tests: oversized SKILL.md/CLAUDE.md,
   long/missing descriptions, duplicate names flagged; plugin, project and `~/.claude` layouts detected.
3. `init` / `status` — tests: creates layout, never overwrites, stage detection per file set.
4. `wrap` / `variant` — tests: hooks path rewrite, context.md, report of uncarried items,
   `append_system_prompt` written as a block scalar that `claude plugin eval` loads.
5. One real eval run on a 1-case scratch plugin (`--runs 1`, ~$0.10) to capture the real
   `aggregate-result.json`; then `estimate` / `record` / `compare` built and tested against it.
6. Skills + agents (content from docs/research, each SKILL.md ≤500 lines, descriptions ≤1,536 chars).
7. Self-proof suite (5 cases, Windows-safe tools): should-fire cases (write a plugin-eval case for a
   given skill; place five requirements into the right controls; audit a fixture harness) + one
   should-not-fire case; graders: file_exists/regex first, short llm rubrics.
8. Run `hb inventory` on the plugin itself and on `~/.claude` (live check of the audit).
9. Run the self-proof suite once, both arms (`--runs 1`, estimate ~$2–4, ceiling $5) — needs your OK.
10. README, STATE.md, commit.

## Tests and checks

- `cd plugins/harness-builder && node --test scripts/test/*.test.cjs`
- `claude plugin validate plugins/harness-builder` and `claude plugin validate .`
- Live: `claude -p --plugin-dir plugins/harness-builder --agent harness-builder:harness-orchestrator`
  prints the stage line for an empty folder.
- Step 9 result recorded in STATE.md with the Δ and cost as measured.
