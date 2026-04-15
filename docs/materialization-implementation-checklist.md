# Materialization Implementation Checklist

## Validation Gates

Every gate must pass for the proof to be mergeable. Gates are deterministic and automatable.

---

### Gate 1: Build

- [ ] `npm run build` exits 0
- [ ] `npm run typecheck` exits 0
- [ ] No TypeScript errors in `src/types.ts`, `src/materialize.ts`, or `src/index.ts`
- [ ] `dist/materialize.js` and `dist/materialize.d.ts` are emitted

### Gate 2: Tests Pass

- [ ] `npm test` exits 0
- [ ] All tests in `tests/materialize.test.ts` pass
- [ ] All tests in `tests/execute.test.ts` still pass (no regression)

### Gate 3: No External Imports

- [ ] `src/materialize.ts` imports only from `node:fs/promises`, `node:path`, and `./types.js`
- [ ] No imports from `@relayfile/*`, `relayfile`, or any package not in `devDependencies`
- [ ] Verify: `grep -r "from '@relayfile" src/materialize.ts` returns nothing
- [ ] Verify: `grep -r "from 'relayfile" src/materialize.ts` returns nothing

### Gate 4: No Existing Code Modified (Beyond Additive)

- [ ] `src/execute.ts` has zero diff
- [ ] `tests/execute.test.ts` has zero diff
- [ ] `src/types.ts` diff is additive only — existing `ExecuteOptions` and `ExecuteResult` unchanged
- [ ] `src/index.ts` diff is additive only — existing exports unchanged
- [ ] `package.json` has zero diff (no new dependencies)
- [ ] `tsconfig.json` has zero diff

---

## Required Test Cases

Each test case maps to a specific behavior of `materialize()`. All must exist in `tests/materialize.test.ts`.

### Format Tests

- [ ] **json**: Artifact serialized as `JSON.stringify(artifact, null, 2)`, written to file
- [ ] **json-compact**: Artifact serialized as `JSON.stringify(artifact)`, written to file
- [ ] **raw**: `result.stdout` written as-is, no JSON parsing
- [ ] **envelope**: Full `ExecuteResult` serialized as `JSON.stringify(result, null, 2)`
- [ ] **custom FormatFn**: Caller-provided function produces file content

### Condition Tests

- [ ] **on-success (default)**: Skips write when `result.ok === false`, returns `skippedReason`
- [ ] **on-success**: Writes when `result.ok === true`
- [ ] **on-artifact**: Skips write when `result.artifact === null`, returns `skippedReason`
- [ ] **on-artifact**: Writes when `result.artifact` is present
- [ ] **always**: Writes even when `result.ok === false` and `result.artifact === null`
- [ ] **custom ConditionFn**: Caller-provided predicate controls write decision

### Conflict Tests

- [ ] **overwrite**: Replaces existing file content
- [ ] **skip**: Leaves existing file untouched, returns `skippedReason`
- [ ] **append**: Appends new content to existing file
- [ ] **timestamp**: Creates new file with timestamp suffix, existing file untouched

### Path Tests

- [ ] **static string path**: Resolves relative to `basePath`
- [ ] **function path**: Function receives `result` and `context`, return value used as path
- [ ] **nested path**: Intermediate directories created automatically via `mkdir -p`
- [ ] **absolute path**: Used as-is, `basePath` ignored

### Dry-Run Tests

- [ ] **dry-run returns resolved path**: `output.path` is the absolute path that would be written
- [ ] **dry-run returns formatted content**: `output.content` contains the serialized content
- [ ] **dry-run does not write**: No file exists at `output.path` after dry-run
- [ ] **dry-run written is false**: `output.written === false`

### Integration Test

- [ ] **execute + materialize**: `execute()` a real command (e.g., `echo '{"k":"v"}'`), pass result to `materialize()`, verify file on disk contains expected JSON

### Default Behavior Tests

- [ ] **default condition is on-success**: Omitting `condition` from rule behaves as `'on-success'`
- [ ] **default conflict is overwrite**: Omitting `conflict` from rule behaves as `'overwrite'`
- [ ] **default basePath is cwd**: Omitting `basePath` resolves relative to `process.cwd()`

---

## Structural Checks

- [ ] `src/materialize.ts` exports exactly one public function: `materialize`
- [ ] `src/index.ts` re-exports `materialize` and all new types
- [ ] `materialize()` never calls `execute()` — verify no import of `execute` in `materialize.ts`
- [ ] `materialize()` is async (returns `Promise<MaterializeOutput>`)
- [ ] All internal helpers (`resolvePath`, `formatContent`, `evaluateCondition`, `handleConflict`) are not exported

---

## Test Infrastructure Notes

- Tests use `vitest` (already configured)
- Tests should use temporary directories (`os.tmpdir()` + unique subdirectory) for file operations
- Tests must clean up temporary files/directories after each test (use `afterEach` or `afterAll`)
- No mocking of `node:fs` — tests write real files to temp directories
- The integration test uses a real `execute()` call (e.g., `echo` command)
