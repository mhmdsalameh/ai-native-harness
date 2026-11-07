#!/usr/bin/env node
'use strict';
// hb — harness-builder CLI. Node built-ins only.

const fs = require('fs');
const path = require('path');
const { inventory, toMarkdown } = require('./lib/inventory.cjs');
const { record, readLedger, compare, estimate } = require('./lib/ledger.cjs');
const { wrap, variant } = require('./lib/wrap.cjs');
const { init, status, paths } = require('./lib/project.cjs');

const USAGE = `hb <command> [args]

  init --mode new|improve --target <path> [--dir .]   create .harness/ (never overwrites)
  status [--dir .] [--json]                            current stage and next step
  inventory <path> [--json] [--out file]               static audit of a plugin, project or ~/.claude
  estimate <eval dir> [--runs n] [--ablation none]     runs and cost range before an eval run
  record <aggregate-result.json | results dir> --label "<change>"   append a run to the ledger
  compare [a] [b] [--json]                             per-case change between ledger entries (default: last two)
  wrap <.claude dir | project | ~/.claude> <out> [--name n] [--evals dir]   eval-ready plugin copy
  variant <plugin dir> --from evals --to evals-ctx --append <context.md>   suite with append_system_prompt

  --ledger <file>  ledger path (default: .harness/experiments.jsonl in the current folder)`;

function parseArgs(argv) {
  const pos = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) flags[key] = true;
      else { flags[key] = next; i++; }
    } else pos.push(a);
  }
  return { pos, flags };
}

function latestAggregate(p) {
  const abs = path.resolve(p);
  if (fs.statSync(abs).isFile()) return abs;
  const found = [];
  const walk = (d, depth) => {
    if (depth > 3) return;
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const q = path.join(d, ent.name);
      if (ent.isDirectory()) walk(q, depth + 1);
      else if (ent.name === 'aggregate-result.json') found.push(q);
    }
  };
  walk(abs, 0);
  if (!found.length) throw new Error(`no aggregate-result.json under ${abs}`);
  return found.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
}

const fmt = (x) => (x == null ? '-' : typeof x === 'number' ? String(Math.round(x * 100) / 100) : String(x));
const signed = (x) => (x == null ? '-' : (x > 0 ? '+' : '') + fmt(x));

function main(argv) {
  const { pos, flags } = parseArgs(argv);
  const cmd = pos.shift();
  const ledgerFile = path.resolve(flags.ledger || paths(process.cwd()).ledger);
  const print = (obj, text) => console.log(flags.json ? JSON.stringify(obj, null, 2) : text);

  switch (cmd) {
    case 'init': {
      const r = init(flags.dir || '.', { mode: flags.mode, target: flags.target, model: flags.model });
      return print(r, [...r.created.map((f) => `created ${f}`), ...r.kept.map((f) => `kept (exists) ${f}`)].join('\n'));
    }
    case 'status': {
      const r = status(flags.dir || '.');
      const f = r.facts || {};
      const lines = [`[harness] stage: ${r.stage}`];
      if (r.facts) lines.push(`[harness] mode ${f.mode} · target ${f.target} (${f.kind || 'not built'}) · components ${f.components} · eval cases ${f.evalCases} · experiments ${f.experiments}`);
      if (f.last) lines.push(`[harness] last run "${f.last.label}": score ${fmt(f.last.overallScore)} · mean delta ${signed(f.last.meanDelta)} · $${fmt(f.last.costUsd)}`);
      lines.push(`[harness] next: ${r.next}`);
      return print(r, lines.join('\n'));
    }
    case 'inventory': {
      if (!pos[0]) throw new Error('inventory needs a path');
      const r = inventory(pos[0]);
      const md = toMarkdown(r);
      if (flags.out) { fs.mkdirSync(path.dirname(path.resolve(flags.out)), { recursive: true }); fs.writeFileSync(flags.out, flags.json ? JSON.stringify(r, null, 2) : md); }
      return print(r, md);
    }
    case 'estimate': {
      if (!pos[0]) throw new Error('estimate needs the eval dir');
      const r = estimate(pos[0], { runs: flags.runs ? Number(flags.runs) : null, ablation: flags.ablation }, readLedger(ledgerFile));
      return print(r, `${r.cases} case(s) x ${r.arms} arm(s) = ${r.runs} agent runs, ${r.judgeCalls} judge calls\nEstimate: $${r.lowUsd} - $${r.highUsd}  (${r.source})\nSuggested ceiling: --max-cost-usd ${r.suggestedCeilingUsd}`);
    }
    case 'record': {
      if (!pos[0]) throw new Error('record needs an aggregate-result.json or a results folder');
      const file = latestAggregate(pos[0]);
      const e = record(file, flags.label, ledgerFile);
      return print(e, `recorded "${e.label}" -> ${ledgerFile}\n${file}\nscore ${fmt(e.overallScore)} · mean delta ${signed(e.meanDelta)} · cases ${e.casesPassed}/${e.casesTotal} · $${fmt(e.costUsd)}${e.partial ? ` · PARTIAL (${e.partialReason})` : ''}`);
    }
    case 'compare': {
      const entries = readLedger(ledgerFile);
      if (entries.length < 2 && pos.length < 2) throw new Error(`compare needs two ledger entries; ${ledgerFile} has ${entries.length}`);
      const r = compare(entries, pos[0] ?? -2, pos[1] ?? -1);
      const lines = [`A "${r.a.label}": score ${fmt(r.a.overallScore)} · delta ${signed(r.a.meanDelta)} · $${fmt(r.a.costUsd)}`,
        `B "${r.b.label}": score ${fmt(r.b.overallScore)} · delta ${signed(r.b.meanDelta)} · $${fmt(r.b.costUsd)}`, '',
        'CASE | A | B | CHANGE | COST A | COST B | STATUS'];
      for (const x of r.rows) lines.push(x.status === 'added' || x.status === 'removed' ? `${x.name} | | | | | | ${x.status}` : `${x.name} | ${fmt(x.scoreA)} | ${fmt(x.scoreB)} | ${signed(x.change)} | ${fmt(x.costA)} | ${fmt(x.costB)} | ${x.status}`);
      if (r.regressions.length) lines.push('', `REGRESSIONS: ${r.regressions.join(', ')}`);
      for (const w of r.warnings) lines.push(`warning: ${w}`);
      return print(r, lines.join('\n'));
    }
    case 'wrap': {
      if (!pos[0] || !pos[1]) throw new Error('wrap needs <source> <out>');
      const r = wrap(pos[0], pos[1], { name: flags.name, evals: flags.evals });
      return print(r, `wrapped ${r.kind} harness as plugin "${r.name}" -> ${r.out}\ncarried:\n${r.carried.map((c) => '  - ' + c).join('\n')}\nnot carried:\n${(r.notCarried.length ? r.notCarried : ['nothing']).map((c) => '  - ' + c).join('\n')}`);
    }
    case 'variant': {
      if (!pos[0] || !flags.from || !flags.to || !flags.append) throw new Error('variant needs <plugin dir> --from <dir> --to <dir> --append <file>');
      const r = variant(pos[0], flags.from, flags.to, flags.append);
      return print(r, `variant suite -> ${r.suite}\npatched ${r.patched.length} case(s)${r.skipped.length ? `\nskipped:\n${r.skipped.map((s) => '  - ' + s).join('\n')}` : ''}`);
    }
    case undefined: case 'help': case '--help':
      return console.log(USAGE);
    default:
      throw new Error(`unknown command: ${cmd}\n\n${USAGE}`);
  }
}

if (require.main === module) {
  try { main(process.argv.slice(2)); } catch (e) { console.error(`hb: ${e.message}`); process.exitCode = 1; }
}
module.exports = { main, parseArgs, latestAggregate };
