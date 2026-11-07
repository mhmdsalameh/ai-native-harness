'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { splitFrontmatter, parseFrontmatter, addBlockField } = require('../lib/fm.cjs');

test('parses scalars, quoted strings, booleans, numbers and inline lists', () => {
  const d = parseFrontmatter([
    'name: my-skill',
    'description: "Does X. Use when: Y"',
    "quoted: 'it''s'",
    'disable-model-invocation: true',
    'runs: 3',
    'allowed_tools: [Read, "Glob", Skill]',
    'empty: []',
  ].join('\n'));
  assert.equal(d.name, 'my-skill');
  assert.equal(d.description, 'Does X. Use when: Y');
  assert.equal(d.quoted, "it's");
  assert.equal(d['disable-model-invocation'], true);
  assert.equal(d.runs, 3);
  assert.deepEqual(d.allowed_tools, ['Read', 'Glob', 'Skill']);
  assert.deepEqual(d.empty, []);
});

test('parses literal and folded block scalars and dash lists', () => {
  const d = parseFrontmatter('description: >\n  first line\n  second line\nprompt: |\n  a\n\n  b\ntags:\n  - smoke\n  - fast\nnext: x');
  assert.equal(d.description, 'first line second line');
  assert.equal(d.prompt, 'a\n\nb');
  assert.deepEqual(d.tags, ['smoke', 'fast']);
  assert.equal(d.next, 'x');
});

test('keeps nested maps as raw text with the key present', () => {
  const d = parseFrontmatter('hooks:\n  PreToolUse:\n    - matcher: Bash\nname: a');
  assert.ok('hooks' in d);
  assert.match(d.hooks.__raw, /PreToolUse/);
  assert.equal(d.name, 'a');
});

test('splitFrontmatter handles BOM, CRLF and missing frontmatter', () => {
  assert.equal(splitFrontmatter('﻿---\r\nname: a\r\n---\r\nbody').raw, 'name: a');
  assert.equal(splitFrontmatter('---\r\nname: a\r\n---\r\nbody').body, 'body');
  const none = splitFrontmatter('# just text');
  assert.equal(none.raw, null);
  assert.equal(none.body, '# just text');
});

test('addBlockField adds a block scalar that parses back to the same text', () => {
  const ctx = 'Rule one.\n\n  indented line\nLast: with colon';
  const out = addBlockField('---\nmax_turns: 5\n---\n\nDo the task.\n', 'append_system_prompt', ctx);
  const { raw, body } = splitFrontmatter(out);
  const d = parseFrontmatter(raw);
  assert.equal(d.max_turns, 5);
  assert.equal(d.append_system_prompt, ctx);
  assert.equal(body, '\nDo the task.\n');
});

test('addBlockField creates frontmatter when absent and keeps CRLF', () => {
  const out = addBlockField('Do it.\r\n', 'k', 'v1\nv2');
  assert.ok(out.startsWith('---\r\nk: |\r\n  v1\r\n  v2\r\n---\r\n'));
  assert.equal(parseFrontmatter(splitFrontmatter(out).raw).k, 'v1\nv2');
});
