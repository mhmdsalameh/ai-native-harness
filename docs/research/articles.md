# Anthropic articles — harness-building practices

Source index: https://claude.com/resources/articles (JS-paginated, "303" items; discovered via category pages + WebSearch site: queries).
Fetched 2026-11-07 via WebFetch (a small model summarizes each page; quotes are as returned by it). [INFERRED] marks my inference, not article text.

## 1. Agent harness design: 3 patterns for harnessing Claude's intelligence
URL: https://claude.com/resources/articles/harnessing-claudes-intelligence
- Start from general tools Claude knows (bash + text editor): Claude 3.5 Sonnet hit 49% SWE-bench Verified with only those. Skills, programmatic tool calling, memory tool are all built on bash+editor — compose primitives instead of new tools.
- Give a code-execution tool so Claude chains tool calls and filters results in code; "Only the output of code execution reaches Claude's context window." Model-side filtering on BrowseComp (Opus 4.6): 45.3% -> 61.6%.
- Progressive disclosure: preload only skill YAML frontmatter; full SKILL.md read on demand. Keep system prompt lean — rarely used task-specific instructions waste attention budget and cost.
- Context editing removes stale tool results/thinking; subagents isolate work in fresh windows (+2.8% BrowseComp over best single agent).
- Memory: a memory folder Claude writes/rereads (Sonnet 4.5 BrowseComp-Plus 60.4% -> 67.2%). Failure mode: transcript-style memory (Sonnet 3.5 Pokemon: 31 near-duplicate files, stuck after 14,000 steps). Target: tactical organized notes + a "learnings" file distilled from failures (Opus 4.6: 10 files).
- Prompt caching: cached tokens ~10% of base input cost. Static first, dynamic last; append updates as messages (`<system-reminder>`) not prompt edits; don't switch models mid-session (use a subagent for a cheaper model); tool-set changes invalidate cache — use tool search (appends) for dynamic discovery; move cache breakpoint to latest message.
- Promote high-stakes actions from bash strings to typed tools so the harness can gate/render/audit/replay; gate by reversibility; staleness check on write tools (refuse edit if file changed since last read). Auto-mode uses a second Claude as judge of bash commands.
- Re-audit harness at each model change: "what can I stop doing?" Example: context resets added for Sonnet 4.5 "context anxiety" were removed for Opus 4.5.

## 2. Building agents: When to fold subagents into your main agent loop (Oct 22, 2026)
URL: https://claude.com/resources/articles/building-agents-when-to-fold-subagents-into-your-main-agent-loop
- Default architecture: one model, one context window, open-ended tool loop; harness sets turn/cost budgets + write gates; model batches tool calls, harness runs them in parallel; model writes a plan turn 1 and revises it; optional verifier/goal check after the answer.
- Where things go: domain procedure/ordering -> skills; validation, approval gates, mid-conversation lookups -> tools; cheap always-relevant steps (entity resolution) -> plain code. Reference material (policies, specs) behind lookup tools or skill reference files — not code that pastes context into prompts.
- Keep a subagent only when: measurable quality loss from context bloat; parallel tasks needing disposable fresh windows; tool-choice confusion or conflicting instructions. Fold when tightly coupled with another specialist or doesn't talk to user. "Split by context, not by org chart" — problem-type splits cause a lossy "telephone game".
- Numbers: single loop ~2x faster than a customer's multi-agent harness; single agent + skills often beat one-prompt and subagent designs on quality at lower cost/latency; Claude Code system prompt cut >80% by moving skills/tools to progressive disclosure; tool choice degrades past 30-50 tool definitions — group tools by user intent, not one per API.
- Evals first: ~10 golden examples to start; central end-to-end set + small per-skill sets; rubric-grade final answers; track whether the right skill loaded/tool called; timestamp key events for replay. Run each eval task more than once — a regression appeared in only 1 of 2 runs. Compare per-task deltas, not only aggregates.
- Migration: merge coupled specialists; convert kept subagents into tools (shared response schema, baseline score); fold one at a time (prompts -> skills, API calls -> MCP tools); keep subagent only if folded scores worse. Tool search + deferred loading for big catalogs. Hard preconditions inside tools (Y checks X's output, returns an actionable instruction); per-user permissions enforced in tools with plain refusals.
- Failure modes: lossy inter-agent summaries, subagent sprawl, "Frankenprompt" (teams appending conflicting rules), localized evals, nested-loop latency.
- Named commands: /claude-api build-eval, prompt-audit (flags instructions written for older models), hillclimb, cost-optimize (one-at-a-time savings: caching, trimming, effort, model); /skill-creator (author + audit/trim/dedupe); /skill-doctor (per-skill cost and usage, dead weight). Repo: anthropics/single-agent-loop-kit. Principle: "measure, change one thing at a time, keep what holds up."

## 3. Steering Claude Code: when to use CLAUDE.md, skills, hooks, and subagents
URL: https://claude.com/resources/articles/steering-claude-code-skills-hooks-rules-subagents-and-more
- Load/compaction/cost table: root CLAUDE.md (session start, re-read after compaction, HIGH cost); subdir CLAUDE.md (loads when a file in dir is read, LOW); unscoped rules `.claude/rules/` (start, re-injected, MEDIUM); path-scoped rules (on matching file touch); skills (name+description at start, body on invoke, re-injected up to shared budget, oldest dropped first, LOW); subagents (name/description/tools at start, only final message returns, LOW); hooks (lifecycle events, bypass compaction, LOW); output styles (system prompt, never compacted, HIGH); --append-system-prompt (per invocation).
- CLAUDE.md: "Keep CLAUDE.md under 200 lines, give it an owner, and review changes to it like code." Facts needed always (build cmds, layout, conventions); index pointing to other files; explain reasoning behind constraints; include examples. Failure: shared files grow by appending, never pruned — every line costs tokens every session and dilutes adherence. `claudeMdExcludes` to skip other teams' subdir files.
- Path-scoped rule format: `.claude/rules/*.md` with frontmatter `paths: ["src/api/**", "**/*.handler.ts"]`. Use for scattered cross-cutting constraints (e.g. "migrations are append-only"); unscoped rules cost tokens every session.
- Decision rules: procedure of ~30 lines -> skill; reliable behavior -> hook ("The model choosing to run a formatter is different from the formatter running automatically."); hard prohibitions -> hooks/permissions/managed settings ("A real guardrail needs to be deterministic" — instructions fail under pressure, long sessions, prompt injection); noisy side task -> subagent; procedure you want to watch/steer -> skill; bundle -> plugin.
- Subagents: `.claude/agents/*.md`, frontmatter `name`, `description`, optional `model`, tools; body = system prompt; only the final message returns; nest up to 5 levels.
- Hooks: types command, HTTP, mcp_tool (deterministic), prompt, agent (judgment). Registered in settings.json, managed settings, or skill/agent frontmatter. PreToolUse exit code 2 denies a call; stderr reason returns to Claude. Failure mode: hook output that never reaches Claude. Hooks + skills form loops until a stop condition.
- Output styles (`.claude/output-styles/`): highest instruction weight; replace default coding instructions (scoping, comment policy, security, run tests before done) unless `keep-coding-instructions: true`.
- Appended prompt: "the more instructions you provide using this method, the less strictly Claude will follow them."

## 4. Improving skill-creator: Test, measure, and refine Agent Skills
URL: https://claude.com/resources/articles/improving-skill-creator-test-measure-and-refine-agent-skills
- Eval = test prompt (+ optional input files) + description of what good output looks like. (Article gives no file schema.)
- Baseline: run base model without the skill. If it "starts passing your evals _without_ the skill loaded," the skill may be obsolete (capability-uplift skills). Encoded-preference skills (team workflows) are evaluated on fidelity to the actual process instead.
- Blind A/B comparator agents: compare two skill versions or skill vs no skill "without knowing which is which."
- Benchmark mode metrics: eval pass rate, elapsed time, token usage. Run after model updates and while iterating.
- Parallel eval runs, each in "a clean context with its own token and timing metrics" — avoids cross-run contamination. Results local, dashboard, or CI.
- Regression: re-run evals when model or infrastructure changes.
- Description = trigger. Too broad -> false triggers; too narrow -> never fires. Skill-creator tests the description against sample prompts and proposes edits to cut false positives/negatives; improved triggering on 5 of 6 public document skills.
- Example of eval-isolated failure: PDF skill on non-fillable forms; fix "anchors positioning to extracted text coordinates."

## 5. How and when to use subagents in Claude Code
URL: https://claude.com/resources/articles/subagents-in-claude-code
- Use when: research reading "dozens of files"; independent sub-tasks; fresh unbiased review; pre-commit verification (overfitting to tests, missed edge cases); staged pipelines with clear handoffs. Threshold: "ten or more files" to explore or "three or more independent pieces of work."
- Don't use for: dependent sequential work, same-file edits (conflicts), small tasks (overhead), agents that must talk to each other (subagents "can't talk to one another" — agent teams are heavier/more expensive).
- Keep "a handful of well-scoped agents" — a sprawling roster makes automatic delegation less reliable.
- `description` drives auto-delegation; state trigger conditions: "Reviews code for security issues before commits" beats "security expert." Files: `.claude/agents/` (project) or `~/.claude/agents/` (user); system prompt + tool permissions + optional model.
- Tool scoping: research subagent read-only; implementation subagent full edit.
- Stop hook pattern: run tests; on failure return `decision: "block"` + `reason`; check `stop_hook_active` to prevent infinite loops.
- Adoption order: "Start conversational, automate later" — conversational -> custom subagents -> CLAUDE.md delegation policy -> skills -> hooks (once workflows mature).
- Failure modes: vague scope ("explore everything"), passing dependent state awkwardly through files.

## 6. Building agents with Skills: Equipping agents for specialized work
URL: https://claude.com/resources/articles/building-agents-with-skills-equipping-agents-for-specialized-work
- Skill = folder: `SKILL.md` + supporting docs + scripts (example `anthropic_brand/`: SKILL.md, docs.md, slide-decks.md, apply_template.py). Versionable in Git; open standard.
- Frontmatter `name` + `description`; at runtime "only the metadata ... is shown to the model" — description must be specific.
- Progressive disclosure token budget: L1 metadata ~50 tokens (always); L2 SKILL.md body ~500 tokens (on decision); L3 `references/` files 2,000+ tokens (on specific need). Enables hundreds of installed skills.
- Repeatable logic -> scripts: code is "self-documenting, modifiable, and doesn't need to be in context at all times." Docs state the rules/concrete values (e.g. hex colors) and point to the script; don't duplicate. Script prints usage and exits on bad input.
- Mine agent behavior: Claude kept rewriting the same slide-styling script -> saved it as a reusable tool. Repeated work = signal to codify a skill/script.
- Size examples: simple ~100 lines (status report writer), intermediate ~800 lines (financial model builder), complex 2,500+ lines (RNA-seq pipeline).
- Layers: agent loop reasons, runtime executes, MCP connects (data/tools), skills guide (procedure). Skills + MCP complement.

## 7. Skills explained: How Skills compares to prompts, Projects, MCP, and subagents
URL: https://claude.com/resources/articles/skills-explained
- Progressive disclosure numbers here: metadata ~100 tokens; full instructions <5k tokens when matched; bundled files/scripts only as required. (NOTE: differs from article 6's ~50/~500/2,000+ — treat ~100 tokens metadata and <5k body as the upper bound.)
- Decision table: one-off -> prompt; repeated procedure across conversations -> skill; background knowledge for one initiative -> Project; independent task with own tools/context -> subagent; external data/tools -> MCP. "MCP connects Claude to data; Skills teach Claude what to do with that data."
- Switch signals: retyping the same prompt -> skill; "copying the same instructions across multiple Projects, that's a signal to create a skill instead."
- Skill vs subagent: skill when several agents/conversations need the same expertise; subagent for independent execution, specific tool permissions, context isolation. Subagents can use skills (Python subagent + pandas skill).
- Example tool restriction: code-reviewer subagent with Read, Grep, Glob only (no Write/Edit).
- Layered example (research agent): Project = context; MCP = data; skill = method (Drive guide with naming convention `YYYY-MM-DD_DocumentName_vX`, recency window 6 months); subagents = focused execution (market-researcher: Read/Grep/web search; technical-analyst: Read/Bash/Grep); prompts = steering.
- Failure modes are [INFERRED by the summarizer, not a page section]: always-loaded static knowledge wastes context; duplicated instructions drift; unrestricted subagents make unintended changes.

## 8. How Claude Code works in large codebases: Best practices and where to start
URL: https://claude.com/resources/articles/how-claude-code-works-in-large-codebases-best-practices-and-where-to-start
- Agentic search (fs traversal + grep), no RAG index: "doesn't require a codebase index to be built, maintained, or uploaded"; indexes go stale silently. Works best when Claude starts with enough context — setup quality drives results.
- Build order of 5 extension points: CLAUDE.md -> hooks -> skills -> plugins -> MCP; plus LSP (symbol navigation; "one of the highest-value investments" for multi-language repos) and subagents.
- Hooks for continuous improvement: Stop hook reflects on the session and proposes CLAUDE.md updates while context is fresh; start hook loads team/module-specific context dynamically; lint/format enforced deterministically.
- Skills can be path-scoped (payments deploy skill bound to its directory). Plugins bundle skills + hooks + MCP configs for day-one parity.
- Layered CLAUDE.md: root = pointers + critical gotchas only; subdirectory files loaded additively; start sessions in the subdirectory (Claude walks up and loads parents). Scope test/lint commands per subdirectory (full suite = timeouts + wasted context).
- Exclude noise via `permissions.deny` in committed `.claude/settings.json` (generated files, build artifacts, vendored code). Codebase map: root markdown listing each top-level folder with a one-line description when layout isn't self-explanatory.
- Read-only mapping subagent writes findings to a file so the main agent edits with full context.
- Review config every 3-6 months and after major model releases; remove rules compensating for old limits (e.g. forced single-file refactors) and hooks working around fixed tooling gaps (p4 edit hook made redundant by native Perforce mode).
- Org: a DRI owns settings, permissions policy, plugin marketplace, CLAUDE.md conventions; build infrastructure before broad access.

## 9. Maximizing the value of your Claude Code sessions
URL: https://claude.com/resources/articles/maximizing-the-value-of-your-claude-code-sessions
- Cost facts: output tokens ~5x input (thinking counts as output); cache reads ~0.1x input; cache writes up to 2x; cache TTL 1 h on subscription, 5 min on API key (`ENABLE_PROMPT_CACHING_1H=1` extends API to 1 h).
- Request order: tool definitions -> system prompt -> conversation (CLAUDE.md first). A change near the front invalidates everything after. Cache busters: switching /model or /effort mid-session, toggling fast mode on mid-session, /compact, long gaps. Set model/effort at session start.
- `MAX_THINKING_TOKENS=0` for purely routine sessions (exception noted for Fable 5).
- /clear between unrelated tasks; /compact with explicit keep-instructions when a task phase ends; "Compact instructions" section in CLAUDE.md; /rewind instead of /compact to drop recent turns (keeps cache; compacting "always costs something").
- Keep startup small: check with `/context`; move workflow-specific instructions from CLAUDE.md into skills; disable unneeded MCP servers via `/mcp`; put frequent commands in CLAUDE.md with quiet flags (single-file test run, compact reporter).
- Command output stays in context for the whole session: use quiet flags/tail or a hook that trims noisy commands. Outputs >30,000 chars go to a file with a preview (`BASH_MAX_OUTPUT_LENGTH`).
- @-mention a file once (re-mentioning attaches another copy); name targets specifically to avoid exploratory reads.
- Subagents for large noisy jobs (log scans); repeated noisy job -> subagent with `model: haiku` or `model: sonnet` (else inherits main model). Long /loop jobs: run from a fresh session.

## 10. Building agents with the Claude Agent SDK
URL: https://claude.com/resources/articles/building-agents-with-the-claude-agent-sdk
- "give your agents a computer, allowing them to work like humans do." Loop: gather context -> take action -> verify work -> repeat.
- Folder/file structure is context engineering: agent pulls slices with grep/tail; e.g. a "Conversations" folder of past chats. Start with agentic search; add semantic search only for speed/variety (less accurate, harder to maintain, opaque).
- Subagents for parallelism + clean main context; return excerpts not full threads. Compaction for long runs.
- Tools: "your tools should be primary actions you want your agent to take"; they occupy prominent context space and shape which actions are considered. Bash for flexible work; code generation for precise, composable, reusable ops (document generation via scripts); MCP for integrations/auth.
- Verification ladder: (1) rules-based feedback — explicit rules, report which failed and why; lint; typed languages (TS over JS); (2) visual feedback — render + screenshot (Playwright MCP, multiple viewports); (3) LLM-as-judge — "generally not a very robust method", cost/latency, reserve for fuzzy criteria (tone).
- Improvement loop: read outputs, especially failures. Misunderstands task -> missing info, restructure search APIs; repeated failure at one task -> add a formal rule in tool calls that detects/fixes it; can't self-correct -> give more/creative tools; regressions as features grow -> build a representative eval set from real usage.

## 11. The AI-native SDLC playbook
URL: https://claude.com/resources/articles/the-ai-native-sdlc-playbook
- Harness config is code: CLAUDE.md in git, code-owner review; trim to what a new joiner needs day one (build/test/lint cmds, key conventions, recurring errors). Same mistake twice -> correction into CLAUDE.md.
- "A skill is a control, though an advisory one." Policies that must always hold need a hook or PR-level re-check. Test triggering: phrase the same task several ways, confirm the skill loads each time. Skill health metric: count PR findings citing the policy — should trend to zero.
- Hooks: protect paths, format/lint after each edit, keep credentials out; keep per-action hooks fast and file-scoped (full suite at commit/PR). "exit 2 blocks the action; the message goes to Claude" — block message must state the route to approval. Non-negotiable hooks in managed settings with `allowManagedHooksOnly`. Hook blocking test-file edits during bug fixes (prevents weakening checks).
- Evals in CI: seed 20-50 recent real tasks with accepted outcomes; eval = prompt + checks (tests pass, lint clean, behavior unchanged, policy followed). Run on schedule AND on any change to CLAUDE.md/skills/hooks; gate config merges on pass rate. Every incident -> eval. Refresh as cases stop discriminating. Headless: `claude -p`, `--allowedTools` scoped, `--output-format json`, check script; path-filtered PR trigger + nightly cron.
- Verification: every session gets a self-check (tests/build/screenshot diff); wrap in one command exiting non-zero; list commands in CLAUDE.md with example healthy output; define "done" = run checks and paste output. Bug fix: failing test first, confirm fails for the right reason, commit, fix without editing test. UI: 2-3 screenshot rounds normal. Verifier subagent in fresh context reports without fixing.
- Review: REVIEW.md (passes: bugs, security, spec compliance; Important vs nit; nit cap 5; exclusions); authoring agent cannot approve; publish machine-readable severity counts.
- Permissions: pre-approve safe inner loop (git/build/test/lint) to avoid prompt fatigue; tool-level WebFetch deny doesn't stop `curl` — pair with sandbox network allowlist; managed settings `disableBypassPermissionsMode`, `allowManagedPermissionRulesOnly`, sandbox `failIfUnavailable`, `allowUnsandboxedCommands: false`.
- Parallel: one session per worktree; start with 2-3 sessions; parallelism must not outpace review. Autonomous loops: deterministic detection script (30-day rolling baseline), model only on breach; tier by sigma (1σ log, 2σ read-only diagnose, 3σ PR/runbook).

## 12. Make long-running agents faster with message threads (API, public beta)
URL: https://claude.com/resources/articles/message-threads
- `thread` parameter on Messages API: turn 1 sends full conversation; later turns send only new messages + previous response ID. Held in memory (encrypted, not on disk).
- Median TTFT -35% for 500k-1M-token requests in Claude Code (on by default for most users). Token usage and cost unchanged — it is a latency, not a cost, optimization.
- "A thread expires 5 minutes after its last request" — client must handle the fallback of resending the full conversation.
- Best for long coding agents, computer-use (screenshots stay in thread), document/image-heavy flows. Relevance to a Claude Code harness builder is low [INFERRED]: it is API-level, not configurable from skills/hooks.

## 13. The Claude Code guide for startups
URL: https://claude.com/resources/articles/claude-code-guide-for-startups
- Root CLAUDE.md = non-negotiables (architecture rules, security boundaries, invariants, how to verify work); subdir CLAUDE.md for local conventions. Counter-example to 200-line rule: Zingage's grew to 567 lines by listing "every invariant" [tension with article 3]. Tolerate "slightly outdated context files as long as the agent can quickly verify and course correct."
- "Use skills for on-demand procedural workflows"; share via company plugin marketplace; keep standing instructions as markdown skills in a reviewed GitHub repo.
- Loops need "clearly defined" exit criteria in the skill. `/goal` for long tasks where Claude may "prematurely call the job done."
- Fan out subagents for parallel analysis or adversarial review of another agent's output; ask explicitly ("fan out multiple subagents" / "use a workflow"). One subagent = one ticket = one PR (Commure, ~13 tickets).
- Hooks as hard gates for deterministic processes: block writes failing lint, require tests before commit, strip secrets before data leaves sandbox.
- Evals: golden set of verified Q/A pairs; "Maintain multiple sets of evals for their key use cases"; run candidates against golden set + random samples; test "against hundreds of scenarios before shipping"; without evals teams are "flying blind."
- Failure modes: overfitting to examples — "fix the principle, not the example," "cap how many specifics can enter a change at all" (Cainex); plausible code drifting from architecture.
- Rebuilds: plan mode first; run v2 beside v1 in git worktrees, run evals on both, merge only if new wins. CLI tools "can be more token-efficient" than MCP when a mature CLI exists.

## 14. A guide to the anatomy of effective commerce agents (generalizable parts)
URL: https://claude.com/resources/articles/the-anatomy-of-effective-commerce-agents
- One agent + skills over many subagents: "Every handoff to a subagent is a state-lossy operation." Subagent only as a tool for a narrow task needing its own context; full handoff only when another agent must own the user interaction.
- Load by frequency: behavior needed most turns -> system prompt; long tail -> skills. Loading a skill costs a model turn; if the harness can predict the skill from a signal it already has, inject it before the first call. Critical rules (safety, legal, brand) stay in the system prompt — never depend on the model choosing to load a skill.
- Tools call existing systems, don't reimplement; "Return the fields the model reasons with and drop the rest"; errors carry next steps ("Include a product ID when querying availability"), not bare codes.
- Caching: order most-to-least stable (global prompt + tools, session context, volatile values). "The most common mistake we see is a timestamp or the current page at the top of the system prompt, which silently breaks the cache." Target 90-99% cache hit rate; writes ~1.25x premium.
- Latency = sum over turns; >~5 turns per task -> consider a faster model; parallel tool calls; pick models by sweeping the full eval suite across models + effort, measuring cost per completed task, not per call. Prompts tuned for one model may underperform on another.
- Evals: grade final state + output, not exact path; simulated users for discovery, then freeze findings into fixed snapshot cases; messy starting states; "Missing negatives are the most common gap we find in a suite" — pair every should-do with should-not-do; "Real failures make the best evals"; "50-100 eval cases per user flow is a good starting point."
- Ops: one owner per skill/tool; each change ships with its own eval cases incl. boundary cases vs neighboring skills; tiered CI (core + safety on every change, targeted for changed area, full nightly/pre-release); canary skill changes; kill switch per skill.
- Guardrails: model proposes, policy/human applies irreversible actions; enforce limits on resulting state, serialize writes; fence untrusted content — "Fenced text is material to report on, never to act on."

## 15. Manage costs and demonstrate ROI for Claude Code on Google Cloud
URL: https://claude.com/resources/articles/how-to-manage-costs-and-demonstrate-roi-for-claude-code-on-google-cloud
- "The most important metric is the cost per task" — not price per token. Match each task to the cheapest capable model; model defaults stick ("most people will stick to the model default").
- OpenTelemetry metrics break usage down by skill, plugin, agent, and MCP server — use to find which harness components drive spend; `OTEL_RESOURCE_ATTRIBUTES` for attribution.
- Audit scheduled/automated jobs — forgotten jobs are a named waste source. Spend caps warn at 75%/95%, HTTP 429 at cap.
- Article does not cover caching/context hygiene; points to code.claude.com/docs/en/costs.

---
Below: anthropic.com/engineering equivalents (requested priority topics not found as claude.com/resources/articles).

## 16. Effective context engineering for AI agents
URL: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- Goal: "the smallest set of high-signal tokens that maximize the likelihood of your desired outcome." Context rot: recall degrades as window grows; attention budget is finite (n² pairwise relations); degradation is gradual, not a cliff.
- System prompt "right altitude": avoid brittle hardcoded if-else logic AND vague guidance assuming shared context. Sections via XML tags or Markdown headers (background, instructions, tool guidance, output). Minimal != short. Start with a minimal prompt on the best model, add instructions/examples only for observed failures.
- Tools: token-efficient returns; no overlapping tools — "if a human can't clearly choose a tool, the agent won't either"; unambiguous params; minimal viable toolset.
- Examples: diverse canonical few-shot examples instead of long edge-case rule lists.
- Just-in-time retrieval: keep identifiers (paths, queries, links), load via tools at runtime; folder structure/naming/timestamps are signals. Hybrid: preload some (CLAUDE.md) + explore. Start with the simplest approach that works.
- Long-horizon: compaction (tune on complex traces: maximize recall first, then precision; safest form = clearing old raw tool results); structured note-taking (NOTES.md / to-do files outside the window); sub-agents use "tens of thousands of tokens" but return condensed ~1,000-2,000 token summaries.
- Pick: compaction for conversational continuity; note-taking for iterative milestone work; multi-agent for parallelizable research.

## 17. Writing effective tools for agents — with agents
URL: https://www.anthropic.com/engineering/writing-tools-for-agents
- Loop: prototype -> generate eval tasks -> run evals -> analyze transcripts -> let Claude refactor tools -> held-out test set. Claude-optimized Slack/Asana MCP servers beat human-written ones on held-out sets.
- Eval tasks: Claude Code generates dozens of prompt/response pairs grounded in realistic data, not "overly simplistic or superficial 'sandbox' environments"; multi-step ("potentially dozens" of tool calls); verifiable outcome (exact match or LLM judge); avoid over-strict verifiers that reject valid phrasing; optional expected tool calls but don't overspecify the path.
- Run: one simple while-loop per task, single task prompt; ask for reasoning/feedback blocks before tool calls; interleaved thinking. Metrics beyond accuracy: runtime per tool call and task, total tool calls, tokens, tool errors. Tool-call counts reveal consolidation opportunities.
- Analysis: read raw transcripts; "what agents omit in their feedback and responses can often be more important than what they include." Redundant calls -> fix pagination/limits; invalid-param errors -> clearer descriptions/examples (e.g. agent appending "2025" to searches, fixed via description).
- Tool choice: don't wrap every endpoint; `search_contacts` over `list_contacts`; consolidate (`schedule_event`, `search_logs`, `get_customer_context`); distinct purposes. Namespace by service/resource (`asana_search`, `asana_projects_search`); prefix vs suffix had "non-trivial effects."
- Responses: high-signal fields (`name`, `file_type`), drop `uuid`/`mime_type`; resolve IDs to names or 0-indexed IDs; `response_format` enum concise|detailed (72 vs 206 tokens). Pagination/filter/truncation with defaults; Claude Code caps tool responses at 25,000 tokens; on truncation tell the agent how to narrow. Actionable errors, no raw tracebacks.
- Descriptions: write like onboarding a new hire; explicit formats/terminology; `user_id` not `user`; strict data models; small description edits gave large gains (Sonnet 3.5 SOTA on SWE-bench Verified). MCP tool annotations for destructive/open-world.

## 18. How we built our multi-agent research system
URL: https://www.anthropic.com/engineering/multi-agent-research-system
- Orchestrator-worker: lead plans, spawns parallel subagents, synthesizes; separate CitationAgent step. Fit: breadth-first, parallelizable, many tools. Poor fit: shared context / many inter-agent dependencies "such as most coding."
- Token economics: agents ~4x chat tokens, multi-agent ~15x. "token usage by itself explains 80% of the variance" (BrowseComp); tool-call count + model choice explain most of the rest. Opus 4 lead + Sonnet 4 subagents beat single-agent Opus 4 by 90.2%.
- Subagent briefs must state objective, output format, tools/sources, boundaries — vague briefs caused duplicated searches and gaps. Embed scaling rules in the lead prompt (simple fact-find = 1 agent, few calls; complex = many subagents). Early failure: 50 subagents for a simple query.
- Simulate: run the exact prompts/tools step by step to watch failure modes (continuing after enough results). Tool-testing agent rewriting flawed MCP descriptions -> 40% faster task completion.
- Start wide, then narrow queries; extended thinking for lead planning; interleaved thinking in subagents after each tool result. Parallelism: 3-5 subagents at once, 3+ parallel tools each -> up to 90% less research time.
- Evals: start right away with ~20 real-usage queries (early changes have big effects); single LLM-judge call with rubric (factual accuracy, citation accuracy, completeness, source quality, tool efficiency) returning 0.0-1.0 + pass/fail matched humans best; grade outcomes/end state, not paths; keep human testing (caught SEO-content bias).
- Reliability: resume from failure (checkpoints + deterministic retries), full tracing, rainbow deployments. Lead saves plan to memory (context >200k truncated). Subagents write outputs to filesystem and pass lightweight references — avoids "game of telephone" and token overhead.

## 19. Effective harnesses for long-running agents
URL: https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
- Compaction alone is not enough across sessions. Two-part harness: initializer agent (first session) + coding agent (later sessions); they differ only in the initial user prompt — same system prompt, tools, harness.
- Initializer outputs: `init.sh` (starts dev server), `claude-progress.txt` (log), initial git commit, feature list JSON (claude.ai clone: 200+ features).
- Feature list entry fields: `category`, `description`, `steps` (ordered manual test steps), `passes` (all start false). Agents may change only `passes`. "It is unacceptable to remove or edit tests because this could lead to missing or buggy functionality." JSON chosen over Markdown because the model is less likely to inappropriately overwrite it.
- Session start: `pwd` -> read git log + progress file -> read feature list, pick highest-priority incomplete feature -> run `init.sh` -> basic end-to-end smoke test before new work. Saves tokens (no rediscovery of how to run/test).
- One feature at a time (avoids running out of context mid-implementation); leave a clean, mergeable state; descriptive commits (revert path); update progress file at session end; set `passes: true` only after verification.
- E2E testing: unit tests/curl missed failures; Puppeteer MCP + "do all testing as a human user would" markedly improved results. Limit: browser-native alert modals not visible.
- Failure modes -> fixes: premature "done" -> JSON feature list; undocumented bugs -> git + progress notes + smoke test; premature passing -> mandatory self-verification; time lost figuring out how to run -> init.sh.

## 20. Demystifying evals for AI agents
URL: https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
- Terms: task, trial (multiple per task), grader (multiple assertions), transcript, outcome ("the final state in the environment at the end of the trial" — not what the agent said), eval harness vs agent harness ("evaluating an agent" = harness + model together).
- Graders: code-based (fast, cheap, reproducible; brittle) > model-based (nuance; non-deterministic, needs human calibration) > human (gold standard; slow). Scoring: weighted threshold, binary all-pass, or hybrid.
- Capability evals start at low pass rate (hill to climb); regression evals near 100%; graduate saturated capability evals into regression suite.
- pass@k (>=1 success in k) vs pass^k (all k succeed; consistency): 75% per trial -> pass^3 ≈ 42%.
- Start: "20-50 simple tasks drawn from real failures is a great start." Task is unambiguous if two experts independently agree on pass/fail; everything graders check must be stated in the task; reference solution proves solvability; 0% across many trials "is most often a signal of a broken task."
- Balanced sets: should-trigger and should-not-trigger cases (under- vs over-triggering) — "One-sided evals produce one-sided optimization" [paraphrase of summarizer].
- Harness hygiene: clean isolated environment per trial; shared state inflates scores (Claude read git history from earlier trials); correlated env failures make trials non-independent.
- Graders: grade output, not path; partial credit; calibrate LLM judges vs experts; give judges an "Unknown" escape hatch; one isolated judge per rubric dimension; hack-resistant. Grading bugs: Opus 4.5 CORE-Bench 42% -> 95% after fixing rigid grading ("96.12" vs "96.124991…"), ambiguous specs, stochastic tasks.
- Maintain: read transcripts of many trials; monitor saturation; eval-driven development (write the eval before the capability). Track latency, tokens, turns, tool calls, cost per task, error rates as baselines.

---
Not read (cap reached): "Building effective agents" (anthropic.com/research/building-effective-agents), "Claude Code best practices" (anthropic.com/engineering/claude-code-best-practices), "Claude Managed Agents" articles on claude.com.

