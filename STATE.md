# STATE.md — ai-native-harness

## Verified facts
- [2026-11-07] `claude plugin eval` (Claude Code 2.1.319) runs each case with and without the plugin; `--runs 1` still reports `cases[].runsPerCase: 3` — count `arms.with` for runs made — verified by: probe run, scripts/test/fixtures/aggregate-probe.json
- [2026-11-07] Eval traces are deleted after a run unless `--keep-temp`; kept temp dirs on Windows cannot be sealed and the CLI says to delete them — verified by: probe and self-proof runs
- [2026-11-07] `append_system_prompt` written by `hb variant` as a `|` block scalar loads and takes effect — verified by: ZEBRA variant run, $0.05
- [2026-11-07] The eval loader ends grader frontmatter at a `---` inside a quoted pattern ("invalid YAML frontmatter: Unexpected EOF"); use `-{3}` — verified by: self-proof run 1 failed to load fix-skill-trigger, fixed run loaded
- [2026-11-07] No WSL on this machine; eval runs cannot grant Bash/PowerShell on native Windows (docs: no sandbox backend) — verified by: `wsl.exe -l -v`, plugin-evals doc
- [2026-11-07] Plugin PreToolUse hook `permissionDecision: ask` stops a `claude plugin eval` call in `claude -p` and returns the reason to the model; `deny` returns the reason as a hook error — verified by: live `claude -p --plugin-dir` runs in a scratch folder with .harness/harness.json
- [2026-11-07] Orchestrator as main agent loads `harness-builder:harness` and runs `hb status` on its own — verified by: `claude -p --plugin-dir ... --agent harness-builder:harness-orchestrator`
- [2026-11-11] A project agent `.claude/agents/<name>.md` runs as the main session with `claude --agent <name>` (2.1.322) — verified by: `claude -p --agent demo-orchestrator` in a scratch folder replied with the agent's fixed text
- [2026-11-11] Agent locations and priority: project `.claude/agents/` > user `~/.claude/agents/` > plugin `agents/`; plugin agents start by bare or scoped name (`<plugin>:<name>`); `"agent"` in `.claude/settings.json` sets the default, `--agent` overrides; omitted `tools` = all tools; an agent body replaces the default system prompt — verified by: code.claude.com/docs/en/sub-agents (user-level location not live-checked)
- [2026-11-07] `~/.claude` hooks use `$USERPROFILE\.claude\...`; hb wrap rewrites it to `${CLAUDE_PLUGIN_ROOT}` — verified by: `hb wrap ~/.claude <scratch>` + `claude plugin validate`

## Rules
- Process for this build: compressed SDLC (intent+spec, then plan), chosen by the user 2026-11-07.
- Eval runs: no fixed budget; each run shows an estimate and needs approval (hook `ask`) with `--max-cost-usd`. (user, 2026-11-07)
- Scripts use Node built-ins only.

## Open failures
- [2026-11-07] Self-proof measured at `--runs 1` only; Δ per case is one run each | confirm at `--runs 3` (estimate $1.6–6.3) before claiming stable results
- [2026-11-07] place-controls case shows Δ 0 (plain Claude already places these controls correctly) | hypothesis: it is a control, not a capability case; replace with a harder placement case from a real failure
- [2026-11-07] Not yet used end to end on a real target (improve mode on ~/.claude or a project) | repro: `claude --agent harness-builder:harness-orchestrator` in a project folder

## Lessons learned
- Grade produced files or the final message, never the trace, when the loaded skill text contains the same words the grader looks for.

## Last session
### 2026-11-11 (orchestrator per harness)
- tried: user asked that every built harness gets its own orchestrator for `claude --agent`; scope chosen: design + templates + audit, no eval case
- changed: harness-design SKILL.md (default, design.md row 1, build step 4, launch check), templates.md (orchestrator template + launch table), harness-audit (No orchestrator class), harness SKILL.md stage table, README; branch feat/orchestrator-per-harness, not committed
- passed: `claude plugin validate` exit 0 (icon warning only); `hb inventory` ~837 tokens, no errors; 33/33 unit tests
- failed: none
- next: effect not measured (user chose no eval case); commit after user review

### 2026-11-07 (promo film)
- tried: media/promo — time-driven HTML stage rendered frame by frame over CDP (Node 22 WebSocket, no deps), synthesized score (audio.cjs), ffmpeg mux
- passed: out/harness-builder.mp4 1920x1080 30 fps H.264 + AAC 48 kHz, 58.0 s, 129 MB, -16.7 LUFS; render ~3.5 min; boundary stills t=0/12.15/57.99 grain-only black
- failed: first stills run — hidden scenes never requested the web fonts; fixed with explicit document.fonts.load
- then: added scene sd (51–71 s) — "Give it a domain." + example plans for development, design, motion graphics (labeled "Example plans", no scores); end card and rail now timed from timeline.js; film 78.0 s, 177 MB, -16.9 LUFS, render ~4.5 min
- next: user reviews the film; push the repo before posting (end card shows github.com/mhmdsalameh/ai-native-harness); optional 1:1 cut for LinkedIn

### 2026-11-07
- tried: research (20 articles, 21 cookbook entries, plugin-eval docs) -> intent/spec + plan -> plugin harness-builder (3 agents, 6 skills, hb CLI, eval-guard hook, 5-case self-proof suite)
- passed: 33/33 `node --test scripts/test/*.test.cjs`; `claude plugin validate` plugin + marketplace; self-proof runs=1: eval-suite-for-skill Δ +1.00, audit-plugin Δ +0.20, place-controls 0.00, fix-skill-trigger 0.00 (control), unrelated-git-question 0.00 with no skill fired; suite mean Δ +0.24; eval spend $1.25 + probes ~$0.15
- failed: first self-proof run could not load fix-skill-trigger (`---` in a grader pattern) — fixed
- next: user tries improve mode on a real harness; runs=3 confirmation; LICENSE + icon if the plugin goes to the directory
