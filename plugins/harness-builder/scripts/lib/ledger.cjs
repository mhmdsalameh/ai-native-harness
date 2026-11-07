'use strict';
// Experiment ledger over `claude plugin eval` results (aggregate-result.json, schemaVersion 1),
// and the cost estimate shown before a run.

const fs = require('fs');
const path = require('path');
const { readDoc } = require('./fm.cjs');

// Per-run cost range used only when the ledger has no measured runs yet.
// Low: one-turn skill case measured 2026-11-07 ($0.04-0.05). High: coding task at high effort (~$0.30)
// from the ~/.claude harness evals, rounded up for multi-file work.
const DEFAULT_RUN_COST = { low: 0.05, high: 0.4 };
const JUDGE_CALL_COST = 0.005; // three short judge calls per llm/baseline grader per run; default judge is a small model

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const round = (x, d = 3) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);

function summarize(result, label, file) {
  if (result.schemaVersion !== 1) throw new Error(`unsupported aggregate-result schemaVersion: ${result.schemaVersion}`);
  const cases = {};
  const runCosts = [];
  for (const c of result.cases || []) {
    const w = (c.arms && c.arms.with) || [];
    const wo = (c.arms && c.arms.without) || [];
    for (const r of [...w, ...wo]) if (typeof r.costUsd === 'number') runCosts.push(r.costUsd);
    const a = c.aggregates || {};
    cases[c.name] = {
      score: a.score ?? null,
      scoreWithout: a.scoreWithout ?? null,
      delta: a.delta ?? null,
      runs: w.length,
      runsWithout: wo.length,
      costWith: round(w.reduce((s, r) => s + (r.costUsd || 0) + (r.judgeCostUsd || 0), 0), 4),
      meanTurnsWith: round(mean(w.map((r) => r.turns).filter((t) => typeof t === 'number')), 2),
      errors: w.concat(wo).map((r) => r.error).filter(Boolean),
      skippedPaidGraders: w.some((r) => r.skippedPaidGraders),
    };
  }
  const ag = result.aggregates || {};
  return {
    at: result.startedAt || new Date().toISOString(), label, file,
    plugin: (result.suite && result.suite.plugins && result.suite.plugins[0] && result.suite.plugins[0].name) || null,
    ablation: result.suite ? result.suite.ablation : null,
    claudeVersion: result.claudeVersion || null,
    partial: !!result.partial, partialReason: result.partialReason || null,
    overallScore: ag.overallScore ?? null, meanDelta: ag.meanDelta ?? null,
    casesPassed: ag.casesPassed ?? null, casesTotal: ag.casesTotal ?? null,
    costUsd: round(result.costUsd, 4), meanRunCost: round(mean(runCosts), 4), runCount: runCosts.length,
    cases,
  };
}

function record(aggregateFile, label, ledgerFile) {
  if (!label) throw new Error('record needs --label "<what changed>"');
  const result = JSON.parse(fs.readFileSync(aggregateFile, 'utf8'));
  const entry = summarize(result, label, path.resolve(aggregateFile));
  fs.mkdirSync(path.dirname(path.resolve(ledgerFile)), { recursive: true });
  fs.appendFileSync(ledgerFile, JSON.stringify(entry) + '\n');
  return entry;
}

function readLedger(ledgerFile) {
  if (!fs.existsSync(ledgerFile)) return [];
  return fs.readFileSync(ledgerFile, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
}

function pick(entries, ref) {
  if (/^-?\d+$/.test(String(ref))) {
    const i = Number(ref);
    const e = i < 0 ? entries[entries.length + i] : entries[i];
    if (!e) throw new Error(`no ledger entry at index ${ref}`);
    return e;
  }
  const matches = entries.filter((e) => e.label === ref);
  if (!matches.length) throw new Error(`no ledger entry labelled "${ref}"`);
  return matches[matches.length - 1];
}

// A case score is a mean over runs; one run flipping moves it by 1/runs at most, so a smaller change is noise.
function compare(entries, refA = -2, refB = -1) {
  const a = pick(entries, refA);
  const b = pick(entries, refB);
  const names = [...new Set([...Object.keys(a.cases), ...Object.keys(b.cases)])];
  const rows = names.map((name) => {
    const ca = a.cases[name];
    const cb = b.cases[name];
    if (!ca || !cb) return { name, status: ca ? 'removed' : 'added' };
    const runs = Math.max(1, Math.min(ca.runs || 1, cb.runs || 1));
    const noise = 1 / runs;
    const change = round((cb.score ?? 0) - (ca.score ?? 0));
    let status = 'flat';
    if (Math.abs(change) >= noise && change !== 0) status = change > 0 ? 'improved' : 'regressed';
    else if (change !== 0) status = 'noise';
    return { name, scoreA: ca.score, scoreB: cb.score, change, deltaA: ca.delta, deltaB: cb.delta,
      costA: ca.costWith, costB: cb.costWith, runs, status };
  });
  const warnings = [];
  if (a.partial || b.partial) warnings.push('a partial run is included; its scores are not comparable');
  if (rows.some((r) => r.runs === 1)) warnings.push('cases with 1 run: one run decides the score; confirm a change at --runs 3 before keeping it');
  if (a.claudeVersion !== b.claudeVersion) warnings.push(`Claude Code version changed (${a.claudeVersion} -> ${b.claudeVersion})`);
  if (Object.values(a.cases).concat(Object.values(b.cases)).some((c) => c.skippedPaidGraders)) warnings.push('some runs skipped paid graders (cost ceiling); their scores are not comparable');
  return {
    a: { label: a.label, at: a.at, overallScore: a.overallScore, meanDelta: a.meanDelta, costUsd: a.costUsd },
    b: { label: b.label, at: b.at, overallScore: b.overallScore, meanDelta: b.meanDelta, costUsd: b.costUsd },
    rows, regressions: rows.filter((r) => r.status === 'regressed').map((r) => r.name), warnings,
  };
}

function findCases(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!ent.isDirectory() || ent.name.startsWith('.') || ent.name === 'results' || ent.name === 'mocks') continue;
    const p = path.join(dir, ent.name);
    if (fs.existsSync(path.join(p, 'prompt.md')) || fs.existsSync(path.join(p, 'case.yaml'))) out.push(p);
    else findCases(p, out);
  }
  return out;
}

function caseInfo(caseDir) {
  const pm = path.join(caseDir, 'prompt.md');
  const data = fs.existsSync(pm) ? readDoc(pm).data : {};
  const yml = path.join(caseDir, 'case.yaml');
  let yamlRuns = null;
  let yamlJudges = 0;
  if (fs.existsSync(yml)) {
    const text = fs.readFileSync(yml, 'utf8');
    const m = /^runs\s*:\s*(\d+)/m.exec(text);
    if (m) yamlRuns = Number(m[1]);
    yamlJudges = (text.match(/^\s*-?\s*type\s*:\s*(llm|baseline)\b/gm) || []).length;
  }
  let judges = yamlJudges;
  const gdir = path.join(caseDir, 'graders');
  if (fs.existsSync(gdir)) {
    for (const f of fs.readdirSync(gdir).filter((n) => n.endsWith('.md'))) {
      const t = readDoc(path.join(gdir, f)).data.type;
      if (t === 'llm' || t === 'baseline') judges++;
    }
  }
  return { name: path.basename(caseDir), runs: typeof data.runs === 'number' ? data.runs : yamlRuns, judges };
}

function estimate(evalDir, opts = {}, ledgerEntries = []) {
  const cases = findCases(evalDir).map(caseInfo);
  if (!cases.length) throw new Error(`no eval cases under ${evalDir}`);
  const arms = opts.ablation === 'none' ? 1 : 2;
  const measured = ledgerEntries.filter((e) => e.meanRunCost != null && !e.partial);
  let per = DEFAULT_RUN_COST;
  let source = 'default range (no measured runs in the ledger)';
  if (measured.length) {
    const costs = measured.map((e) => e.meanRunCost);
    per = { low: Math.min(...costs) * 0.8, high: Math.max(...costs) * 1.5 };
    source = `ledger: ${measured.length} measured run(s), mean run cost ${round(Math.min(...costs), 3)}-${round(Math.max(...costs), 3)} USD, widened -20%/+50%`;
  }
  let runs = 0;
  let judgeCalls = 0;
  for (const c of cases) {
    const r = opts.runs || c.runs || 3;
    runs += r * arms;
    judgeCalls += 3 * c.judges * r * arms;
  }
  const low = runs * per.low + judgeCalls * JUDGE_CALL_COST;
  const high = runs * per.high + judgeCalls * JUDGE_CALL_COST;
  return { cases: cases.length, arms, runs, judgeCalls, lowUsd: round(low, 2), highUsd: round(high, 2),
    suggestedCeilingUsd: Math.ceil(high * 1.25), source };
}

module.exports = { summarize, record, readLedger, compare, estimate, findCases, DEFAULT_RUN_COST };
