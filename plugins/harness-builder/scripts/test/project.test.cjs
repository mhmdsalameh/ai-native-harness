'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const { init, status, paths } = require('../lib/project.cjs');
const { record } = require('../lib/ledger.cjs');
const { tmpdir, writeTree, skill } = require('./helpers.cjs');

const HB = path.join(__dirname, '..', 'hb.cjs');
const probeFile = path.join(__dirname, 'fixtures', 'aggregate-probe.json');

test('init creates the layout, needs a target, and never overwrites', () => {
  const dir = tmpdir();
  assert.throws(() => init(dir, {}), /--target/);
  assert.throws(() => init(dir, { mode: 'x', target: dir }), /--mode/);
  const r = init(dir, { mode: 'new', target: path.join(dir, 'plugin') });
  assert.equal(r.created.length, 3);
  const P = paths(dir);
  fs.writeFileSync(P.state, 'edited');
  const again = init(dir, { mode: 'improve', target: dir });
  assert.equal(again.created.length, 0);
  assert.equal(fs.readFileSync(P.state, 'utf8'), 'edited');
  assert.equal(JSON.parse(fs.readFileSync(P.config, 'utf8')).mode, 'new');
});

test('status walks the new-harness stages in order', () => {
  const dir = tmpdir();
  assert.equal(status(dir).stage, 'none');
  const plugin = path.join(dir, 'plugin');
  init(dir, { mode: 'new', target: plugin });
  const P = paths(dir);
  assert.equal(status(dir).stage, 'research');
  fs.writeFileSync(P.findings, '# Findings\n- x [1]');
  assert.equal(status(dir).stage, 'design');
  fs.writeFileSync(P.design, '| control | where |');
  assert.equal(status(dir).stage, 'build');
  writeTree(plugin, { '.claude-plugin/plugin.json': '{"name":"p"}', 'skills/s/SKILL.md': skill('s', 'Does s. Use when testing.') });
  assert.equal(status(dir).stage, 'eval-suite');
  writeTree(plugin, { 'evals/c/prompt.md': 'Do it.' });
  assert.equal(status(dir).stage, 'baseline');
  record(probeFile, 'baseline', P.ledger);
  const s = status(dir);
  assert.equal(s.stage, 'optimize');
  assert.equal(s.facts.last.label, 'baseline');
});

test('status for improving a project harness asks for audit, suite, wrap, baseline', () => {
  const dir = writeTree(tmpdir(), { 'CLAUDE.md': 'rules\n', '.claude/skills/s/SKILL.md': skill('s', 'Does s. Use when testing.') });
  init(dir, { mode: 'improve', target: dir });
  const P = paths(dir);
  assert.equal(status(dir).stage, 'audit');
  fs.writeFileSync(P.audit, '# audit');
  assert.equal(status(dir).stage, 'eval-suite');
  writeTree(P.evals, { 'c/prompt.md': 'Do it.' });
  assert.equal(status(dir).stage, 'wrap');
  fs.mkdirSync(P.wrapped);
  assert.equal(status(dir).stage, 'baseline');
});

test('hb CLI: help, status line, inventory markdown, errors exit 1', () => {
  assert.match(execFileSync(process.execPath, [HB, 'help'], { encoding: 'utf8' }), /hb <command>/);
  const dir = tmpdir();
  assert.match(execFileSync(process.execPath, [HB, 'status', '--dir', dir], { encoding: 'utf8' }), /\[harness\] stage: none/);
  const plugin = writeTree(tmpdir(), { '.claude-plugin/plugin.json': '{"name":"p"}', 'skills/s/SKILL.md': skill('s', 'Does s. Use when testing.') });
  assert.match(execFileSync(process.execPath, [HB, 'inventory', plugin], { encoding: 'utf8' }), /Kind: \*\*plugin\*\*/);
  const json = JSON.parse(execFileSync(process.execPath, [HB, 'inventory', plugin, '--json'], { encoding: 'utf8' }));
  assert.equal(json.counts.skills, 1);
  const bad = spawnSync(process.execPath, [HB, 'nope'], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /unknown command/);
});

test('hb record finds the newest aggregate-result.json in a results folder', () => {
  const dir = tmpdir();
  writeTree(dir, { 'results/2026-01-01/aggregate-result.json': fs.readFileSync(probeFile, 'utf8') });
  const ledger = path.join(dir, 'l.jsonl');
  const out = execFileSync(process.execPath, [HB, 'record', path.join(dir, 'results'), '--label', 'x', '--ledger', ledger], { encoding: 'utf8' });
  assert.match(out, /recorded "x"/);
  assert.match(out, /mean delta \+1/);
});
