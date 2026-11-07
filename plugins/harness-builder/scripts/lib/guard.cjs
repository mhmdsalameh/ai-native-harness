'use strict';
// Eval-spend gate. Decides on a Bash/PowerShell call before it runs. Acts only in harness-builder
// sessions (the orchestrator agent, or a folder with .harness/harness.json); elsewhere returns null.

const fs = require('fs');
const path = require('path');

const EVAL_RUN = /\bclaude(?:\.exe)?["']?\s+plugin\s+eval\b(?!\s+(?:init|--help|-h)\b)/i;
const CEILING = /--max-cost-usd(?:\s+|=)["']?(\d+(?:\.\d+)?)/i;

function inHarnessSession(input) {
  if (typeof input.agent_type === 'string' && /(^|:)harness-orchestrator$/.test(input.agent_type)) return true;
  const cwd = typeof input.cwd === 'string' ? input.cwd : null;
  return !!cwd && fs.existsSync(path.join(cwd, '.harness', 'harness.json'));
}

function decide(input) {
  if (!input || !['Bash', 'PowerShell'].includes(input.tool_name)) return null;
  const cmd = input.tool_input && typeof input.tool_input.command === 'string' ? input.tool_input.command : '';
  if (!EVAL_RUN.test(cmd) || !inHarnessSession(input)) return null;
  const m = CEILING.exec(cmd);
  if (!m) {
    return { decision: 'deny', reason: 'Every eval run needs a cost ceiling. Run `hb estimate <eval dir>`, show the user the range, then re-run with --max-cost-usd <suggested ceiling>.' };
  }
  return { decision: 'ask', reason: `This eval run calls the model with the user's credentials and can spend up to about $${m[1]} (list-price estimate, plus runs already in flight). Approve to run it.` };
}

module.exports = { decide, inHarnessSession, EVAL_RUN };
