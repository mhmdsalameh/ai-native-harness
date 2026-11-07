'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { inventory, detectLayout, toMarkdown } = require('../lib/inventory.cjs');
const { tmpdir, writeTree, skill, lines } = require('./helpers.cjs');

const rules = (r) => r.findings.map((f) => f.rule);

test('plugin: flags long SKILL.md, missing and over-long descriptions, duplicates, ignored agent keys, no evals', () => {
  const root = writeTree(tmpdir(), {
    '.claude-plugin/plugin.json': '{"name":"p"}',
    'skills/big/SKILL.md': skill('big', 'Does big things. Use when the user asks for big things.', 600),
    'skills/nodesc/SKILL.md': '---\nname: nodesc\n---\nbody\n',
    'skills/long/SKILL.md': skill('long', 'x'.repeat(1600)),
    'skills/dup-a/SKILL.md': skill('same', 'First of two skills with one name. Use when testing.'),
    'skills/dup-b/SKILL.md': skill('same', 'Second of two skills with one name. Use when testing.'),
    'skills/typo/SKILL.md': '---\nname: typo\ndescription: Checks typos in frontmatter keys. Use when testing.\nallowed_tools: [Read]\n---\n',
    'agents/quiet.md': '---\nname: quiet\n---\nbody\n',
    'agents/hooked.md': '---\nname: hooked\ndescription: Has hooks.\nhooks:\n  Stop:\n    - x\n---\n',
    'CLAUDE.md': 'conventions\n',
  });
  const r = inventory(root);
  assert.equal(r.kind, 'plugin');
  assert.equal(r.counts.skills, 6);
  assert.equal(r.counts.agents, 2);
  for (const rule of ['skill-length', 'skill-description', 'description-length', 'duplicate-skill', 'agent-description', 'plugin-agent-ignored', 'no-evals', 'skill-unknown-keys', 'plugin-claude-md']) {
    assert.ok(rules(r).includes(rule), `expected finding ${rule}; got ${rules(r).join(', ')}`);
  }
  assert.equal(r.findings[0].level, 'error');
  assert.match(toMarkdown(r), /## Findings/);
});

test('plugin with an eval suite and good skills has no warnings', () => {
  const root = writeTree(tmpdir(), {
    '.claude-plugin/plugin.json': '{"name":"p"}',
    'skills/ok/SKILL.md': skill('ok', 'Formats release notes. Use when the user asks for a release note.'),
    'evals/case-a/prompt.md': 'Do it.',
    'evals/group/case-b/prompt.md': 'Do it.',
    'evals/results/x/aggregate-result.json': '{}',
  });
  const r = inventory(root);
  assert.equal(r.counts.evalCases, 2);
  assert.deepEqual(r.findings.filter((f) => f.level !== 'info'), []);
});

test('project: CLAUDE.md over budget, imports counted once, scoped vs unscoped rules, settings hooks', () => {
  const root = writeTree(tmpdir(), {
    'CLAUDE.md': lines(250) + '@docs/extra.md\n```\n@not/an/import.md\n```\n',
    'docs/extra.md': lines(10, 'extra'),
    '.claude/rules/always.md': lines(5),
    '.claude/rules/api.md': '---\npaths: ["src/api/**"]\n---\n' + lines(5),
    '.claude/settings.json': JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'x' }, { type: 'prompt', prompt: 'y' }] }] } }),
    '.claude/skills/s/SKILL.md': skill('s', 'Short.'),
  });
  const r = inventory(root);
  assert.equal(r.kind, 'project');
  assert.equal(r.memory.length, 2, 'CLAUDE.md + one import; fenced @ ignored');
  assert.equal(r.counts.rulesUnscoped, 1);
  assert.equal(r.counts.rulesScoped, 1);
  assert.equal(r.counts.hookHandlers, 2);
  assert.ok(rules(r).includes('claude-md-length'));
  assert.ok(rules(r).includes('model-hooks'));
  assert.ok(rules(r).includes('description-vague'));
  assert.ok(r.alwaysLoaded.memoryTokens > 0);
  assert.deepEqual(detectLayout(path.join(root, '.claude')).kind, 'project');
});

test('user layout: ~/.claude detected by home, reserved skill folders skipped', () => {
  const home = tmpdir();
  writeTree(home, {
    '.claude/CLAUDE.md': '@~/.claude/rules/r.md\n',
    '.claude/rules/r.md': lines(3),
    '.claude/skills/synced/bucket/x/SKILL.md': skill('x', 'Synced skill. Use when testing.'),
    '.claude/skills/mine/SKILL.md': skill('mine', 'My skill. Use when testing user layout.'),
  });
  const r = inventory(path.join(home, '.claude'), { home });
  assert.equal(r.kind, 'user');
  assert.equal(r.counts.skills, 1);
  assert.deepEqual(r.skippedReserved, ['synced']);
  assert.equal(r.memory.length, 2);
  assert.equal(r.rules.unscoped[0].alsoImported, true);
});

test('an eval folder in another format is reported as info, not as missing evals', () => {
  const root = writeTree(tmpdir(), {
    '.claude-plugin/plugin.json': '{"name":"p"}',
    'skills/ok/SKILL.md': skill('ok', 'Formats release notes. Use when the user asks for a release note.'),
    'evals/harness/tasks/T1/task.json': '{}',
  });
  const r = inventory(root);
  assert.ok(rules(r).includes('evals-other-format'));
  assert.ok(!rules(r).includes('no-evals'));
});

test('rejects a folder that is not a harness', () => {
  assert.throws(() => inventory(tmpdir()), /no harness found/);
});
