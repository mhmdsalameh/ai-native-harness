#!/usr/bin/env node
'use strict';
// PreToolUse hook: every `claude plugin eval` run in a harness-builder session needs a cost ceiling
// and the user's approval. Prints a JSON decision and exits 0; outside harness sessions it prints nothing.
const path = require('path');

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { raw += c; });
process.stdin.on('end', () => {
  let input;
  try { input = JSON.parse(raw || '{}'); } catch { process.exit(0); }
  let out = null;
  try {
    out = require(path.join(__dirname, '..', 'scripts', 'lib', 'guard.cjs')).decide(input);
  } catch (e) {
    out = { decision: 'ask', reason: `harness-builder eval guard failed (${e.message}); confirm this command yourself.` };
  }
  if (out) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: out.decision, permissionDecisionReason: out.reason } }));
  process.exit(0);
});
