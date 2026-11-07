'use strict';
// The .harness/ project folder: config, state, research notes, design, experiment ledger.

const fs = require('fs');
const path = require('path');
const { inventory, detectLayout, countCases } = require('./inventory.cjs');
const { readLedger } = require('./ledger.cjs');

const STATE_TEMPLATE = `# STATE.md — harness project

## Verified facts
<!-- - [YYYY-MM-DD] fact — verified by: command / URL -->

## Rules
<!-- decisions the user made; never re-ask -->

## Open failures
<!-- - [date] what fails | hypothesis | repro -->

## Lessons learned

## Last session
`;

function paths(dir) {
  const h = path.join(path.resolve(dir), '.harness');
  return { h, config: path.join(h, 'harness.json'), state: path.join(h, 'STATE.md'), research: path.join(h, 'research'),
    notes: path.join(h, 'research', 'notes'), findings: path.join(h, 'research', 'findings.md'), design: path.join(h, 'design.md'),
    audit: path.join(h, 'audit.md'), ledger: path.join(h, 'experiments.jsonl'), evals: path.join(h, 'evals'), wrapped: path.join(h, 'wrapped') };
}

function init(dir, opts = {}) {
  const P = paths(dir);
  const mode = opts.mode || 'new';
  if (!['new', 'improve'].includes(mode)) throw new Error('--mode must be new or improve');
  if (!opts.target) throw new Error('init needs --target <harness path> (the plugin, .claude folder, or ~/.claude to build or improve)');
  const created = [];
  const kept = [];
  const make = (file, content) => {
    if (fs.existsSync(file)) { kept.push(file); return; }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    created.push(file);
  };
  const target = path.resolve(opts.target);
  make(P.config, JSON.stringify({ mode, target, createdAt: new Date().toISOString().slice(0, 10), model: opts.model || null, judgeModel: null }, null, 2) + '\n');
  make(P.state, STATE_TEMPLATE);
  make(path.join(P.research, 'questions.md'), '# Research questions\n\n<!-- one question per line, each with the decision it informs -->\n');
  fs.mkdirSync(P.notes, { recursive: true });
  return { created, kept };
}

function status(dir) {
  const P = paths(dir);
  if (!fs.existsSync(P.config)) return { stage: 'none', next: 'Run `hb init --mode new|improve --target <path>` in the project folder.' };
  const cfg = JSON.parse(fs.readFileSync(P.config, 'utf8'));
  const facts = { mode: cfg.mode, target: cfg.target };
  let kind = null;
  let components = 0;
  try {
    kind = detectLayout(cfg.target).kind;
    const inv = inventory(cfg.target);
    components = inv.counts.skills + inv.counts.agents + inv.counts.commands + inv.counts.hookHandlers;
  } catch { /* target not built yet */ }
  facts.kind = kind;
  facts.components = components;
  const evalDir = kind === 'plugin' ? path.join(cfg.target, 'evals') : P.evals;
  facts.evalDir = evalDir;
  facts.evalCases = countCases(evalDir);
  const ledger = readLedger(P.ledger);
  facts.experiments = ledger.length;
  if (ledger.length) {
    const last = ledger[ledger.length - 1];
    facts.last = { label: last.label, overallScore: last.overallScore, meanDelta: last.meanDelta, costUsd: last.costUsd };
  }
  const has = (f) => fs.existsSync(f) && fs.readFileSync(f, 'utf8').trim().length > 0;
  const needWrap = kind && kind !== 'plugin' && !fs.existsSync(P.wrapped);

  const steps = cfg.mode === 'improve'
    ? [
      [!kind, 'audit', `Target ${cfg.target} is not a harness. Fix --target in .harness/harness.json.`],
      [!has(P.audit), 'audit', 'Audit the target: `hb inventory <target> --out .harness/audit.md`, then read the findings (skill harness-audit).'],
      [facts.evalCases === 0, 'eval-suite', `Write the eval suite in ${evalDir} (skill harness-eval).`],
      [needWrap, 'wrap', 'Wrap the target for evals: `hb wrap <target> .harness/wrapped --evals .harness/evals`.'],
      [ledger.length === 0, 'baseline', 'Estimate, get approval, run the baseline eval, then `hb record` it (skill harness-eval).'],
      [true, 'optimize', 'Hill-climb: one change, re-run, `hb record`, `hb compare` (skill harness-optimize).'],
    ]
    : [
      [!has(P.findings), 'research', 'Research the domain in chunks into .harness/research/ (skill harness-research).'],
      [!has(P.design), 'design', 'Write .harness/design.md: one row per control (skill harness-design).'],
      [components === 0, 'build', `Build the harness at ${cfg.target} from design.md (skill harness-design).`],
      [facts.evalCases === 0, 'eval-suite', `Write the eval suite in ${evalDir} (skill harness-eval).`],
      [needWrap, 'wrap', 'Wrap the target for evals: `hb wrap <target> .harness/wrapped --evals .harness/evals`.'],
      [ledger.length === 0, 'baseline', 'Estimate, get approval, run the first eval, then `hb record` it (skill harness-eval).'],
      [true, 'optimize', 'Hill-climb: one change, re-run, `hb record`, `hb compare` (skill harness-optimize).'],
    ];
  const [, stage, next] = steps.find(([cond]) => cond);
  return { stage, next, facts };
}

module.exports = { init, status, paths };
