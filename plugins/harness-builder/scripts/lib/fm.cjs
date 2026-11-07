'use strict';
// Minimal YAML-frontmatter reader/writer for SKILL.md, agent, command and eval files.
// Supports the subset these files use: scalars, quoted strings, inline lists, "- item" lists,
// block scalars (| and >). Nested maps are kept as raw text so callers can still see the key.

const fs = require('fs');

function splitFrontmatter(text) {
  const src = text.replace(/^﻿/, '');
  const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(src);
  if (!m) return { raw: null, body: src };
  return { raw: m[1], body: src.slice(m[0].length) };
}

function unquote(v) {
  const s = v.trim();
  if (s.length >= 2 && ((s[0] === '"' && s.endsWith('"')) || (s[0] === "'" && s.endsWith("'")))) {
    const inner = s.slice(1, -1);
    return s[0] === "'" ? inner.replace(/''/g, "'") : inner.replace(/\\"/g, '"').replace(/\\n/g, '\n');
  }
  return s;
}

function parseScalar(v) {
  const s = v.trim();
  if (s === '') return '';
  if (s.startsWith('[') && s.endsWith(']')) {
    const inner = s.slice(1, -1).trim();
    return inner === '' ? [] : inner.split(',').map((x) => unquote(x));
  }
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  return unquote(s);
}

function parseFrontmatter(raw) {
  const data = {};
  if (raw == null) return data;
  const lines = raw.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = /^([A-Za-z_][\w-]*)\s*:(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1];
    const rest = m[2].trim();
    const childLines = [];
    while (i + 1 < lines.length && (/^\s+\S/.test(lines[i + 1]) || /^\s*$/.test(lines[i + 1]) || /^-\s/.test(lines[i + 1]))) {
      if (/^-\s/.test(lines[i + 1]) && rest !== '') break;
      childLines.push(lines[++i]);
    }
    while (childLines.length && /^\s*$/.test(childLines[childLines.length - 1])) childLines.pop();
    if (/^[|>][+-]?$/.test(rest)) {
      const indent = Math.min(...childLines.filter((l) => l.trim()).map((l) => l.match(/^\s*/)[0].length));
      const body = childLines.map((l) => l.slice(Number.isFinite(indent) ? indent : 0));
      data[key] = rest[0] === '|' ? body.join('\n') : body.join('\n').replace(/([^\n])\n(?=[^\n])/g, '$1 ');
    } else if (rest === '' && childLines.length && childLines.every((l) => /^\s*-\s/.test(l) || !l.trim())) {
      data[key] = childLines.filter((l) => l.trim()).map((l) => parseScalar(l.replace(/^\s*-\s/, '')));
    } else if (rest === '' && childLines.length) {
      data[key] = { __raw: childLines.join('\n') };
    } else {
      data[key] = parseScalar(rest);
    }
  }
  return data;
}

function readDoc(file) {
  const text = fs.readFileSync(file, 'utf8');
  const { raw, body } = splitFrontmatter(text);
  return { text, raw, body, data: parseFrontmatter(raw), hasFrontmatter: raw != null };
}

// Adds `key: |` with an indented block to a document's frontmatter, creating frontmatter if absent.
function addBlockField(text, key, value) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const block = `${key}: |${eol}` + value.replace(/\r\n/g, '\n').replace(/\s+$/, '').split('\n').map((l) => (l ? '  ' + l : '')).join(eol);
  const src = text.replace(/^﻿/, '');
  const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/.exec(src);
  if (!m) return `---${eol}${block}${eol}---${eol}${eol}${src}`;
  return `---${eol}${m[1]}${eol}${block}${eol}---${m[2] || eol}${src.slice(m[0].length)}`;
}

module.exports = { splitFrontmatter, parseFrontmatter, readDoc, addBlockField };
