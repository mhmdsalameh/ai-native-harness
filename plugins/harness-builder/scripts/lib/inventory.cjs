'use strict';
// Static audit of a Claude Code harness: a plugin, a project (.claude/ + CLAUDE.md), or ~/.claude.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { readDoc } = require('./fm.cjs');

// Each budget names its source; the heuristic ones say so.
const BUDGETS = {
  descriptionChars: 1536, // code.claude.com/docs/en/skills: description + when_to_use truncated in the listing
  skillLines: 500,        // same page: keep SKILL.md under 500 lines
  claudeMdLines: 200,     // code.claude.com/docs/en/memory; "Steering Claude Code" article
  minDescriptionChars: 40, // heuristic: shorter descriptions rarely say both what and when
  agents: 8,              // heuristic for "a handful of well-scoped agents" (subagents article)
};

const SKILL_KEYS = new Set(['name', 'description', 'when_to_use', 'argument-hint', 'disable-model-invocation',
  'user-invocable', 'allowed-tools', 'model', 'effort', 'context', 'agent', 'hooks', 'paths', 'shell',
  'license', 'metadata', 'compatibility', 'version']);
const AGENT_KEYS = new Set(['name', 'description', 'tools', 'disallowedTools', 'model', 'permissionMode', 'maxTurns',
  'skills', 'mcpServers', 'hooks', 'memory', 'background', 'effort', 'isolation', 'color', 'initialPrompt']);
const PLUGIN_AGENT_IGNORED = ['hooks', 'mcpServers', 'permissionMode'];
const RESERVED_SKILL_DIRS = new Set(['synced', 'anthropic-skills']);

const exists = (p) => { try { fs.accessSync(p); return true; } catch { return false; } };
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
const tokens = (chars) => Math.ceil(chars / 4);
const lineCount = (text) => (text === '' ? 0 : text.replace(/\r?\n$/, '').split(/\r?\n/).length);

function detectLayout(target, opts = {}) {
  const abs = path.resolve(target);
  const home = path.resolve(opts.home || os.homedir());
  if (!isDir(abs)) throw new Error(`not a directory: ${abs}`);
  if (exists(path.join(abs, '.claude-plugin', 'plugin.json')) || exists(path.join(abs, 'plugin.json'))) {
    return { kind: 'plugin', root: abs, compDir: abs, claudeMds: [], settings: null,
      hooksFile: path.join(abs, 'hooks', 'hooks.json'), mcpFile: path.join(abs, '.mcp.json'),
      evalDirs: [path.join(abs, 'evals')] };
  }
  if (path.basename(abs) === '.claude') {
    const user = abs.toLowerCase() === path.join(home, '.claude').toLowerCase();
    const parent = path.dirname(abs);
    return { kind: user ? 'user' : 'project', root: user ? abs : parent, compDir: abs,
      claudeMds: user ? [path.join(abs, 'CLAUDE.md')] : [path.join(parent, 'CLAUDE.md'), path.join(abs, 'CLAUDE.md')],
      settings: path.join(abs, 'settings.json'), hooksFile: null,
      mcpFile: user ? null : path.join(parent, '.mcp.json'),
      evalDirs: user ? [path.join(abs, 'evals')] : [path.join(parent, 'evals'), path.join(parent, '.harness', 'evals')] };
  }
  if (isDir(path.join(abs, '.claude')) || exists(path.join(abs, 'CLAUDE.md'))) {
    return { kind: 'project', root: abs, compDir: path.join(abs, '.claude'),
      claudeMds: [path.join(abs, 'CLAUDE.md'), path.join(abs, '.claude', 'CLAUDE.md')],
      settings: path.join(abs, '.claude', 'settings.json'), hooksFile: null, mcpFile: path.join(abs, '.mcp.json'),
      evalDirs: [path.join(abs, 'evals'), path.join(abs, '.harness', 'evals')] };
  }
  throw new Error(`no harness found at ${abs}: expected .claude-plugin/plugin.json, a .claude folder, or CLAUDE.md`);
}

function walkFiles(dir, match, maxDepth, depth = 0, out = []) {
  if (!isDir(dir) || depth > maxDepth) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name.startsWith('.')) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkFiles(p, match, maxDepth, depth + 1, out);
    else if (match(ent.name, p)) out.push(p);
  }
  return out;
}

// Resolves @imports the way CLAUDE.md does (relative to the importing file, ~ = home), max 5 hops.
function collectImports(file, home, seen, depth = 0) {
  if (depth > 5 || seen.has(file.toLowerCase()) || !exists(file)) return [];
  seen.add(file.toLowerCase());
  const text = fs.readFileSync(file, 'utf8');
  const found = [{ file, text }];
  let inFence = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    for (const m of line.matchAll(/(?:^|\s)@((?:~|\.{1,2})?[\\/]?[\w.\-\\/]+)/g)) {
      const ref = m[1];
      if (!/[\\/]/.test(ref)) continue;
      const resolved = ref.startsWith('~') ? path.join(home, ref.slice(1)) : path.resolve(path.dirname(file), ref);
      found.push(...collectImports(resolved, home, seen, depth + 1));
    }
  }
  return found;
}

function inventory(target, opts = {}) {
  const home = path.resolve(opts.home || os.homedir());
  const L = detectLayout(target, opts);
  const findings = [];
  const add = (level, where, rule, message) => findings.push({ level, where: path.relative(L.root, where) || '.', rule, message });

  // Skills
  const skills = [];
  const skillsRoot = path.join(L.compDir, 'skills');
  const skippedReserved = [];
  if (isDir(skillsRoot)) {
    for (const ent of fs.readdirSync(skillsRoot, { withFileTypes: true })) {
      if (!ent.isDirectory() || ent.name.startsWith('.')) continue;
      if (RESERVED_SKILL_DIRS.has(ent.name)) { skippedReserved.push(ent.name); continue; }
      for (const f of walkFiles(path.join(skillsRoot, ent.name), (n) => n === 'SKILL.md', 2)) {
        const d = readDoc(f);
        const dirName = path.basename(path.dirname(f));
        const name = typeof d.data.name === 'string' && d.data.name ? d.data.name : dirName;
        const desc = typeof d.data.description === 'string' ? d.data.description : '';
        const when = typeof d.data.when_to_use === 'string' ? d.data.when_to_use : '';
        const listed = d.data['disable-model-invocation'] !== true;
        const lines = lineCount(d.text);
        skills.push({ name, file: f, lines, descriptionChars: desc.length + when.length, listed });
        if (!d.hasFrontmatter) add('error', f, 'skill-frontmatter', 'SKILL.md has no YAML frontmatter, so it has no description to trigger on.');
        else if (!desc) add('error', f, 'skill-description', 'Skill has no description; Claude cannot decide when to use it.');
        if (desc && desc.length + when.length > BUDGETS.descriptionChars) add('error', f, 'description-length', `description + when_to_use is ${desc.length + when.length} chars; the listing truncates at ${BUDGETS.descriptionChars}.`);
        if (desc && listed && desc.length + when.length < BUDGETS.minDescriptionChars) add('warn', f, 'description-vague', `description is ${desc.length + when.length} chars; say what the skill does and when to use it.`);
        if (desc && listed && !when && !/\b(use|when|whenever|trigger|before|after)\b/i.test(desc)) add('info', f, 'description-no-trigger', 'description does not say when to use the skill.');
        if (lines > BUDGETS.skillLines) add('warn', f, 'skill-length', `SKILL.md is ${lines} lines (budget ${BUDGETS.skillLines}); move detail into reference files.`);
        const unknown = Object.keys(d.data).filter((k) => !SKILL_KEYS.has(k));
        if (unknown.length) add('info', f, 'skill-unknown-keys', `unknown frontmatter keys are ignored silently: ${unknown.join(', ')}`);
      }
    }
  }
  const dupes = (list) => [...new Set(list.map((s) => s.name).filter((n, i, a) => a.indexOf(n) !== i))];
  for (const n of dupes(skills)) add('error', skillsRoot, 'duplicate-skill', `more than one skill is named "${n}".`);

  // Agents
  const agents = [];
  for (const f of walkFiles(path.join(L.compDir, 'agents'), (n) => n.endsWith('.md'), 1)) {
    const d = readDoc(f);
    const name = typeof d.data.name === 'string' && d.data.name ? d.data.name : path.basename(f, '.md');
    const desc = typeof d.data.description === 'string' ? d.data.description : '';
    agents.push({ name, file: f, lines: lineCount(d.text), descriptionChars: desc.length, tools: d.data.tools ?? null });
    if (!desc) add('error', f, 'agent-description', 'agent has no description; delegation cannot pick it.');
    const unknown = Object.keys(d.data).filter((k) => !AGENT_KEYS.has(k));
    if (unknown.length) add('info', f, 'agent-unknown-keys', `unknown frontmatter keys: ${unknown.join(', ')}`);
    if (L.kind === 'plugin') {
      const ignored = PLUGIN_AGENT_IGNORED.filter((k) => k in d.data);
      if (ignored.length) add('warn', f, 'plugin-agent-ignored', `plugin agents ignore ${ignored.join(', ')}; move hooks to hooks/hooks.json.`);
    }
  }
  for (const n of dupes(agents)) add('error', path.join(L.compDir, 'agents'), 'duplicate-agent', `more than one agent is named "${n}".`);
  if (agents.length > BUDGETS.agents) add('warn', path.join(L.compDir, 'agents'), 'agent-count', `${agents.length} agents; a large roster makes delegation less reliable. Prefer one agent with skills.`);

  // Commands
  const commands = walkFiles(path.join(L.compDir, 'commands'), (n) => n.endsWith('.md'), 3).map((f) => {
    const d = readDoc(f);
    const desc = typeof d.data.description === 'string' ? d.data.description : '';
    return { name: path.basename(f, '.md'), file: f, lines: lineCount(d.text), descriptionChars: desc.length,
      listed: d.data['disable-model-invocation'] !== true };
  });

  // Always-loaded context: CLAUDE.md (+ imports) and unscoped rules
  const seen = new Set();
  const memory = [];
  for (const f of L.claudeMds) for (const m of collectImports(f, home, seen)) memory.push({ file: m.file, lines: lineCount(m.text), chars: m.text.length });
  if (L.kind === 'plugin' && exists(path.join(L.root, 'CLAUDE.md'))) add('warn', path.join(L.root, 'CLAUDE.md'), 'plugin-claude-md', 'a CLAUDE.md at the plugin root is not loaded; move its content into skills or agent prompts.');
  for (const m of memory) {
    if (path.basename(m.file) === 'CLAUDE.md' && m.lines > BUDGETS.claudeMdLines) add('warn', m.file, 'claude-md-length', `${m.lines} lines (budget ${BUDGETS.claudeMdLines}); every line loads every session.`);
  }
  const rules = { unscoped: [], scoped: [] };
  for (const f of walkFiles(path.join(L.compDir, 'rules'), (n) => n.endsWith('.md'), 3)) {
    const d = readDoc(f);
    const entry = { file: f, lines: lineCount(d.text), chars: d.text.length, alsoImported: seen.has(f.toLowerCase()) };
    (d.data.paths ? rules.scoped : rules.unscoped).push(entry);
  }

  // Hooks
  let hooksObj = null;
  if (L.hooksFile && exists(L.hooksFile)) hooksObj = (readJson(L.hooksFile) || {}).hooks || null;
  if (L.settings && exists(L.settings)) hooksObj = (readJson(L.settings) || {}).hooks || hooksObj;
  const hooks = {};
  let modelHooks = 0;
  for (const [event, groups] of Object.entries(hooksObj || {})) {
    let n = 0;
    for (const g of Array.isArray(groups) ? groups : []) for (const h of g.hooks || []) { n++; if (h.type === 'prompt' || h.type === 'agent') modelHooks++; }
    hooks[event] = n;
  }
  if (modelHooks) add('info', L.settings || L.hooksFile, 'model-hooks', `${modelHooks} prompt/agent hooks call a model on each event; check their cost.`);

  // MCP
  const mcp = L.mcpFile && exists(L.mcpFile) ? Object.keys((readJson(L.mcpFile) || {}).mcpServers || {}) : [];

  // Evals
  let evalCases = 0;
  for (const d of L.evalDirs) evalCases += countCases(d);
  const skillCreatorEvals = walkFiles(skillsRoot, (n, p) => n === 'evals.json' && path.basename(path.dirname(p)) === 'evals', 3).length;
  const otherEvalDirs = L.evalDirs.filter((d) => isDir(d) && countCases(d) === 0 && fs.readdirSync(d).some((n) => !n.startsWith('.') && n !== 'results'));
  if (evalCases + skillCreatorEvals === 0 && otherEvalDirs.length) add('info', otherEvalDirs[0], 'evals-other-format', 'eval files exist but not in the claude plugin eval format (prompt.md / case.yaml); hb estimate and hb record read only that format.');
  else if (evalCases + skillCreatorEvals === 0 && skills.length + agents.length > 0) add('warn', L.root, 'no-evals', 'no eval suite found; nothing shows this harness beats Claude without it.');

  const listingChars = skills.filter((s) => s.listed).reduce((a, s) => a + s.name.length + s.descriptionChars, 0)
    + agents.reduce((a, s) => a + s.name.length + s.descriptionChars, 0)
    + commands.filter((c) => c.listed).reduce((a, c) => a + c.name.length + c.descriptionChars, 0);
  const memoryChars = memory.reduce((a, m) => a + m.chars, 0) + rules.unscoped.filter((r) => !r.alsoImported).reduce((a, r) => a + r.chars, 0);

  return {
    target: L.root, kind: L.kind, budgets: BUDGETS,
    counts: { skills: skills.length, agents: agents.length, commands: commands.length, rulesUnscoped: rules.unscoped.length,
      rulesScoped: rules.scoped.length, hookHandlers: Object.values(hooks).reduce((a, b) => a + b, 0), mcpServers: mcp.length,
      evalCases, skillCreatorEvals },
    alwaysLoaded: { listingTokens: tokens(listingChars), memoryTokens: tokens(memoryChars), totalTokens: tokens(listingChars + memoryChars),
      note: 'estimate: characters / 4; excludes Claude Code system prompt, tools and plugins outside this target' },
    skills, agents, commands, memory, rules, hooks, mcp, skippedReserved,
    findings: findings.sort((a, b) => ['error', 'warn', 'info'].indexOf(a.level) - ['error', 'warn', 'info'].indexOf(b.level)),
  };
}

function countCases(dir) {
  if (!isDir(dir)) return 0;
  let n = 0;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!ent.isDirectory() || ent.name.startsWith('.') || ent.name === 'results' || ent.name === 'mocks') continue;
    const p = path.join(dir, ent.name);
    if (exists(path.join(p, 'prompt.md')) || exists(path.join(p, 'case.yaml'))) n++;
    else n += countCases(p);
  }
  return n;
}

function toMarkdown(r) {
  const rel = (f) => path.relative(r.target, f) || '.';
  const out = [`# Harness inventory: ${r.target}`, '', `Kind: **${r.kind}**`, ''];
  out.push('| Component | Count |', '|---|---|');
  for (const [k, v] of Object.entries(r.counts)) out.push(`| ${k} | ${v} |`);
  out.push('', `Always-loaded estimate: **~${r.alwaysLoaded.totalTokens} tokens** (listing ~${r.alwaysLoaded.listingTokens}, CLAUDE.md + rules ~${r.alwaysLoaded.memoryTokens}). ${r.alwaysLoaded.note}.`, '');
  if (r.memory.length) {
    out.push('## Always-loaded files', '', '| File | Lines |', '|---|---|');
    for (const m of r.memory) out.push(`| ${rel(m.file)} | ${m.lines} |`);
    for (const m of r.rules.unscoped.filter((x) => !x.alsoImported)) out.push(`| ${rel(m.file)} (rule) | ${m.lines} |`);
    out.push('');
  }
  if (r.skills.length) {
    out.push('## Skills', '', '| Skill | Lines | Description chars | Listed |', '|---|---|---|---|');
    for (const s of r.skills) out.push(`| ${s.name} | ${s.lines} | ${s.descriptionChars} | ${s.listed ? 'yes' : 'no'} |`);
    out.push('');
  }
  if (r.agents.length) {
    out.push('## Agents', '', '| Agent | Lines | Description chars |', '|---|---|---|');
    for (const a of r.agents) out.push(`| ${a.name} | ${a.lines} | ${a.descriptionChars} |`);
    out.push('');
  }
  if (Object.keys(r.hooks).length) out.push('## Hooks', '', Object.entries(r.hooks).map(([e, n]) => `- ${e}: ${n}`).join('\n'), '');
  if (r.skippedReserved.length) out.push(`Skipped reserved skill folders: ${r.skippedReserved.join(', ')}`, '');
  out.push('## Findings', '');
  if (!r.findings.length) out.push('None.');
  for (const f of r.findings) out.push(`- **${f.level}** \`${f.rule}\` ${f.where}: ${f.message}`);
  return out.join('\n') + '\n';
}

module.exports = { inventory, detectLayout, toMarkdown, countCases, collectImports, BUDGETS };
