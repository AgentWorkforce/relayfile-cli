# Canonical Schema Conformance — Implementation Checklist

## Pre-Implementation Gates

- [ ] Confirm `npm run build` passes (no pre-existing build failures)
- [ ] Confirm `npm test` passes (all 30 existing tests green)
- [ ] Confirm `npm run typecheck` passes
- [ ] Confirm `tests/helpers/` directory does not exist yet (create fresh)

## Implementation Tasks

### 1. Create Conformance Helper

- [ ] Create `tests/helpers/conform-github.ts`
- [ ] Implement `conformGitHubIssue(result: ExecuteResult): string`
  - [ ] Maps `state` from uppercase to lowercase (`"OPEN"` → `"open"`)
  - [ ] Flattens `labels` from `[{name, id, color}]` to `string[]`
  - [ ] Flattens `assignees` from `[{login, id}]` to `string[]`
  - [ ] Renames `createdAt` to `created_at`
  - [ ] Renames `updatedAt` to `updated_at`
  - [ ] Normalizes `body` to `null` when falsy
  - [ ] Returns `JSON.stringify(canonical, null, 2)`
- [ ] Verify: only import is `ExecuteResult` from `../../src/types.js`

### 2. Create Conformance Test Suite

- [ ] Create `tests/canonical-conformance.test.ts`
- [ ] Define `EXPECTED_CANONICAL_ISSUE` constant (the Layer 2 target shape)
- [ ] Define `RAW_CLI_OUTPUT` constant (the Layer 1 raw CLI shape)

#### Test Cases

- [ ] **Test: canonical conformance** — `execute()` + `conformGitHubIssue` FormatFn + `materialize()` produces file deep-equal to `EXPECTED_CANONICAL_ISSUE`
  - Executes `node -e` emitting `RAW_CLI_OUTPUT`
  - Materializes with `format: conformGitHubIssue`
  - Uses adapter-compatible path: `github/repos/acme/api/issues/${number}.json`
  - Reads file back, parses JSON, asserts `toEqual(EXPECTED_CANONICAL_ISSUE)`

- [ ] **Test: schema divergence** — `format: 'json'` (no FormatFn) produces non-canonical output
  - Same `node -e` execution
  - Materializes with `format: 'json'`
  - Asserts `state` is `"OPEN"` (not lowercase)
  - Asserts `labels[0]` has `id` property (not flattened)
  - Asserts `assignees[0]` has `id` property (not flattened)
  - Asserts `createdAt` is present, `created_at` is absent

- [ ] **Test: round-trip equivalence** — full pipeline produces byte-level canonical match
  - Execute → conform → materialize → read file → parse → deep equal
  - Uses canonical VFS path `github/repos/acme/api/issues/42.json`

- [ ] **Test: import isolation** — conformance helper has zero cross-repo imports
  - Reads `tests/helpers/conform-github.ts` as string
  - Asserts no match for `@relayfile/adapter`
  - Asserts no match for `@relayfile/provider`
  - Asserts no match for `relayfile-adapters`
  - Asserts no match for `relayfile-providers`
  - Asserts no match for `@relayfile/sdk`

### 3. Temp Directory Hygiene

- [ ] Each test uses `mkdtemp` for isolated filesystem
- [ ] Each test cleans up with `rm(mountRoot, { recursive: true })` in `afterEach` or inline

## Validation Gates

### Must Pass

- [ ] `npm run build` — exits 0, no errors
- [ ] `npm test` — all tests pass (existing 30 + 4 new = 34 total)
- [ ] `npm run typecheck` — exits 0, no errors

### Boundary Integrity

- [ ] `git diff src/` — empty (zero runtime code changes)
- [ ] `git diff package.json` — empty (zero dependency changes)
- [ ] `git diff tsconfig.json` — empty (zero config changes)
- [ ] `git diff src/index.ts` — empty (zero export surface changes)

### Import Verification

- [ ] `tests/helpers/conform-github.ts` imports only from `../../src/types.js`
- [ ] `tests/canonical-conformance.test.ts` imports from:
  - `../src/execute.js` (execute function)
  - `../src/materialize.js` (materialize function)
  - `./helpers/conform-github.js` (conformance helper)
  - `node:fs/promises` (mkdtemp, readFile, rm)
  - `node:path` (join)
  - `node:os` (tmpdir)
  - `vitest` (describe, it, expect, etc.)
  - Nothing else

## Post-Implementation Verification

- [ ] The conformance test proves `FormatFn` is sufficient for Layer 1 → Layer 2 mapping
- [ ] The divergence test proves conformance is opt-in, not automatic
- [ ] The round-trip test proves no data loss through the pipeline
- [ ] The isolation test proves the conformance helper is self-contained
- [ ] No file in `src/` contains the word "canonical" or "conform"
- [ ] No file in `src/` imports from `tests/`

## Definition of Done

All of the following must be true:

1. `tests/helpers/conform-github.ts` exists with a single exported function
2. `tests/canonical-conformance.test.ts` exists with 4 passing test cases
3. `npm run build && npm test && npm run typecheck` all exit 0
4. Zero changes to any file under `src/`
5. Zero changes to `package.json` or `tsconfig.json`
6. The conformance helper has zero imports from any `@relayfile/*` package
7. `materialize()` remains schema-unaware — no canonical schema knowledge in runtime code
