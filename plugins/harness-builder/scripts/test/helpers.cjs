'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

function tmpdir(prefix = 'hb-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// Writes a tree described as { 'rel/path': 'content' }.
function writeTree(root, tree) {
  for (const [rel, content] of Object.entries(tree)) {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  }
  return root;
}

const skill = (name, description, bodyLines = 3) =>
  `---\nname: ${name}\ndescription: ${description}\n---\n` + Array.from({ length: bodyLines }, (_, i) => `line ${i}`).join('\n') + '\n';

const lines = (n, prefix = 'rule') => Array.from({ length: n }, (_, i) => `${prefix} ${i}`).join('\n') + '\n';

module.exports = { tmpdir, writeTree, skill, lines };
