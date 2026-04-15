# Bridge Implementation Plan

## Overview

This plan implements the bridge proof: demonstrating that `execute()` + `materialize()` + adapter-compatible path conventions compose into files that bridge into the relayfile VFS, without importing from any other relayfile repo.

The implementation creates two files and modifies zero existing files. Total estimated new code: ~200 lines of test code, ~40 lines of documentation.

## Prerequisites

| Prerequisite | Status | Verification |
|-------------|--------|-------------|
| `execute()` implemented and tested | Complete | 8 passing tests |
| `materialize()` implemented and tested | Complete | 22 passing tests |
| `MaterializeRule` types defined | Complete | `PathTemplate`, `FormatFn`, conditions, conflicts all typed |
| Materialization review verdict: pass | Complete | `docs/materialization-implementation-review-verdict.md` |

## Implementation Steps

### Step 1: Create `tests/bridge.test.ts`

**File:** `tests/bridge.test.ts`

**Structure:**

```typescript
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execute } from '../src/execute.js';
import { materialize } from '../src/materialize.js';
```

**Test suite:** `describe('bridge')`

**Setup/teardown pattern:** Same as `tests/materialize.test.ts` — create a temp directory in `beforeEach`, clean up in `afterEach`. The temp directory simulates a relayfile mount root.

**Test cases (5 total):**

---

#### Test 1: `materializes CLI artifact to adapter-compatible GitHub issue path`

```typescript
it('materializes CLI artifact to adapter-compatible GitHub issue path', async () => {
  // 1. Execute: produce a JSON artifact simulating gh issue view output
  const result = await execute({
    command: 'node',
    args: ['-e', 'console.log(JSON.stringify({ number: 42, title: "Fix bug", state: "open" }))'],
  });

  // 2. Materialize: write to adapter-compatible path
  const output = await materialize({
    result,
    rule: {
      path: (r) => `github/repos/acme/api/issues/${(r.artifact as any).number}.json`,
      format: 'json',
      condition: 'on-artifact',
    },
    basePath: mountRoot,
  });

  // 3. Assert: file at adapter-compatible path with correct content
  expect(output.written).toBe(true);
  expect(output.path).toBe(join(mountRoot, 'github/repos/acme/api/issues/42.json'));

  const content = JSON.parse(await readFile(output.path!, 'utf8'));
  expect(content.number).toBe(42);
  expect(content.title).toBe('Fix bug');
  expect(content.state).toBe('open');
});
```

**What it proves:** Single CLI artifact → adapter-compatible VFS path. An agent doing `cat /relayfile/github/repos/acme/api/issues/42.json` gets valid JSON.

---

#### Test 2: `materializes list artifact to multiple adapter-compatible paths`

```typescript
it('materializes list artifact to multiple adapter-compatible paths', async () => {
  // 1. Execute: produce a JSON array
  const result = await execute({
    command: 'node',
    args: ['-e', 'console.log(JSON.stringify([{ number: 1, title: "A" }, { number: 2, title: "B" }]))'],
  });

  // 2. Caller decomposes the array and materializes each item
  const items = result.artifact as Array<{ number: number; title: string }>;
  for (const item of items) {
    await materialize({
      result: { ...result, artifact: item },
      rule: {
        path: (r) => `github/repos/acme/api/issues/${(r.artifact as any).number}.json`,
        format: 'json',
        condition: 'on-artifact',
      },
      basePath: mountRoot,
    });
  }

  // 3. Assert: both files exist with correct content
  const file1 = JSON.parse(await readFile(join(mountRoot, 'github/repos/acme/api/issues/1.json'), 'utf8'));
  const file2 = JSON.parse(await readFile(join(mountRoot, 'github/repos/acme/api/issues/2.json'), 'utf8'));
  expect(file1.title).toBe('A');
  expect(file2.title).toBe('B');
});
```

**What it proves:** Caller-driven list decomposition → multiple adapter-compatible paths. `materialize()` does not need batch support; the caller loops.

---

#### Test 3: `dry-run resolves adapter-compatible path without writing`

```typescript
it('dry-run resolves adapter-compatible path without writing', async () => {
  const result = await execute({
    command: 'node',
    args: ['-e', 'console.log(JSON.stringify({ number: 99, title: "Dry" }))'],
  });

  const output = await materialize({
    result,
    rule: {
      path: (r) => `github/repos/acme/api/issues/${(r.artifact as any).number}.json`,
      format: 'json',
      condition: 'on-artifact',
    },
    basePath: '/hypothetical/mount',
    dryRun: true,
  });

  expect(output.written).toBe(false);
  expect(output.path).toBe('/hypothetical/mount/github/repos/acme/api/issues/99.json');
  expect(output.content).toBeTruthy();
});
```

**What it proves:** Path resolution logic is correct without filesystem side effects. A caller can preview the bridge mapping before committing.

---

#### Test 4: `reshapes CLI output to canonical schema via custom format function`

```typescript
it('reshapes CLI output to canonical schema via custom format function', async () => {
  // 1. Execute: produce output in CLI-vendor shape (camelCase, nested objects)
  const result = await execute({
    command: 'node',
    args: ['-e', `console.log(JSON.stringify({
      number: 42,
      title: "Fix bug",
      state: "OPEN",
      body: "Details here",
      labels: [{ name: "bug" }, { name: "priority" }],
      assignees: [{ login: "alice" }],
      createdAt: "2026-01-15T10:00:00Z",
      updatedAt: "2026-01-16T12:00:00Z"
    }))`],
  });

  // 2. Materialize with FormatFn that maps vendor shape → canonical shape
  const output = await materialize({
    result,
    rule: {
      path: (r) => `github/repos/acme/api/issues/${(r.artifact as any).number}.json`,
      format: (r) => {
        const raw = r.artifact as any;
        return JSON.stringify({
          number: raw.number,
          title: raw.title,
          state: raw.state.toLowerCase(),
          body: raw.body || null,
          labels: raw.labels.map((l: any) => l.name),
          assignees: raw.assignees.map((a: any) => a.login),
          created_at: raw.createdAt,
          updated_at: raw.updatedAt,
        }, null, 2);
      },
      condition: 'on-artifact',
    },
    basePath: mountRoot,
  });

  // 3. Assert: file contains canonical-shaped content
  const content = JSON.parse(await readFile(output.path!, 'utf8'));
  expect(content.state).toBe('open');           // lowercased
  expect(content.labels).toEqual(['bug', 'priority']);  // flattened
  expect(content.assignees).toEqual(['alice']);          // flattened
  expect(content.created_at).toBe('2026-01-15T10:00:00Z');  // snake_case
  expect(content.updated_at).toBe('2026-01-16T12:00:00Z');  // snake_case
});
```

**What it proves:** Caller-driven schema conformance. The `FormatFn` maps vendor-specific CLI output (Layer 1) to canonical file schema shape (Layer 2) without relayfile-cli importing or knowing about any schema. This is the key pattern that keeps relayfile-cli schema-unaware while enabling schema-conformant output.

---

#### Test 5: `creates nested directory tree for adapter-compatible paths`

```typescript
it('creates nested directory tree for adapter-compatible paths', async () => {
  const result = await execute({
    command: 'node',
    args: ['-e', 'console.log(JSON.stringify({ number: 7, title: "Nested" }))'],
  });

  const output = await materialize({
    result,
    rule: {
      path: (r) => `github/repos/acme/api/issues/${(r.artifact as any).number}.json`,
      format: 'json',
      condition: 'on-artifact',
    },
    basePath: mountRoot,
  });

  // The path github/repos/acme/api/issues/ has 5 nested levels
  // materialize() must create all of them
  expect(output.written).toBe(true);
  expect(output.path).toBe(join(mountRoot, 'github/repos/acme/api/issues/7.json'));

  const content = JSON.parse(await readFile(output.path!, 'utf8'));
  expect(content.number).toBe(7);
});
```

**What it proves:** The existing `mkdir(dirname, { recursive: true })` in `materialize()` correctly handles deep adapter-compatible path hierarchies. No code changes needed.

---

### Step 2: Create `docs/adapter-path-conventions.md`

**File:** `docs/adapter-path-conventions.md`

A short reference document. Not code, not enforced, not a type definition. Its purpose is to help callers write `MaterializeRule.path` functions that produce adapter-compatible paths.

**Content:**

- Preamble explaining that these are naming conventions, not code dependencies
- Table mapping GitHub CLI commands to adapter path patterns
- Note that path conventions are derived from core relayfile VFS structure
- Note that relayfile-cli does not enforce or validate these conventions

**Scope:** GitHub only. Slack, Linear, AWS, and other providers are deferred to future proofs.

---

### Step 3: Validate

Run all three validation gates sequentially:

```bash
npm run build        # TypeScript compilation
npm run typecheck    # Type checking (redundant but explicit)
npm test             # Full test suite: existing 30 + new bridge tests
```

All must exit 0 with zero failures.

### Step 4: Verify Import Boundary

Manual inspection of `tests/bridge.test.ts` import block. The file must import only from:
- `vitest`
- `../src/execute.js`
- `../src/materialize.js`
- `../src/types.js` (if type imports needed)
- `node:fs/promises`, `node:path`, `node:os`

Zero imports from any other package or repository.

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| `node -e` behaves differently across platforms | Low | Node.js `console.log` + `JSON.stringify` is deterministic |
| Temp directory cleanup fails | Low | `afterEach` uses `rm({ force: true })`; matches existing pattern |
| Path separators differ on Windows | Low | Tests use `join()` for assertions; `resolve()` handles platform differences |
| Existing tests regress | Very low | No source files are modified |

## Success State

After implementation:

1. `tests/bridge.test.ts` exists with 5 test cases
2. `docs/adapter-path-conventions.md` exists with GitHub path convention table
3. `npm run build` passes
4. `npm run typecheck` passes
5. `npm test` passes with all tests (30 existing + 5 new = 35 total)
6. Zero imports from core relayfile, adapters, or providers anywhere in the codebase
7. Zero modifications to existing source files
