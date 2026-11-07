'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { summarize, record, readLedger, compare, estimate } = require('../lib/ledger.cjs');
const { tmpdir, writeTree } = require('./helpers.cjs');

const probe = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'aggregate-probe.json'), 'utf8'));

function variantOf(base, edits) {
  const j = JSON.parse(JSON.stringify(base));
  edits(j);
  return j;
}

test('summarize reads a real claude plugin eval result (schemaVersion 1)', () => {
  const e = summarize(probe, 'probe', 'f.json');
  assert.equal(e.plugin, 'fmt-probe');
  assert.equal(e.ablation, 'with-without');
  assert.equal(e.overallScore, 1);
  assert.equal(e.meanDelta, 1);
  assert.equal(e.runCount, 2);
  const c = e.cases['note-case'];
  assert.equal(c.runs, 1, 'runs come from the with-arm length, not runsPerCase');
  assert.equal(c.score, 1);
  assert.equal(c.scoreWithout, 0);
  assert.equal(c.meanTurnsWith, 3);
  assert.ok(e.meanRunCost > 0.04 && e.meanRunCost < 0.06);
});

test('summarize rejects an unknown schema version', () => {
  assert.throws(() => summarize({ schemaVersion: 2 }, 'x', 'f'), /schemaVersion/);
});

test('record appends one line per run and requires a label', () => {
  const dir = tmpdir();
  const f = path.join(dir, 'a.json');
  fs.writeFileSync(f, JSON.stringify(probe));
  const ledger = path.join(dir, 'sub', 'experiments.jsonl');
  assert.throws(() => record(f, '', ledger), /--label/);
  record(f, 'first', ledger);
  record(f, 'second', ledger);
  assert.deepEqual(readLedger(ledger).map((e) => e.label), ['first', 'second']);
});

test('compare: improved, regressed, noise, added; warnings for 1-run cases and version change', () => {
  const three = (scores) => scores.map((s) => ({ score: s, costUsd: 0.1, judgeCostUsd: 0, turns: 2, error: null }));
  const mk = (cases, version) => ({ schemaVersion: 1, claudeVersion: version, costUsd: 1, suite: { plugins: [{ name: 'p' }] },
    aggregates: {}, cases: Object.entries(cases).map(([name, runs]) => ({ name, arms: { with: three(runs), without: [] },
      aggregates: { score: runs.reduce((a, b) => a + b, 0) / runs.length } })) });
  const a = summarize(mk({ up: [0, 0, 1], down: [1, 1, 1], tiny: [1, 1, 0.5], gone: [1, 1, 1] }, '1'), 'A', 'a');
  const b = summarize(mk({ up: [1, 1, 1], down: [1, 0, 0], tiny: [1, 1, 1], fresh: [1, 1, 1] }, '2'), 'B', 'b');
  const r = compare([a, b]);
  const st = Object.fromEntries(r.rows.map((x) => [x.name, x.status]));
  assert.deepEqual(st, { up: 'improved', down: 'regressed', tiny: 'noise', gone: 'removed', fresh: 'added' });
  assert.deepEqual(r.regressions, ['down']);
  assert.ok(r.warnings.some((w) => /version changed/.test(w)));
  const one = summarize(variantOf(probe, (j) => { j.cases[0].aggregates.score = 0.5; }), 'C', 'c');
  assert.ok(compare([summarize(probe, 'P', 'p'), one]).warnings.some((w) => /1 run/.test(w)));
});

test('compare picks entries by label and by index', () => {
  const e1 = summarize(probe, 'base', 'x');
  const e2 = summarize(probe, 'change', 'y');
  const e3 = summarize(probe, 'other', 'z');
  assert.equal(compare([e1, e2, e3], 'base', 'other').b.label, 'other');
  assert.equal(compare([e1, e2, e3], 0, 1).b.label, 'change');
  assert.throws(() => compare([e1, e2], 'nope', -1), /no ledger entry/);
});

test('estimate counts runs, arms and judge calls; uses ledger costs when present', () => {
  const dir = writeTree(tmpdir(), {
    'evals/a/prompt.md': '---\nruns: 2\n---\nDo a.',
    'evals/a/graders/judge.md': '---\ntype: llm\n---\nPASS if ok.',
    'evals/a/graders/re.md': '---\ntype: regex\npattern: x\n---\n',
    'evals/group/b/prompt.md': 'Do b.',
    'evals/c/case.yaml': 'schema_version: "1.1"\nname: c\nruns: 1\ngraders:\n  - name: j\n    type: llm\n    criteria: ok\n',
    'evals/results/old/prompt.md': 'not a case',
  });
  const ev = path.join(dir, 'evals');
  const d = estimate(ev, {});
  assert.equal(d.cases, 3);
  assert.equal(d.runs, (2 + 3 + 1) * 2);
  assert.equal(d.judgeCalls, 3 * 1 * 2 * 2 + 3 * 1 * 1 * 2);
  assert.match(d.source, /default/);
  const one = estimate(ev, { ablation: 'none', runs: 1 });
  assert.equal(one.runs, 3);
  const m = estimate(ev, {}, [summarize(probe, 'p', 'f')]);
  assert.match(m.source, /ledger/);
  assert.ok(m.highUsd < d.highUsd);
  assert.ok(m.suggestedCeilingUsd >= m.highUsd);
  assert.throws(() => estimate(path.join(dir, 'nope'), {}), /no eval cases/);
});
