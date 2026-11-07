'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { inventory } = require('../lib/inventory.cjs');
const { decide } = require('../lib/guard.cjs');
const { tmpdir, writeTree } = require('./helpers.cjs');

test('inventory reads a BOM + CRLF SKILL.md with a folded description', () => {
  const root = writeTree(tmpdir(), {
    '.claude-plugin/plugin.json': '{}',
    'skills/crlf/SKILL.md': '﻿---\r\nname: crlf\r\ndescription: >\r\n  Folded CRLF description. Use when testing\r\n  line endings.\r\n---\r\nbody\r\n',
  });
  const r = inventory(root);
  assert.equal(r.skills[0].name, 'crlf');
  assert.equal(r.skills[0].descriptionChars, 'Folded CRLF description. Use when testing line endings.'.length);
  assert.ok(!r.findings.some((f) => /skill-(frontmatter|description)/.test(f.rule)));
});

test('eval guard: case, quoting, extra whitespace and a zero ceiling', () => {
  const cwd = writeTree(tmpdir(), { '.harness/harness.json': '{}' });
  const d = (command) => decide({ tool_name: 'PowerShell', tool_input: { command }, cwd });
  assert.equal(d('CLAUDE PLUGIN EVAL . --MAX-COST-USD 3').decision, 'ask');
  assert.equal(d('& "claude" plugin eval .').decision, 'deny');
  assert.equal(d('claude  plugin   eval\t. --max-cost-usd=0').decision, 'ask');
  assert.equal(d(''), null);
  assert.equal(decide({ tool_name: 'Bash', tool_input: {}, cwd }), null);
  assert.equal(decide({}), null);
});
