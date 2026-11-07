# ai-native-harness

Plugin marketplace for **Harness Builder**: an agent that researches, builds, evaluates and
optimizes Claude Code harnesses, new or existing, and proves with evals that the harness beats
Claude without it.

- Plugin: [`plugins/harness-builder`](plugins/harness-builder) (usage, requirements, contents)
- Marketplace file: [`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json)
- Research behind the design: [`docs/research/`](docs/research)
- Intent, spec and plan: [`docs/sdlc/harness-builder/`](docs/sdlc/harness-builder)

## Install

```
claude plugin marketplace add C:/Users/Pc/ai-native-harness     # or the GitHub repo once pushed
claude plugin install harness-builder@ai-native-harness
```

## Release

1. Raise `version` in `plugins/harness-builder/.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`.
2. `cd plugins/harness-builder && node --test scripts/test/*.test.cjs && claude plugin validate .`
3. Run the self-test suite (costs money): `claude plugin eval plugins/harness-builder --runs 3 --max-cost-usd 15 --allow-tools Write Edit --no-publish`.
