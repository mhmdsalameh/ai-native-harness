'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { spawnSync } = require('child_process');
const { decide } = require('../lib/guard.cjs');
const { tmpdir, writeTree } = require('./helpers.cjs');

const HOOK = path.join(__dirname, '..', '..', 'hooks', 'eval-guard.cjs');
const project = () => writeTree(tmpdir(), { '.harness/harness.json': '{}' });
const call = (command, extra = {}) => ({ tool_name: 'Bash', tool_input: { command }, cwd: project(), ...extra });

test('eval run without a ceiling is denied; with a ceiling the user is asked', () => {
  assert.equal(decide(call('claude plugin eval . --runs 3')).decision, 'deny');
  const ask = decide(call('cd p && claude plugin eval . --runs 3 --max-cost-usd 4.5'));
  assert.equal(ask.decision, 'ask');
  assert.match(ask.reason, /\$4\.5/);
  assert.equal(decide(call('claude.exe plugin eval x --max-cost-usd=2', { tool_name: 'PowerShell' })).decision, 'ask');
});

test('free eval subcommands and other commands pass untouched', () => {
  assert.equal(decide(call('claude plugin eval init --bare first-case')), null);
  assert.equal(decide(call('claude plugin eval --help')), null);
  assert.equal(decide(call('claude plugin validate .')), null);
  assert.equal(decide(call('echo "claude plugin evaluation"')), null);
  assert.equal(decide({ tool_name: 'Write', tool_input: { command: 'claude plugin eval .' }, cwd: project() }), null);
});

test('outside a harness session the guard does nothing; the orchestrator agent counts as one', () => {
  const plain = { tool_name: 'Bash', tool_input: { command: 'claude plugin eval .' }, cwd: tmpdir() };
  assert.equal(decide(plain), null);
  assert.equal(decide({ ...plain, agent_type: 'harness-builder:harness-orchestrator' }).decision, 'deny');
  assert.equal(decide({ ...plain, agent_type: 'other:agent' }), null);
});

test('hook process: JSON decision on stdout, exit 0, silent on bad input', () => {
  const run = (stdin) => spawnSync(process.execPath, [HOOK], { input: stdin, encoding: 'utf8' });
  const r = run(JSON.stringify(call('claude plugin eval .')));
  assert.equal(r.status, 0);
  const out = JSON.parse(r.stdout).hookSpecificOutput;
  assert.equal(out.hookEventName, 'PreToolUse');
  assert.equal(out.permissionDecision, 'deny');
  const bad = run('not json');
  assert.equal(bad.status, 0);
  assert.equal(bad.stdout, '');
  const other = run(JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'ls' }, cwd: tmpdir() }));
  assert.equal(other.stdout, '');
});
