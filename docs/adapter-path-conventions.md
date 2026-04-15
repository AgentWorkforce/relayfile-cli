# Adapter Path Conventions

These conventions are reference patterns for callers composing `execute()` and `materialize()`. They are not runtime dependencies, not type definitions, and not enforced by `relayfile-cli`.

The proving case here is GitHub. The paths mirror relayfile-style adapter layouts closely enough to prove bridge alignment while keeping this repo generic and filesystem-only.

| CLI command | Suggested path pattern | Notes |
|-------------|------------------------|-------|
| `gh issue view {n}` | `github/repos/{owner}/{repo}/issues/{n}.json` | Single issue metadata file |
| `gh pr view {n}` | `github/repos/{owner}/{repo}/pulls/{n}/metadata.json` | Pull request metadata file |
| `gh repo view` | `github/repos/{owner}/{repo}/metadata.json` | Repository metadata file |
| `gh issue list` | Caller loops to `github/repos/{owner}/{repo}/issues/{n}.json` | One file per issue item |
| `gh pr list` | Caller loops to `github/repos/{owner}/{repo}/pulls/{n}/metadata.json` | One file per PR item |

`relayfile-cli` does not validate these names. Callers can use different paths when they are materializing novel data or when a downstream filesystem layout needs a different convention.
