'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { wrap, variant } = require('../lib/wrap.cjs');
const { readDoc } = require('../lib/fm.cjs');
const { inventory } = require('../lib/inventory.cjs');
const { tmpdir, writeTree, skill, lines } = require('./helpers.cjs');

function project() {
  return writeTree(tmpdir(), {
    'CLAUDE.md': '# Project rules\nAlways run tests.\n',
    '.claude/rules/style.md': lines(2, 'style'),
    '.claude/rules/api.md': '---\npaths: ["src/**"]\n---\nscoped\n',
    '.claude/skills/s/SKILL.md': skill('s', 'Does s. Use when testing wrap.'),
    '.claude/agents/a.md': '---\nname: a\ndescription: Agent a.\npermissionMode: plan\n---\nbody\n',
    '.claude/hooks/guard.sh': 'exit 0\n',
    '.claude/settings.json': JSON.stringify({
      permissions: { allow: ['Bash(ls)'] },
      hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [
        { type: 'command', command: '"$CLAUDE_PROJECT_DIR"/.claude/hooks/guard.sh' },
        { type: 'command', command: 'node $CLAUDE_PROJECT_DIR/tools/other.js' },
      ] }] },
    }),
  });
}

test('wrap: project harness becomes a plugin with rewritten hooks, context.md and a report', () => {
  const src = project();
  const out = path.join(tmpdir(), 'wrapped');
  const r = wrap(src, out, { name: 'My Harness' });
  assert.equal(r.name, 'my-harness');
  const hooks = JSON.parse(fs.readFileSync(path.join(out, 'hooks', 'hooks.json'), 'utf8')).hooks;
  assert.equal(hooks.PreToolUse[0].hooks[0].command, '${CLAUDE_PLUGIN_ROOT}/hooks/guard.sh');
  assert.ok(fs.existsSync(path.join(out, 'hooks', 'guard.sh')));
  assert.ok(r.notCarried.some((n) => /CLAUDE_PROJECT_DIR/.test(n)), 'hook outside .claude is reported');
  assert.ok(r.notCarried.some((n) => /permissions/.test(n)));
  assert.ok(r.notCarried.some((n) => /api\.md.*path-scoped/.test(n)));
  assert.ok(r.notCarried.some((n) => /permissionMode/.test(n)));
  const ctx = fs.readFileSync(path.join(out, 'context.md'), 'utf8');
  assert.match(ctx, /Always run tests/);
  assert.match(ctx, /style 1/);
  assert.doesNotMatch(ctx, /scoped/);
  const inv = inventory(out);
  assert.equal(inv.kind, 'plugin');
  assert.equal(inv.counts.skills, 1);
  assert.equal(inv.counts.hookHandlers, 2);
});

test('wrap: user harness rewrites ~/.claude paths and skips reserved skill folders', () => {
  const home = tmpdir();
  writeTree(home, {
    '.claude/CLAUDE.md': 'Be direct.\n',
    '.claude/skills/synced/b/x/SKILL.md': skill('x', 'Synced. Use when testing.'),
    '.claude/skills/mine/SKILL.md': skill('mine', 'Mine. Use when testing.'),
    '.claude/hooks/g.ps1': 'exit 0',
    '.claude/settings.json': JSON.stringify({ hooks: { Stop: [{ hooks: [
      { type: 'command', command: 'pwsh -File ~/.claude/hooks/g.ps1' },
      { type: 'command', command: 'powershell.exe -File "$USERPROFILE\\.claude\\hooks\\g.ps1"' },
      { type: 'command', command: 'bash "${HOME}/.claude/hooks/g.sh"' },
      { type: 'command', command: 'cmd /c %USERPROFILE%\\.claude\\hooks\\g.cmd' },
      { type: 'command', command: `node "${path.join(home, '.claude', 'hooks', 'g.js').replace(/\\/g, '/')}"` },
      { type: 'command', command: 'node /opt/other/.claude/x.js' },
    ] }] } }),
  });
  const out = path.join(tmpdir(), 'w');
  const r = wrap(path.join(home, '.claude'), out, { home });
  assert.equal(r.kind, 'user');
  const hooks = JSON.parse(fs.readFileSync(path.join(out, 'hooks', 'hooks.json'), 'utf8')).hooks;
  assert.deepEqual(hooks.Stop[0].hooks.map((h) => h.command), [
    'pwsh -File ${CLAUDE_PLUGIN_ROOT}/hooks/g.ps1',
    'powershell.exe -File "${CLAUDE_PLUGIN_ROOT}/hooks\\g.ps1"',
    'bash "${CLAUDE_PLUGIN_ROOT}/hooks/g.sh"',
    'cmd /c ${CLAUDE_PLUGIN_ROOT}/hooks\\g.cmd',
    'node "${CLAUDE_PLUGIN_ROOT}/hooks/g.js"',
    'node /opt/other/.claude/x.js',
  ]);
  assert.ok(r.notCarried.some((n) => /outside the plugin: node \/opt\/other/.test(n)));
  assert.ok(!fs.existsSync(path.join(out, 'skills', 'synced')));
  assert.ok(r.notCarried.some((n) => /synced/.test(n)));
});

test('wrap: refuses to overwrite a folder it did not generate; replaces its own output; copies evals without results', () => {
  const src = project();
  const busy = writeTree(tmpdir(), { 'keep.txt': 'mine' });
  assert.throws(() => wrap(src, busy), /refusing to overwrite/);
  assert.equal(fs.readFileSync(path.join(busy, 'keep.txt'), 'utf8'), 'mine');
  const suite = writeTree(tmpdir(), { 'c1/prompt.md': 'Do it.', 'results/x/aggregate-result.json': '{}' });
  const out = path.join(tmpdir(), 'w');
  wrap(src, out);
  const r2 = wrap(src, out, { evals: suite });
  assert.ok(fs.existsSync(path.join(out, 'evals', 'c1', 'prompt.md')));
  assert.ok(!fs.existsSync(path.join(out, 'evals', 'results')));
  assert.ok(r2.carried.some((c) => /eval suite/.test(c)));
  assert.throws(() => wrap(writeTree(tmpdir(), { '.claude-plugin/plugin.json': '{}' }), path.join(tmpdir(), 'x')), /already a plugin/);
});

test('variant: patches prompt.md cases, skips case.yaml-only and pre-set cases, validates folder names', () => {
  const plugin = writeTree(tmpdir(), {
    '.claude-plugin/plugin.json': '{"name":"p"}',
    'evals/a/prompt.md': '---\nmax_turns: 3\n---\nDo a.\n',
    'evals/a/graders/g.md': '---\ntype: regex\npattern: x\n---\n',
    'evals/b/case.yaml': 'schema_version: "1.1"\nname: b\n',
    'evals/c/prompt.md': '---\nappend_system_prompt: hi\n---\nDo c.\n',
    'evals/results/old/aggregate-result.json': '{}',
    'context.md': 'Rule: be direct.\nSecond rule.\n',
  });
  const r = variant(plugin, 'evals', 'evals-ctx', path.join(plugin, 'context.md'));
  assert.deepEqual(r.patched, ['a']);
  assert.equal(r.skipped.length, 2);
  const d = readDoc(path.join(plugin, 'evals-ctx', 'a', 'prompt.md'));
  assert.equal(d.data.max_turns, 3);
  assert.equal(d.data.append_system_prompt, 'Rule: be direct.\nSecond rule.');
  assert.match(d.body, /Do a\./);
  assert.ok(fs.existsSync(path.join(plugin, 'evals-ctx', 'a', 'graders', 'g.md')));
  assert.ok(!fs.existsSync(path.join(plugin, 'evals-ctx', 'results')));
  variant(plugin, 'evals', 'evals-ctx', path.join(plugin, 'context.md'));
  assert.throws(() => variant(plugin, 'evals', '../out', path.join(plugin, 'context.md')), /plain folder names/);
  assert.throws(() => variant(plugin, 'evals', 'evals/sub', path.join(plugin, 'context.md')), /separate folders/);
});
