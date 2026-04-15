# OSS Readiness Review Verdict — First Slice

## Verdict

The repo is **not yet ready for public release**, but the gap is small, well-defined, and entirely non-code.

**Readiness score: 55/100**

The runtime implementation is solid (execute proof scored 88/100). What is missing is exclusively repo hygiene and metadata — the "packaging" around the code. This is a common and fixable state for a project that started as an internal tool.

## What Is Already Good

### Runtime quality (no changes needed)

- **`src/execute.ts`**: 150 lines, clean, well-structured. Uses `node:child_process` only. No external runtime dependencies. Process-tree kill with SIGTERM→SIGKILL escalation. Proper buffer handling for stdout/stderr.
- **`src/types.ts`**: Two clean interfaces (`ExecuteOptions`, `ExecuteResult`). No unnecessary complexity.
- **`src/index.ts`**: Clean re-export barrel. Exports both the function and the types.
- **`tsconfig.json`**: Strict mode, correct module resolution (Node16), declaration + sourcemap output. Properly scoped `include`/`exclude`.

### Test quality (no changes needed)

- **8 tests, all passing** in 544ms.
- Covers: success, non-zero exit, missing command, timeout, stderr capture, env merge, JSON parse success, JSON parse failure.
- Tests use real process execution, not mocks — appropriate for this type of substrate.

### Build (no changes needed)

- `tsc` succeeds cleanly.
- Output in `dist/` includes `.js`, `.d.ts`, `.d.ts.map`, `.js.map` — correct for a publishable package.

### Boundary discipline (no changes needed)

- Zero imports from any `@relayfile` package.
- Zero server, VFS, OAuth, or adapter code.
- The repo is a genuine leaf node in the dependency graph, as documented.

## What Is Missing

### Critical gaps (must fix before public)

| Gap | Impact | Effort |
|-----|--------|--------|
| **No `.gitignore`** | `node_modules/` and `dist/` show as untracked in `git status`. Anyone cloning will see noise. Risk of accidental commit of 91 `node_modules/` entries. | 5 minutes |
| **No `LICENSE` file** | Without a license, the code is legally "all rights reserved." No one can use, modify, or distribute it. This is the single biggest blocker. | 5 minutes |
| **No `license` field in `package.json`** | npm will warn. GitHub will show "No license" on the repo page. | 1 minute |
| **No `repository` field in `package.json`** | npm and tooling can't link back to source. | 1 minute |
| **`@agent-relay/sdk` in `dependencies`** | This is a private package. `npm install` will fail for any external user. The `workflow` script depends on it, but that script is internal tooling, not part of the public API. | 5 minutes |

### Important gaps (should fix before public)

| Gap | Impact | Effort |
|-----|--------|--------|
| **`README.md` is a stub** | 10 lines, no install/usage/API docs. A public repo with no usage instructions will not be adopted. | 30 minutes |
| **No `engines` field** | Users won't know which Node version is required. The code targets ES2022, which needs Node 18+. | 1 minute |
| **`"private": true` in `package.json`** | Blocks `npm publish`. Fine if the intent is source-only visibility, but should be a conscious decision. | 1 minute |

### Deferred (not blocking first public release)

| Gap | Why deferred |
|-----|-------------|
| CI/CD (GitHub Actions) | Infra concern, separate from source readiness |
| Linting/formatting | Code quality, not a prerequisite |
| CONTRIBUTING.md | Repo is 3 source files; premature |
| CHANGELOG.md | 6 commits; no meaningful history |
| Process-tree test hardening | Code quality, not OSS hygiene |

## Risk Assessment

### Risk: `@agent-relay/sdk` dependency

This is the most subtle problem. The package.json lists `@agent-relay/sdk` as a production dependency with `"latest"` version. This dependency:

1. Is not on the public npm registry (will cause `npm install` to fail for external users)
2. Is used only by the `workflow` script, which is internal tooling
3. Has no imports from any `src/` or `tests/` file

**Recommendation:** Remove `@agent-relay/sdk` from `dependencies` and remove the `workflow` script from `package.json`. If internal workflows need it, use a separate config or script outside of `package.json`.

### Risk: `dist/` committed to git

`dist/` currently shows as untracked (good), but without a `.gitignore`, it's one `git add .` away from being committed. Build artifacts in version control are a common anti-pattern in OSS repos and cause merge conflicts, bloated clones, and confusion about which files are source.

### Risk: internal docs in `docs/`

The `docs/` directory contains 7 files that are internal workflow artifacts (proof plans, boundary reviews, verdict documents). These are valuable for the project's history but may confuse external users who expect public-facing documentation. Consider whether these should remain in the public repo or move to a separate location.

This is a judgment call, not a blocker. Some projects keep their decision records public as a form of transparency.

## Scoring Breakdown

| Category | Weight | Score | Notes |
|----------|--------|-------|-------|
| Runtime implementation | 25% | 95 | Clean, tested, bounded |
| Test coverage | 15% | 85 | Good but process-tree gap from prior review |
| Build/typecheck | 10% | 100 | Passes cleanly |
| Boundary discipline | 10% | 100 | No leaks |
| License | 15% | 0 | Missing entirely |
| Package metadata | 10% | 20 | Has name/version/description only |
| README/docs | 10% | 15 | Stub README, no public-facing docs |
| Repo hygiene (.gitignore, etc.) | 5% | 0 | Missing .gitignore |
| **Weighted total** | **100%** | **55** | |

## Recommended Execution Order

1. **Add `.gitignore`** — prevents accidental commits while working on the rest
2. **Add `LICENSE`** — removes the legal blocker
3. **Fix `package.json`** — add `license`, `repository`, `engines`; remove or move `@agent-relay/sdk`
4. **Expand `README.md`** — add install, usage, API reference, dev instructions
5. **Decide on `"private": true`** — keep or remove based on publish intent

After these five steps, the repo moves from 55/100 to approximately 90/100 — a credible public repo with clean metadata, legal clarity, and usable documentation.

## Final Judgment

The code is ready. The packaging is not. The gap is small (estimated under 1 hour of work) and entirely non-code. The first OSS readiness slice is well-bounded: fix the five items above, and the repo is a legitimate public project.

---

**Artifact produced:** `docs/oss-readiness-review-verdict.md`

RELAYFILE_CLI_OSS_READINESS_REVIEW_COMPLETE
