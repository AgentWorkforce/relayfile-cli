# Materialization Implementation Plan

## Overview

Build `materialize()` — the second primitive in relayfile-cli. Four files change. Zero new dependencies. The implementation is a single-session task.

## Step-by-Step Implementation

### Step 1: Extend `src/types.ts`

Add all new types after the existing `ExecuteResult` interface. Do not modify existing types.

```typescript
// --- Materialization types ---

export type PathTemplate =
  | string
  | ((result: ExecuteResult, context?: Record<string, unknown>) => string);

export type FormatFn = (result: ExecuteResult) => string | Buffer;

export type Format = 'json' | 'json-compact' | 'raw' | 'envelope' | FormatFn;

export type ConditionFn = (result: ExecuteResult) => boolean;

export type MaterializeCondition =
  | 'always'
  | 'on-success'
  | 'on-artifact'
  | ConditionFn;

export type ConflictStrategy = 'overwrite' | 'skip' | 'append' | 'timestamp';

export interface MaterializeRule {
  path: PathTemplate;
  format: Format;
  condition?: MaterializeCondition;
  conflict?: ConflictStrategy;
}

export interface MaterializeOptions {
  result: ExecuteResult;
  rule: MaterializeRule;
  basePath?: string;
  context?: Record<string, unknown>;
  dryRun?: boolean;
}

export interface MaterializeOutput {
  written: boolean;
  path: string | null;
  content: string | Buffer | null;
  skippedReason?: string;
}
```

**Verify:** `npm run typecheck` passes.

### Step 2: Create `src/materialize.ts`

Create the file with five functions: four internal helpers and one exported `materialize()`.

#### 2a: `resolvePath`

```typescript
import { resolve, dirname, extname, basename, join } from 'node:path';

function resolvePath(
  rule: MaterializeRule,
  result: ExecuteResult,
  basePath: string,
  context?: Record<string, unknown>,
): string {
  const raw = typeof rule.path === 'function'
    ? rule.path(result, context)
    : rule.path;

  return resolve(basePath, raw);
}
```

Key behavior: `path.resolve(basePath, raw)` — if `raw` is absolute, `basePath` is ignored (Node.js `path.resolve` semantics).

#### 2b: `formatContent`

```typescript
function formatContent(format: Format, result: ExecuteResult): string | Buffer {
  if (typeof format === 'function') {
    return format(result);
  }

  switch (format) {
    case 'json':
      return JSON.stringify(result.artifact, null, 2);
    case 'json-compact':
      return JSON.stringify(result.artifact);
    case 'raw':
      return result.stdout;
    case 'envelope':
      return JSON.stringify(result, null, 2);
  }
}
```

#### 2c: `evaluateCondition`

```typescript
function evaluateCondition(
  condition: MaterializeCondition | undefined,
  result: ExecuteResult,
): { pass: boolean; reason?: string } {
  const resolved = condition ?? 'on-success';

  if (typeof resolved === 'function') {
    const pass = resolved(result);
    return pass ? { pass: true } : { pass: false, reason: 'Custom condition returned false' };
  }

  switch (resolved) {
    case 'always':
      return { pass: true };
    case 'on-success':
      return result.ok
        ? { pass: true }
        : { pass: false, reason: 'Condition on-success failed: result.ok is false' };
    case 'on-artifact':
      return result.artifact !== null
        ? { pass: true }
        : { pass: false, reason: 'Condition on-artifact failed: artifact is null' };
  }
}
```

#### 2d: `handleConflict`

```typescript
import { access, writeFile, appendFile, mkdir } from 'node:fs/promises';

async function handleConflict(
  strategy: ConflictStrategy,
  filePath: string,
): Promise<{ path: string; skip: boolean; append: boolean }> {
  const exists = await access(filePath).then(() => true, () => false);

  if (!exists) {
    return { path: filePath, skip: false, append: false };
  }

  switch (strategy) {
    case 'overwrite':
      return { path: filePath, skip: false, append: false };
    case 'skip':
      return { path: filePath, skip: true, append: false };
    case 'append':
      return { path: filePath, skip: false, append: true };
    case 'timestamp': {
      const ext = extname(filePath);
      const base = basename(filePath, ext);
      const dir = dirname(filePath);
      const ts = Date.now();
      const newPath = join(dir, ext ? `${base}.${ts}${ext}` : `${base}.${ts}`);
      return { path: newPath, skip: false, append: false };
    }
  }
}
```

#### 2e: `materialize` (exported)

```typescript
export async function materialize(options: MaterializeOptions): Promise<MaterializeOutput> {
  const { result, rule, basePath = process.cwd(), context, dryRun = false } = options;

  // 1. Evaluate condition
  const conditionResult = evaluateCondition(rule.condition, result);
  if (!conditionResult.pass) {
    return {
      written: false,
      path: null,
      content: null,
      skippedReason: conditionResult.reason,
    };
  }

  // 2. Resolve path
  const resolvedPath = resolvePath(rule, result, basePath, context);

  // 3. Format content
  const content = formatContent(rule.format, result);

  // 4. Dry run — return without touching filesystem
  if (dryRun) {
    return { written: false, path: resolvedPath, content };
  }

  // 5. Handle conflict
  const conflict = await handleConflict(rule.conflict ?? 'overwrite', resolvedPath);
  if (conflict.skip) {
    return {
      written: false,
      path: conflict.path,
      content: null,
      skippedReason: 'File exists and conflict strategy is skip',
    };
  }

  // 6. Create parent directories
  await mkdir(dirname(conflict.path), { recursive: true });

  // 7. Write file
  if (conflict.append) {
    await appendFile(conflict.path, content);
  } else {
    await writeFile(conflict.path, content);
  }

  return { written: true, path: conflict.path, content };
}
```

**Verify:** `npm run typecheck` passes.

### Step 3: Update `src/index.ts`

```typescript
export { execute } from './execute.js';
export { materialize } from './materialize.js';
export type {
  ExecuteOptions,
  ExecuteResult,
  PathTemplate,
  FormatFn,
  Format,
  ConditionFn,
  MaterializeCondition,
  ConflictStrategy,
  MaterializeRule,
  MaterializeOptions,
  MaterializeOutput,
} from './types.js';
```

**Verify:** `npm run build` passes. `dist/` contains `materialize.js` and `materialize.d.ts`.

### Step 4: Create `tests/materialize.test.ts`

Test structure using vitest. All tests use real filesystem operations in temp directories.

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { materialize } from '../src/materialize.js';
import { execute } from '../src/execute.js';
import type { ExecuteResult } from '../src/types.js';

// Helper: create a mock ExecuteResult
function mockResult(overrides?: Partial<ExecuteResult>): ExecuteResult {
  return {
    ok: true,
    exitCode: 0,
    stdout: '{"name":"test","value":42}',
    stderr: '',
    durationMs: 10,
    artifact: { name: 'test', value: 42 },
    capturedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}
```

Test groups:

1. **Format tests** (5 tests) — one per format variant
2. **Condition tests** (6 tests) — on-success pass/fail, on-artifact pass/fail, always, custom
3. **Conflict tests** (4 tests) — overwrite, skip, append, timestamp
4. **Path tests** (4 tests) — static string, function, nested, absolute
5. **Dry-run tests** (4 tests) — path resolved, content returned, no file, written is false
6. **Default behavior tests** (3 tests) — default condition, default conflict, default basePath
7. **Integration test** (1 test) — execute + materialize end-to-end

Total: **27 test cases**.

**Verify:** `npm test` passes. All 27 tests green.

### Step 5: Final Verification

Run all validation gates from the checklist:

```bash
npm run typecheck    # Gate 1: type-checks clean
npm run build        # Gate 1: builds clean
npm test             # Gate 2: all tests pass
```

Verify no external imports:
```bash
grep -c "from '@relayfile" src/materialize.ts   # must be 0
grep -c "from 'relayfile" src/materialize.ts     # must be 0
```

Verify no regression:
```bash
git diff src/execute.ts          # must be empty
git diff tests/execute.test.ts   # must be empty
```

## File Summary

| File | Action | Lines (approx) |
|------|--------|----------------|
| `src/types.ts` | Modify (additive) | +40 lines |
| `src/materialize.ts` | Create | ~100 lines |
| `src/index.ts` | Modify (additive) | +12 lines |
| `tests/materialize.test.ts` | Create | ~300 lines |

Total new code: ~140 lines of implementation, ~300 lines of tests.

## Risk Inventory

| Risk | Mitigation |
|------|-----------|
| Timestamp suffix format collision | Millisecond precision is sufficient; tests mock `Date.now` if needed for assertion stability |
| `JSON.stringify(null)` for json format when artifact is null | This is valid JS — produces the string `"null"`. Condition `on-artifact` guards against this in typical usage. No special handling needed. |
| Path traversal via malicious PathTemplate | Out of scope — `materialize()` trusts its caller. The caller constructs the rule. |
| Large file content from `formatContent` | Out of scope — streaming is deferred. `writeFile` handles reasonable sizes. |
| `FormatFn` throws | Let it propagate. The caller provided the function; the caller handles the error. No try-catch wrapper. |

## What Ships

After this implementation:

1. `relayfile-cli` exports two composable primitives: `execute()` and `materialize()`.
2. Any caller can run a CLI command and write the result to a file in two function calls.
3. The materialization is generic — same function works for any CLI tool, any format, any path convention.
4. Zero coupling to core relayfile, adapters, or providers.
5. The pipeline `execute() -> materialize() -> local file` is proven end-to-end with tests.
