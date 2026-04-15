# OSS Readiness Boundary — First Slice

## What This Document Defines

This is the boundary definition for the **first OSS/public-repo readiness slice** of `relayfile-cli`. It answers: what is the smallest credible set of changes that moves this repo from "private internal project" to "clean public repo candidate"?

## Current State (Pre-Slice)

As of 2026-04-15, the repo contains:

| Asset | Status | Notes |
|-------|--------|-------|
| `src/execute.ts` | Exists, tested, passes | Core execute function — 150 lines |
| `src/types.ts` | Exists | `ExecuteOptions`, `ExecuteResult` |
| `src/index.ts` | Exists | Re-exports execute + types |
| `tests/execute.test.ts` | Exists, 8/8 pass | Covers success, failure, timeout, stderr, env, JSON parse |
| `package.json` | Exists | Missing: `license`, `repository`, `engines`, `author`, `keywords`. Has `"private": true` |
| `tsconfig.json` | Exists | Clean, strict mode |
| `README.md` | Exists | Stub only — 10 lines, no install/usage/API docs |
| `.gitignore` | **Missing** | `node_modules/` and `dist/` are untracked but not ignored |
| `LICENSE` | **Missing** | No license file |
| `CONTRIBUTING.md` | **Missing** | No contributor guidance |
| `CHANGELOG.md` | **Missing** | No changelog |
| Build (`tsc`) | Passes | `dist/` output is clean |
| `docs/` | 7 files | Internal workflow/proof docs — not public-facing |

## What Is In Scope for This Slice

This slice covers **repo hygiene and metadata only** — the minimum to make the repo presentable as a public project. It does NOT add features, refactor code, or change runtime behavior.

### 1. `.gitignore`

The repo has no `.gitignore`. `node_modules/` and `dist/` show as untracked in git status. A public repo must have a `.gitignore` to prevent accidental commits of build artifacts and dependencies.

Required entries:
- `node_modules/`
- `dist/`
- `.env`
- `*.tsbuildinfo`

### 2. `LICENSE`

No license file exists. Without a license, the code is "all rights reserved" by default — unusable by anyone. A license is the single most important file for OSS readiness.

Decision needed: which license? MIT is the most common for this type of utility. ISC is also reasonable. Apache 2.0 if patent protection matters.

### 3. `package.json` metadata

The following fields are missing and expected for a public npm package:

| Field | Current | Required for OSS |
|-------|---------|-----------------|
| `license` | missing | Yes — must match LICENSE file |
| `repository` | missing | Yes — standard for npm packages |
| `engines` | missing | Recommended — declares Node version |
| `author` | missing | Recommended |
| `keywords` | missing | Optional but helpful for discoverability |
| `private` | `true` | Must be removed or set to `false` before publishing |

### 4. `README.md` expansion

The current README is a 10-line stub. For a public repo, the README needs:

- One-paragraph summary of what the tool does
- Install instructions
- Basic usage example (showing `execute()` API)
- API reference for `ExecuteOptions` and `ExecuteResult`
- Link to LICENSE
- Development instructions (build, test)

### 5. `.gitignore` enforcement: remove tracked artifacts

If `dist/` or `node_modules/` have been committed to any branch, they should be removed from tracking.

## What Is NOT In Scope for This Slice

These are real gaps, but they belong in future slices:

- **CI/CD pipeline** (GitHub Actions for test/build/lint) — important but not blocking for initial public visibility
- **Linting/formatting** (ESLint, Prettier) — code quality tooling, not a readiness prerequisite
- **CONTRIBUTING.md** — important for accepting contributions, but the repo is too small for that to be the bottleneck
- **CHANGELOG.md** — the repo has 6 commits; a changelog adds no value yet
- **CODE_OF_CONDUCT.md** — standard for community projects, but not blocking for initial release
- **npm publishing setup** — the package is `"private": true`; actual npm publish is a separate decision
- **Additional runtime features** — no new code in this slice
- **Process-tree timeout hardening** — identified in proof review as a gap, but that is a code quality slice, not an OSS readiness slice

## Boundary Rules for This Slice

1. **No runtime code changes.** `src/` files are untouched.
2. **No test changes.** `tests/` files are untouched.
3. **No new dependencies.** Only metadata and documentation.
4. **No CI/CD.** That is a separate slice.
5. **Every change must be verifiable by reading a file.** No hidden state.

## Exit Criteria

The slice is complete when:

- [ ] `.gitignore` exists with correct entries
- [ ] `LICENSE` file exists with chosen license text
- [ ] `package.json` has `license`, `repository`, and `engines` fields
- [ ] `README.md` has install, usage, and API sections
- [ ] `dist/` and `node_modules/` are not tracked by git
- [ ] All existing tests still pass
- [ ] Build still succeeds
