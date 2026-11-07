---
type: regex
target: { source: file, path: design.md }
pattern: 'secrets[^\n]*(hook|PreToolUse|permission|deny)'
flags: i
---
