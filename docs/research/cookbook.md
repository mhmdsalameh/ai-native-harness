# Anthropic Cookbook — patterns for a harness-builder orchestrator

Source: https://github.com/anthropics/claude-cookbooks (main branch, fetched 2026-11-07). Notebook
sources were read as cell text. "INFERENCE" marks my own reuse ideas, not cookbook claims.

---

## 1. Building Evals
URL: https://github.com/anthropics/claude-cookbooks/blob/main/misc/building_evals.ipynb

Pattern:
- An eval has 4 parts: input (variables fed into a prompt template), output, golden answer, score.
- Writing questions is a one-time cost; grading is paid on every rerun. Design for cheap grading first.
- Grader order of preference: code (exact match / contains / regex) > model-based > human.
- Code grader: force a constrained output ("return just the integer") so `output == golden` works.
  The example uses `output_config={"effort": "low"}` and reads the text block, not `content[0]`
  (a thinking block can come first).
- Model grader: the golden answer becomes a *rubric* ("a correct answer should... it cannot...").
  Grader prompt = `<answer>` + `<rubric>`, "think in `<thinking>`, then output correct/incorrect in
  `<correctness>`"; parse the tag with regex; raise if missing.
- Rules of thumb: match the real input distribution; read grader samples to validate the grader;
  reformat to multiple choice to make grading automatable; prefer more, lower-quality questions
  over few perfect ones.

Harness-builder reuse:
- Each eval case = `{input vars, rubric or golden}`; store as JSONL in the harness repo.
- Prefer deterministic assertions (file exists, test passes, regex) per case; add a rubric only for
  the residue. Make the grader output a tagged label and fail closed on a parse miss.
- INFERENCE: spot-read N graded samples per run to calibrate the LLM judge before trusting deltas.

## 2. Evaluator-Optimizer Workflow
URL: https://github.com/anthropics/claude-cookbooks/blob/main/patterns/agents/evaluator_optimizer.ipynb

Pattern:
- Two LLM roles in a loop: generator produces, evaluator grades and gives feedback.
- Fit test: clear evaluation criteria exist, and feedback demonstrably improves output, and the
  LLM can produce meaningful feedback itself.
- Generator output format: `<thoughts>` (understanding of task + feedback + plan) and `<response>`.
- Evaluator prompt: numbered criteria; "evaluate only, do not solve"; "only output PASS if all
  criteria are met and you have no further suggestions"; output
  `<evaluation>PASS|NEEDS_IMPROVEMENT|FAIL</evaluation><feedback>...</feedback>`.
- Loop context = all previous attempts + latest feedback, fed back to the generator.
- The sample loop is `while True` with no iteration cap (a weakness to fix when reusing).

Harness-builder reuse:
- Core improve-loop for a skill/prompt: generator = harness editor, evaluator = eval run + judge.
- Add a max-iterations cap and stop on "no score gain" (INFERENCE; cookbook loop has no cap).
- Carry the history of tried variants into the next attempt so the optimizer does not repeat itself.

## 3. Orchestrator-Workers Workflow
URL: https://github.com/anthropics/claude-cookbooks/blob/main/patterns/agents/orchestrator_workers.ipynb

Pattern:
- Use when subtasks cannot be predicted in advance and depend on the input; do NOT use for
  single-output tasks, latency-critical paths, or fixed subtasks (use plain parallelization).
- Phase 1: orchestrator returns `<analysis>` + `<tasks><task><type/><description/></task>...</tasks>`,
  bounded ("break into 2-3 distinct approaches").
- Phase 2: each worker gets the original task + its own type + description + shared context;
  returns `<response>`.
- Validate worker output; replace empty output with an explicit error marker (no silent drop).
- Cost: N+1 calls. Suggested upgrades: parallel workers (asyncio), retry failed workers, a synthesis
  step that merges worker outputs, Opus orchestrator + Haiku workers for cost.
- Failure modes listed: poor decomposition, empty/malformed worker output, XML parse failure
  (JSON as alternative).

Harness-builder reuse:
- Research phase: orchestrator decides which domain facets to investigate, spawns bounded workers,
  then synthesizes. Always pass the original goal to each worker, not only its slice.
- Cap the number of subtasks in the orchestrator prompt; tier models (big planner, small workers).

## 4. Basic Multi-LLM Workflows (chaining, parallelization, routing)
URL: https://github.com/anthropics/claude-cookbooks/blob/main/patterns/agents/basic_workflows.ipynb

Pattern:
- All three trade cost/latency for task performance; sample code, not production.
- Chain: `for prompt in prompts: result = llm(prompt + "Input: " + result)`. Each step has one
  narrow transform with an explicit example output format (extract -> normalize -> sort -> format).
- Parallel: same prompt over independent inputs via `ThreadPoolExecutor(max_workers=n)`.
- Route: selector call with `<reasoning>` then `<selection>` over a fixed key set, then call the
  specialist prompt from a dict. (Sample does not guard an unknown key.)
- Specialist prompts: role line + numbered guidelines + fixed opening string (easy to assert).

Harness-builder reuse:
- Express a harness pipeline as a chain of narrow steps, each with a checkable output format.
- Route per task type to a specialist skill/agent; validate the route key against the allowed set
  (INFERENCE: fallback route when unknown).
- Fixed opening strings or tags in specialist output make code-graded routing evals possible.

## 5. Research lead + research subagent prompts (multi-agent research system)
URLs: https://github.com/anthropics/claude-cookbooks/blob/main/patterns/agents/prompts/research_lead_agent.md
and https://github.com/anthropics/claude-cookbooks/blob/main/patterns/agents/prompts/research_subagent.md

Pattern (lead):
- Process: assess/break down -> classify query type (depth-first / breadth-first / straightforward)
  -> plan per type -> execute with parallel subagents -> synthesize.
- Subagent-count rubric: simple 1, standard 2-3, medium 3-5, high 5-10, hard max 20; "prefer fewer,
  more capable subagents"; default 3.
- Delegation brief contents: 1 core objective, expected output format, background + how it fits,
  key questions, sources to use/avoid and source-quality bar, tools to use, scope boundaries.
- Lead coordinates and synthesizes; never delegates the final report; stops when returns diminish.
- Citations are a separate agent's job (lead writes no citations).
- Parallel tool calls required for launching subagents.

Pattern (subagent):
- Sets its own "research budget" in tool calls by difficulty (<5 simple, ~5 medium, ~10 hard,
  up to 15); hard limit 20 tool calls / ~100 sources, then `complete_task`.
- OODA loop (observe, orient, decide, act) per step.
- Source-quality section: flag speculation, aggregators, marketing language; report issues to lead
  instead of stating them as facts. Report is dense and condensed.

Harness-builder reuse:
- Template for the harness builder's own research phase and for any research agent it generates.
- Put an explicit tool-call budget + stop condition in every generated subagent prompt.
- Use the brief checklist as a lint for generated `Agent` prompts (INFERENCE).

## 6. Agent SDK 00 — One-liner research agent
URL: https://github.com/anthropics/claude-cookbooks/blob/main/claude_agent_sdk/00_The_one_liner_research_agent.ipynb

Pattern:
- `query(prompt, options=ClaudeAgentOptions(model, allowed_tools=["WebSearch"], setting_sources=[]))`
  = stateless one-shot agent run; async-iterate messages.
- `setting_sources=[]` isolates the run: since claude-agent-sdk 0.2 the SDK otherwise loads user and
  project Claude Code settings (CLAUDE.md, MCP servers, hooks) like the CLI.
- Permissions: `allowed_tools` run without approval; others need approval; `disallowed_tools`
  removes tools from context entirely.
- `ClaudeSDKClient` (async context manager) keeps conversation state across `query()` /
  `receive_response()` turns; options `cwd`, `system_prompt`, `max_buffer_size` (default 1MB; raise
  for images).
- Stateless `query()` for independent/parallel tasks and fresh context; stateful client for
  multi-turn investigations.

Harness-builder reuse:
- Baseline vs. with-harness eval runs: the key lever is `setting_sources`. `[]` = no-skill
  baseline; loading `"project"` = the harness under test (INFERENCE: confirm which sources load
  skills/agents in the current SDK version before relying on it).
- Run each eval case as a stateless `query()` so cases cannot contaminate each other.
- Capture the full message stream per case for transcript grading and token accounting.

## 7. Agent SDK 01 — Chief of Staff agent (full harness anatomy)
URL: https://github.com/anthropics/claude-cookbooks/blob/main/claude_agent_sdk/01_The_chief_of_staff_agent.ipynb
(project dir: claude_agent_sdk/chief_of_staff_agent/ with .claude/agents, commands, hooks,
output-styles, scripts/, CLAUDE.md)

Pattern:
- CLAUDE.md in `cwd` = onboarding context, not a constraint; the agent still prefers granular data
  files when present. Put pointers to where detailed data lives + when to use which.
- Scripts in `scripts/` run via Bash; document them (purpose + call syntax) in CLAUDE.md or in the
  subagent's .md file that uses them.
- Output styles: `.claude/output-styles/<name>.md` (frontmatter name = filename, case sensitive);
  select with `settings='{"outputStyle": "executive"}'`. They replace the SWE-focused system prompt.
- Plan mode: `permission_mode="plan"`; headless it tries `ExitPlanMode`, so continue with a
  follow-up query. Robust capture: ask for `<plan>` tags + "do not use Write", then fall back to
  Write-tool content, then `~/.claude/plans/` (<5 min old); enforce min length (200 chars) to
  reject empty matches.
- Slash commands: `.claude/commands/<name>.md`, frontmatter + prompt with `$ARGUMENTS`, `$1`...;
  "syntactic sugar for users, not new agent capabilities".
- Hooks: scripts in `.claude/hooks/`, wiring in settings JSON (`PostToolUse` matcher Write/Edit,
  `$CLAUDE_PROJECT_DIR/...`); used for audit logs (report_history.json, tool_usage_log.json).
- setting_sources semantics: "project" = .claude/settings.json + CLAUDE.md + commands + agents;
  "local" = .claude/settings.local.json (needed for hooks there); "user" = ~/.claude. Unset loads
  all (since 0.2); `[]` isolates.
- Subagents: `.claude/agents/<name>.md` with frontmatter name, description, tools + system prompt;
  enable `"Agent"` in allowed_tools (was `Task` before 0.2); the description drives delegation.

Harness-builder reuse:
- This directory layout IS the harness artifact set to generate: CLAUDE.md, agents/, commands/,
  hooks/, output-styles/, scripts/.
- Use PostToolUse logging hooks during evals to record which skills/scripts/agents fired (cheap,
  deterministic telemetry for "did the harness get used").
- Use plan-mode + tagged plan capture when the builder must show a harness design for approval.

## 8. Agent SDK 02 — Observability agent (MCP)
URL: https://github.com/anthropics/claude-cookbooks/blob/main/claude_agent_sdk/02_The_observability_agent.ipynb

Pattern:
- `mcp_servers={"git": {"command": "uv", "args": [...]}}` / GitHub MCP via `docker run -i --rm`
  with token passed in `env`.
- `allowed_tools=["mcp__github"]` (server-prefix wildcard) only controls permission prompting, not
  availability. To restrict, add `disallowed_tools=["Bash","Agent","WebSearch","WebFetch"]`,
  otherwise the agent may use Bash `gh` instead of the MCP tools.
- `permission_mode="acceptEdits"`, `setting_sources=[]` for a self-contained run.
- Task prompt states read-only scope explicitly ("Do not create issues or PRs") and an output
  shape (numbered sections, priority levels, audience).
- Prompt-level tool-call budgets ("Just do 3 tool calls", "only one tool call").
- Result is `messages[-1].result` (the final ResultMessage).

Harness-builder reuse:
- When an eval tests "does the agent use tool X", enforce it with `disallowed_tools` for the
  alternatives; otherwise results measure tool preference, not capability.
- Pin the eval environment: explicit `mcp_servers`, `allowed_tools`, `disallowed_tools`,
  `setting_sources` per run config, stored with the result for reproducibility (INFERENCE).

## 9. Agent SDK 08 — Dynamic workflows (orchestration as a script)
URL: https://github.com/anthropics/claude-cookbooks/blob/main/claude_agent_sdk/08_Dynamic_workflows.ipynb

Pattern:
- Claude writes a JavaScript orchestration script and passes it to the `Workflow` tool; runtime runs
  it in the background. Requires CLI >= 2.1.154 (claude-agent-sdk >= 0.2.90). Trigger from SDK:
  `allowed_tools=[..., "Workflow"]` + prompt "Use a workflow to ...".
- Limits: up to 16 concurrent agents, max 1,000 per run; script cannot touch FS/shell (only its
  agents can); resumable within the same session; completed agents return cached results on retry.
- Primitives: `meta {name, description, phases}`, `agent(prompt, {label, phase, schema, model})`
  (clean context, sees only its prompt), `parallel([...])` barrier, `pipeline(items, stage1, ...)`
  per-item streaming, `phase()`, plain JS between calls (zero-token filtering/merging), `return`.
- Decision table: single agent (fits one context, no independent verification) < subagents (few
  specialized workers, lead adapts) < workflow (outgrows one context, verification must be
  structural, or orchestration is worth keeping/repeating).
- Worked example = fan-out + adversarial verification: EXTRACT (structured claims) -> VERIFY (one
  agent per claim, verdict confirmed/contradicted/unverifiable + exact quoted lines, JSON schema)
  -> SKEPTIC (only on "confirmed", tries to refute) -> REPORT. Graded against a planted answer key.
- Telemetry: `TaskProgressMessage.usage` (tool_uses, total_tokens, duration_ms),
  `TaskNotificationMessage` (status, summary), `ResultMessage.total_cost_usd` (one per turn; keep last).
- Per-stage model routing (cheap model for extraction, strongest for judgment) or global
  `CLAUDE_CODE_SUBAGENT_MODEL`. Scripts save to `.claude/workflows/` and re-run by name.
- "The harness you describe is the harness you get" - the prompt sets verification depth and cost.

Harness-builder reuse:
- Eval runner as a workflow: pipeline(case -> run-with-harness, run-baseline -> grade -> skeptic)
  with schema-typed verdicts; plain JS aggregates pass rates at zero token cost (INFERENCE).
- Seed eval data with planted defects + an answer key, as here, to measure judge recall.
- Only route "pass" verdicts to a skeptic to keep cost down while catching false passes.
- Record `total_cost_usd` and token usage per run for the cost/accuracy optimization target.

## 10. Skills 03 — Building custom skills
URL: https://github.com/anthropics/claude-cookbooks/blob/main/skills/notebooks/03_skills_custom_development.ipynb
(examples: skills/custom_skills/analyzing-financial-statements/SKILL.md etc.)

Pattern:
- Layout: `SKILL.md` (only required file) + optional extra top-level .md (REFERENCE, EXAMPLES,
  TROUBLESHOOTING) + `scripts/` + `resources/`.
- Frontmatter: `name` (<=64 chars, lowercase alnum + hyphens), `description` (<=1024 chars).
  Instructions recommended under 5,000 tokens.
- Progressive disclosure, 3 stages: metadata always visible -> .md instructions when relevant ->
  scripts/resources during execution.
- Example SKILL.md sections: Capabilities, How to Use, Input Format, Output Format, Example Usage
  (sample trigger prompts), Scripts (one line each), Best Practices.
- API: `client.skills.create(display_name, files=files_from_dir(path))`;
  `client.skills.versions.create(skill_id, files=...)` for a new version; use via
  `container={"skills":[{"type":"custom","skill_id":..., "version":"latest"}]}` + code_execution
  tool + betas `code-execution-2025-08-25`, `files-api-2025-04-14`, `skills-2025-10-02`.
  Custom and Anthropic skills compose in one container (e.g. brand + pptx).
- Design principles: single responsibility, composition over mega-skill, scripts with unit tests
  in `tests/`, lazy loading of reference files, never put credentials in skills.
- Display titles must be unique; versioning supports rollback.

Harness-builder reuse:
- Skill template to generate; lint it: name regex, description length, SKILL.md token count,
  every script referenced in SKILL.md exists (INFERENCE: lint rules derived from the stated limits).
- Put "Example Usage" trigger phrases in SKILL.md; reuse them as positive eval cases for skill
  triggering (INFERENCE).
- Deterministic work goes into `scripts/` with unit tests, not into prose.
- Version every skill change (git tag or API version) so an optimization can be rolled back.

## 11. Tool Evaluation (agent self-reports tool feedback)
URL: https://github.com/anthropics/claude-cookbooks/blob/main/tool_evaluation/tool_evaluation.ipynb
(eval file: tool_evaluation/evaluation.xml)

Pattern:
- Eval file = XML `<task><prompt/><response/></task>` with exact ground-truth answers.
- System prompt forces 3 tagged sections: `<summary>` (steps, tools used in order and why, inputs,
  outputs), `<feedback>` (critique tool names, parameter docs, descriptions, errors, token bloat;
  specific + actionable), `<response>` last; `NOT_FOUND` if unsolvable; "just the number / just
  the ID" for exact-match grading.
- Agent loop: `while stop_reason == "tool_use"`; every tool_use gets a tool_result in ONE user
  message; tool exceptions returned as error text + traceback (not raised).
- Per-tool metrics: call count + durations. Score = exact match.
- Report: accuracy, avg task duration, avg tool calls/task, total tool calls; per task: expected
  vs actual, tool-call JSON, summary, feedback.
- The demo calculator tool deliberately has empty descriptions, so the agent's feedback exposes
  bad tool design.

Harness-builder reuse:
- Add a `<feedback>` section to eval-run prompts: the agent critiques the skills/commands/tools it
  used; feed that into the optimizer as improvement hypotheses.
- Track tool-call count and duration per case as efficiency metrics alongside accuracy.
- `NOT_FOUND` sentinel distinguishes "gave up" from "wrong" (useful failure taxonomy).

## 12. Managed Agents — Outcomes: verify with an outcome grader
URL: https://github.com/anthropics/claude-cookbooks/blob/main/managed_agents/CMA_verify_with_outcome_grader.ipynb

Pattern:
- Writer agent + independent grader in its own fresh context, same model + tools as writer; it
  cannot see writer reasoning. Loop: writer turn -> grader per-criterion verdict -> feedback -> revise.
- API (beta `managed-agents-2026-04-01`): event `user.define_outcome` with `description` (writer
  reads), `rubric` `{type:"text"|"file"}` (grader reads), `max_iterations` (default 3, max 20).
  Terminal states: satisfied, max_iterations_reached, failed, interrupted. Events
  `span.outcome_evaluation_start/end` (result, explanation).
- Default failure mode: a grader that approves everything. Fix with rubric principles:
  1) each criterion checkable and MORE specific than the task; 2) grader must earn `satisfied` with
  evidence (fetched page, traced formula, file:line); 3) describe the goal, not the steps (a
  prescribed command that is unavailable fails silently); 4) anticipate writer shortcuts ("do NOT
  corroborate via mirrors or snippets"); 5) mandate feedback format (one-line scoreboard, then one
  bullet per failure: what is wrong + what to do); 6) a no-fire list (style nits, pre-existing
  issues, scope creep) and self-check each finding.
- No rubric yet: give Claude a known-good artifact, have it analyze what makes it good, convert to criteria.
- Description and rubric must agree (artifact location/format) or the loop returns `failed`.
- If every run hits the cap with the same issue, the writer cannot act on feedback: stop paying.
- Rubric in the writer's system prompt helps aim, but self-grading is not a substitute for an
  independent grader.

Harness-builder reuse:
- The rubric principles are the spec for every LLM-judge prompt the builder writes.
- Judge output = "Coverage N/K" scoreboard + failure bullets -> parseable score + actionable
  optimizer feedback in one call.
- Non-convergence detector: same failure category across iterations -> stop and escalate.
- Bootstrapping rubrics from a gold example fits the "research domain" phase.

## 13. Managed Agents — Prompt versioning and rollback
URL: https://github.com/anthropics/claude-cookbooks/blob/main/managed_agents/CMA_prompt_versioning_and_rollback.ipynb

Pattern:
- `agents.create` returns `version: 1`; each `agents.update(id, version=current, system=...)`
  makes a new immutable version. `sessions.create(agent={"type":"agent","id":..,"version":N})`
  pins; a bare ID gets latest. `agents.versions.list(id)` lists versions.
- Labelled test set (20 tickets, 5 per class, JSONL) scored per class per version
  (`hits[team] = [correct, total]`); compare v1 vs v2 per class and flag `<-- regressed`.
- Lesson in the demo: a broad "apply this rule first, do not second-guess" rule raised one class
  and regressed another (billing tickets mention API usage too).
- Governance: creating versions is cheap/exploratory; the production pin is what goes through
  review. Canary a traffic slice before promotion. Rollback = re-pin the old version.

Harness-builder reuse:
- Score every harness change per category, not just overall; a net-neutral change can hide a
  regression in one slice. Block promotion on any per-category regression (INFERENCE: policy choice).
- Keep each harness version addressable (git tag/commit) and keep the eval report beside it so
  rollback is a pointer change.
- Watch for over-broad "always do X first" instructions; they are a common regression source.

## 14. Generate synthetic test cases for a prompt template
URL: https://github.com/anthropics/claude-cookbooks/blob/main/misc/generate_test_cases.ipynb

Pattern:
- Extract `{{VAR}}` names by regex; build a generator prompt: `<Prompt Template>`, `<variables>`
  names, optional `<examples>` of prior cases, then `<planning>` (1. summarize the template's goal;
  2. per variable: who supplies it in prod, length, format, tone, semantic content), then a
  `<variables>` block with one tag per variable.
- Diversity: feed each generated case back as an example; instruct "same distribution, but
  sufficiently different that it provides additional signal".
- Steerable: capture the `<planning>` text, edit it (e.g. "numbered Q&A"), pass it back with "use
  exactly this plan" to shift the whole distribution.
- Golden answers: write them, or let Claude draft and a human edit. Generated cases double as
  multishot examples (with prompt caching to afford many).

Harness-builder reuse:
- Generate eval tasks for a new domain from the harness's trigger/task template; accumulate prior
  cases as examples to avoid near-duplicates.
- Keep the editable planning text as the "distribution spec" of the eval set; version it.
- INFERENCE: hold out generated cases from any examples placed inside the harness to avoid
  teaching to the test.

## 15. Metaprompt (prompt writer for the blank-page problem)
URL: https://github.com/anthropics/claude-cookbooks/blob/main/misc/metaprompt.ipynb

Pattern:
- A long multishot prompt: ~6 `<Task Instruction Example>`s of good prompts, then `<Task>`.
- Output protocol: `<Inputs>` (minimal, non-overlapping variables; rarely >2-3) ->
  `<Instructions Structure>` (plan placement; long variables BEFORE the directions that use them)
  -> `<Instructions>` (the template, variables as `{$NAME}` wrapped in XML tags).
- Rules baked in: justification before score; scratchpad/inner-monologue tags only for complex
  tasks; name output tags without writing empty open/close sections.
- Claude 4.6+ models reject prefill; the notebook replaced prefill with appended plain
  instructions (e.g. "must use exactly these input variables") and checks `stop_reason` to catch
  truncation before parsing.
- Then test the template on example variable values (see entry 14 for generating them).

Harness-builder reuse:
- Use as the first-draft generator for agent/skill system prompts; then optimize with evals.
- The rules are a lint list for generated prompts: long context first, reasoning before verdict
  in judges, XML-delimited inputs.
- No prefill on current models: steer output format by instruction + parse + `stop_reason` check.

## 16. Context engineering: memory vs. compaction vs. tool-result clearing
URL: https://github.com/anthropics/claude-cookbooks/blob/main/tool_use/context_engineering/context_engineering_tools.ipynb

Pattern:
- Context rot: recall degrades as context grows even below the hard limit; prefill latency scales
  with context. Goal = smallest set of high-signal tokens.
- Three primitives (API names / betas as given in the notebook table):
  - Compaction `compact_20260112` (beta `compact-2026-01-12`): whole-transcript summary; trigger
    default 150K, min 50K; `instructions` REPLACES the default summary prompt; `pause_after_compaction`.
    Serialize the block back as `{"type":"compaction","content":...}`. Lossy: big facts survive,
    obscure specifics (one table cell) often do not.
  - Tool-result clearing `clear_tool_uses_20250919` (beta `context-management-2025-06-27`): replaces
    old tool_result bodies with placeholders, keeps tool_use records; `trigger` (default 100K),
    `keep` (default 3), `clear_at_least`, `exclude_tools`, `clear_tool_inputs`. No inference cost;
    invalidates cache prefix, so use `clear_at_least`. `clear_thinking_20251015` must be first in
    `edits`. Response `context_management.applied_edits` reports what was cleared.
  - Memory tool `memory_20250818` (client-side file backend; auto-injected "view memory first,
    assume interruption" protocol). Guard path traversal; cap sizes.
- Each solves a different problem: compaction = all in-session growth; clearing = tool-result
  bloat; memory = cross-session persistence. Combine with `exclude_tools: ["memory"]`.
- Memory prompting: topical guidance ("only write X"), keep folder organized ("do not create new
  files unless necessary"), initializer session that pre-seeds progress log + checklist.
- Measurement method: same task run baseline vs. each primitive; plot per-turn input-token
  trajectory; count file reads; probe the compaction summary for specific facts; memory benefit
  measured as Session-2-with vs Session-2-without on the same follow-up task.
- When NOT to use: skip memory for independent sessions; skip compaction if sessions stay short
  (paying fidelity for nothing); skip clearing when the agent must compare past results side by side.

Harness-builder reuse:
- Optimization lever map for long-running harnesses: pick the primitive by which growth type the
  eval transcripts show (tool bloat vs. dialogue vs. cross-session).
- Evaluation design to copy: per-turn token trajectory + fact-probe recall + re-fetch counts, all
  against a no-management baseline on the identical task.
- Claude Code itself = compaction + CLAUDE.md (user-written) + auto memory (model-written); the
  harness's STATE/notes files play the "memory" role (INFERENCE).

## 17. Programmatic Tool Calling (PTC)
URL: https://github.com/anthropics/claude-cookbooks/blob/main/tool_use/programmatic_tool_calling_ptc.ipynb

Pattern:
- Claude writes code in the code-execution container that calls your tools in a loop; tool results
  go to the container, not the model context. Only the code's output reaches the model.
- Enable per tool with `allowed_callers` (`["code_execution_20250825"]`, or add `"direct"` for
  both); tools without it stay model-only. Opt in only tools safe for repeated execution.
- Beta `advanced-tool-use-2025-11-20`; pass `container_id` for stateful multi-turn; `tool_use.caller`
  tells direct vs programmatic calls; you still return tool results via the API.
- Fits large, noisy results (hundreds of expense records with metadata) and sequential dependency
  chains (fetch -> aggregate -> conditional lookup).
- Measured baseline vs PTC: total tokens, elapsed time, API call count. PTC used MORE API calls
  here but far fewer tokens.

Harness-builder reuse:
- Optimization lever: when eval transcripts show bulky tool output, move aggregation into a script
  (in Claude Code terms: a skill `scripts/` file run via Bash that prints only the summary).
- Report tokens, latency and call count together; one metric alone misleads (PTC raises call count).

## 18. Tool search with embeddings
URL: https://github.com/anthropics/claude-cookbooks/blob/main/tool_use/tool_search_with_embeddings.ipynb

Pattern:
- Problem: beyond ~100 tools, upfront definitions cost context, latency, and selection accuracy.
  Claim: one `tool_search` meta-tool cuts context usage 90%+.
- `tool_to_text()` = "Tool: name / Description / Parameters: p (type): desc"; embed with
  SentenceTransformer `all-MiniLM-L6-v2` (384-dim); cosine similarity; top-k.
- Handler returns `{"type":"tool_reference","tool_name":...}` blocks, not full definitions; header
  `anthropic-beta: advanced-tool-use-2025-11-20` enables tool definitions in tool results.
- Loop with `max_turns` cap; stop on `end_turn`.
- Observation: the sample request passes `TOOL_LIBRARY + [TOOL_SEARCH_DEFINITION]` in `tools`; I did
  not find a `defer_loading` flag in the notebook text, so how the library is hidden from the
  initial context is not visible in this source (UNVERIFIED; check the tool-search docs).

Harness-builder reuse:
- Same idea as skill progressive disclosure: only names/descriptions are always loaded, so the
  description text is the retrieval key. Write skill/agent descriptions as search targets:
  name + what + when + key parameters (INFERENCE).
- Eval: "did the right skill/tool get selected for query Q" is a cheap code-graded check.

## 19. Prompt caching
URL: https://github.com/anthropics/claude-cookbooks/blob/main/misc/prompt_caching.ipynb

Pattern:
- Claim: >2x latency reduction, up to 90% cost reduction for repetitive tasks.
- Automatic caching: top-level `cache_control={"type":"ephemeral"}` on `messages.create`; the
  breakpoint auto-moves forward in multi-turn (anthropic>=0.83.0 in the notebook).
- Explicit: `cache_control` on content blocks; up to 4 breakpoints (automatic uses one slot);
  combine (explicit on system, automatic for conversation).
- Facts stated: min cacheable length is model-dependent (e.g. 512 tokens on Opus 5.5); TTL 5 min,
  refreshed on hit; 1-hour TTL at 2x base input; writes 1.25x base input; reads <=0.1x.
- Measure via `usage.cache_creation_input_tokens` / `cache_read_input_tokens` + wall time;
  baseline vs write vs hit. Unique timestamp prefix avoids stale cache between runs.

Harness-builder reuse:
- Eval runs repeat the same large prefix (system prompt + skill text + fixtures) across many cases:
  order prompts stable-first, variable-last so cases share a cached prefix (INFERENCE).
- Log cache read/write tokens per run; a cost optimization that breaks prefix stability shows up
  as falling cache reads.
- Note interaction: tool-result clearing and compaction invalidate cached prefixes (entry 16).

## 20. Automatic context compaction (runner-driven)
URL: https://github.com/anthropics/claude-cookbooks/blob/main/tool_use/automatic-context-compaction.ipynb

Pattern:
- Two modes: server-side `context_management` (auto at a trigger >= 50K) vs runner-driven: your
  loop checks `message.usage.input_tokens` against your threshold (or a natural boundary like
  "after every N completed items") and calls `runner.compact_before_next_turn()`, optional
  `{"type":"summarize","instructions": "..."}` (replaces the default prompt).
- Beta string in this notebook: `compact-2026-09-04` (entry 16 lists `compact-2026-01-12` for the
  server-side edit; the two notebooks name different betas - check the docs before use).
- Runner finishes pending tool calls first (cannot compact with an unanswered tool call); compaction
  turn has `stop_reason == "compaction"` with one `compaction` block, sent back first and unmodified;
  its usage is under `usage.iterations`.
- Demo: 5 tickets x 7 steps = 35 tool calls; baseline cumulative input >100K tokens; with
  compaction, per-turn input drops after each compaction while output quality is compared.
- Custom instructions name what must survive (ticket IDs, categories, priorities, teams).
- Measurement caveat: with caching, history is in `cache_read_input_tokens`; server tool loops
  report multiple `usage.iterations`. Count the right counters or the trigger fires wrong.

Harness-builder reuse:
- For batch-style harnesses (process N items), compact at item boundaries with instructions that
  list the per-item fields to keep.
- Token accounting in eval reports must sum input + cache read + cache write + iterations, or
  cost comparisons between harness variants are wrong.

## 21. Latency optimization (eval-driven lever sweep) + desk_agent grader
URLs: https://github.com/anthropics/claude-cookbooks/blob/main/latency_optimization/latency_optimization.ipynb
and https://github.com/anthropics/claude-cookbooks/blob/main/latency_optimization/desk_agent/grade.py

Pattern (optimization method):
- Start with an eval + a quality bar fixed BEFORE looking at results (here: >=95% accuracy on 154
  tasks across 3 job types sorted by difficulty), plus the product's latency target (p90 TTFT for
  voice, p50 TTLT for chat). Run each config 3 times; call a change significant only if a bootstrap
  test gives p < 0.05 (baseline p90 varied 1.6 s between rounds).
- Model: TTLT ~= calls x TTFT + output tokens / OTPS + other latency.
- Triage levers into clear wins (caching: -85% cost, no accuracy change; streaming; turn cap +
  last-call message + timeout; structured answer tool), ruled out (with a one-line reason each),
  and needs-testing; then run every combination of the shortlist (32 settings, 25 cleared the bar)
  and pick the fastest setting that clears the bar per product.
- Findings worth reusing: "fix the loop before the model" (prefetch the always-first lookup: -13%
  p50; bigger pages: -10%); output is usually where time goes (2-line answer shape cut 46.4 s to
  4.9 s and thinking from ~2,100 to ~300 tokens); lower effort until accuracy slips; smaller models
  can write more tokens and finish later; thinking off on Haiku cost 24 accuracy points; subagents
  on a small model for independent lookups (9.5 s -> 5.7 s).
- Worst-case bounds: `max_tokens` (catch `stop_reason: "max_tokens"`), turn cap (16) with a
  "next call is your last" message, wall-clock timeout; optional task budget or clock appended to
  the latest user message (signals the model can pace to).
- Per-turn effort change via per-message form keeps the cache; changing top-level effort, tools,
  model or thinking invalidates it.
Pattern (grader, grade.py):
- Answer must go through a "recorder" tool call; grader normalizes harmless form differences
  ("$1,200" -> 1200, upper-case verdict, IDs as list/JSON/CSV) BEFORE comparing, then emits flat
  sub-scores (answered, right_recorder, verdict_ok, amount_ok within 0.5, ids_missed, ids_extra,
  template_ok...) plus `correct`. Wrong-shape answers keep failing marks (no crash).

Harness-builder reuse:
- The optimizer loop to copy: fixed quality bar -> baseline x3 -> lever triage -> combination sweep
  -> bootstrap significance -> choose cheapest/fastest config above the bar. Applies to tokens and
  cost as much as latency.
- Force final answers through a structured recorder (tool or JSON schema) so grading is code-based
  with diagnostic sub-scores, not one boolean.
- Put turn cap, last-call warning and timeout into every harness agent loop.

## Addendum A. Summarization LLM-eval (promptfoo custom assert)
URL: https://github.com/anthropics/claude-cookbooks/blob/main/capabilities/summarization/evaluation/custom_evals/llm_eval.py

- Judge scores 4 dimensions 1-5 (conciseness, accuracy, completeness, clarity) + explanation, as
  JSON inside `<json>`; `stop_sequences=["</json>"]`; parse outermost `{...}` (tolerate preamble,
  fences, a leading thinking block). Average numeric fields; `get_assert` returns
  `{"pass", "score", "reason"}` against a threshold for promptfoo.
- Note: the code divides the 1-5 average by 4 and compares to 0.5, so the normalization looks
  inconsistent (my reading, not a cookbook claim). Reuse the shape, recheck the arithmetic.

## Relevant but not read (cap reached)
- tool_use/memory_cookbook.ipynb, misc/session_memory_compaction.ipynb,
  extended_thinking/extended_thinking_with_tool_use.ipynb, cost_optimization/cost_optimization.ipynb,
  managed_agents/CMA_iterate_fix_failing_tests.ipynb, CMA_plan_big_execute_small.ipynb,
  CMA_coordinate_specialist_team.ipynb, evals/agentic_search/.

