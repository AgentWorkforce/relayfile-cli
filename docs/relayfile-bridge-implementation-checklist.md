# Bridge Implementation Checklist

## Prerequisites

- [x] `execute()` implemented and passing (8 tests)
- [x] `materialize()` implemented and passing (22 tests)
- [x] `MaterializeRule` types support function-based paths (`PathTemplate`)
- [x] `MaterializeRule` types support custom format functions (`FormatFn`)
- [x] Materialization review verdict: pass
- [x] Bridge boundary document written (`docs/relayfile-bridge-implementation-boundary.md`)
- [x] Bridge implementation plan written (`docs/relayfile-bridge-implementation-plan.md`)

## Implementation Tasks

### tests/bridge.test.ts

- [ ] Create file with correct import block (vitest, src/execute, src/materialize, node built-ins only)
- [ ] Add `describe('bridge')` test suite with beforeEach/afterEach temp directory management
- [ ] **Test 1:** Single-item bridge — `execute()` JSON artifact → `materialize()` with GitHub issue path convention → file at `github/repos/acme/api/issues/42.json`
  - Assert: `output.written === true`
  - Assert: `output.path` matches `{mountRoot}/github/repos/acme/api/issues/42.json`
  - Assert: file content is valid JSON with correct fields
- [ ] **Test 2:** Multi-item bridge — `execute()` JSON array → caller loop → `materialize()` per item → files at `github/repos/acme/api/issues/1.json` and `github/repos/acme/api/issues/2.json`
  - Assert: both files exist
  - Assert: each file has correct content
- [ ] **Test 3:** Dry-run bridge — `execute()` JSON artifact → `materialize()` with `dryRun: true` → no file written, path resolves to adapter-compatible location
  - Assert: `output.written === false`
  - Assert: `output.path` matches `/hypothetical/mount/github/repos/acme/api/issues/99.json`
  - Assert: `output.content` is populated
- [ ] **Test 4:** Custom format bridge — `execute()` vendor-shaped JSON → `materialize()` with `FormatFn` that maps to canonical schema shape → file with remapped fields
  - Assert: `state` is lowercased (`"OPEN"` → `"open"`)
  - Assert: `labels` array is flattened (objects → strings)
  - Assert: `assignees` array is flattened (objects → strings)
  - Assert: field names are snake_case (`createdAt` → `created_at`)
- [ ] **Test 5:** Nested directory creation — adapter-compatible path with 5 levels of nesting is created automatically
  - Assert: `output.written === true`
  - Assert: file exists at deep path
  - Assert: content is valid JSON

### docs/adapter-path-conventions.md

- [ ] Create file with preamble explaining these are naming conventions, not code dependencies
- [ ] Add GitHub CLI → adapter path mapping table
  - `gh issue view {n}` → `github/repos/{owner}/{repo}/issues/{n}.json`
  - `gh pr view {n}` → `github/repos/{owner}/{repo}/pulls/{n}/metadata.json`
  - `gh repo view` → `github/repos/{owner}/{repo}/metadata.json`
  - `gh issue list` → caller loops, one file per issue at convention path
  - `gh pr list` → caller loops, one file per PR at convention path
- [ ] Add note that conventions are not enforced by relayfile-cli
- [ ] Add note that callers using non-standard paths for novel data are fine

## Validation Gates

- [ ] `npm run build` exits 0
- [ ] `npm run typecheck` exits 0
- [ ] `npm test` exits 0 with all tests passing (30 existing + 5 new = 35 total)
- [ ] Import boundary verified: `tests/bridge.test.ts` imports only from `vitest`, `../src/`, and `node:` modules
- [ ] Zero modifications to existing source files (`src/execute.ts`, `src/materialize.ts`, `src/types.ts`, `src/index.ts` unchanged)

## Post-Implementation Verification

- [ ] No new runtime exports added to `src/index.ts`
- [ ] No new dependencies added to `package.json`
- [ ] No imports from core relayfile, relayfile-adapters, or relayfile-providers anywhere in codebase
- [ ] Bridge test file follows same patterns as `tests/materialize.test.ts` (temp dirs, cleanup, assertion style)

## Completion Signal

All checkboxes above are checked → emit `RELAYFILE_CLI_BRIDGE_IMPLEMENTATION_READY`
