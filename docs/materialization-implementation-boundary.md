# Materialization Implementation Boundary

## Scope Definition

This document defines the exact bounded 80-to-100 implementation slice for relayfile-cli's `materialize()` function. It specifies what is built, what is not, what each file contains, and where every boundary lies.

## What Is Being Built

A single exported function, `materialize()`, that takes an `ExecuteResult` (already produced by `execute()`) and a `MaterializeRule` (declarative description of how to write a file), and writes the result to the local filesystem.

This is the second primitive in relayfile-cli. After this proof, the repo owns two composable functions:
- `execute()` — run a CLI command, capture structured output
- `materialize()` — write captured output to a file

## Exact File Changes

### Modified: `src/types.ts`

Add the following types after the existing `ExecuteResult` interface:

| Type | Kind | Purpose |
|------|------|---------|
| `PathTemplate` | type alias | `string \| ((result: ExecuteResult, context?: Record<string, unknown>) => string)` |
| `FormatFn` | type alias | `(result: ExecuteResult) => string \| Buffer` |
| `Format` | type alias | `'json' \| 'json-compact' \| 'raw' \| 'envelope' \| FormatFn` |
| `ConditionFn` | type alias | `(result: ExecuteResult) => boolean` |
| `MaterializeCondition` | type alias | `'always' \| 'on-success' \| 'on-artifact' \| ConditionFn` |
| `ConflictStrategy` | type alias | `'overwrite' \| 'skip' \| 'append' \| 'timestamp'` |
| `MaterializeRule` | interface | `{ path, format, condition?, conflict? }` |
| `MaterializeOptions` | interface | `{ result, rule, basePath?, context?, dryRun? }` |
| `MaterializeOutput` | interface | `{ written, path, content, skippedReason? }` |

No existing types are modified. New types are additive only.

### New: `src/materialize.ts`

Imports: `node:fs/promises`, `node:path`, and local `./types.js`. No other imports.

Contains:

| Function | Visibility | Purpose |
|----------|-----------|---------|
| `resolvePath(rule, result, basePath?, context?)` | internal | Evaluates `PathTemplate` to an absolute path |
| `formatContent(rule, result)` | internal | Applies `Format` to produce `string \| Buffer` |
| `evaluateCondition(rule, result)` | internal | Returns `{ pass: boolean, reason?: string }` |
| `handleConflict(strategy, filePath)` | internal | Checks file existence, returns `{ path: string, skip: boolean }` |
| `materialize(options)` | exported | Orchestrates the above four, creates directories, writes file or returns dry-run result |

### Modified: `src/index.ts`

Add re-exports:
- `export { materialize } from './materialize.js'`
- Export all new types from `./types.js`

### New: `tests/materialize.test.ts`

Test suite covering all behaviors listed in the validation gates section below.

## Exact Type Definitions

```typescript
// Path resolution
type PathTemplate =
  | string
  | ((result: ExecuteResult, context?: Record<string, unknown>) => string);

// Format serialization
type FormatFn = (result: ExecuteResult) => string | Buffer;
type Format = 'json' | 'json-compact' | 'raw' | 'envelope' | FormatFn;

// Condition evaluation
type ConditionFn = (result: ExecuteResult) => boolean;
type MaterializeCondition = 'always' | 'on-success' | 'on-artifact' | ConditionFn;

// Conflict handling
type ConflictStrategy = 'overwrite' | 'skip' | 'append' | 'timestamp';

// Core interfaces
interface MaterializeRule {
  path: PathTemplate;
  format: Format;
  condition?: MaterializeCondition;  // default: 'on-success'
  conflict?: ConflictStrategy;       // default: 'overwrite'
}

interface MaterializeOptions {
  result: ExecuteResult;
  rule: MaterializeRule;
  basePath?: string;                  // default: process.cwd()
  context?: Record<string, unknown>;
  dryRun?: boolean;                   // default: false
}

interface MaterializeOutput {
  written: boolean;
  path: string | null;
  content: string | Buffer | null;
  skippedReason?: string;
}
```

## Internal Function Specifications

### `resolvePath(rule, result, basePath?, context?)`

1. If `rule.path` is a string, use it directly.
2. If `rule.path` is a function, call it with `(result, context)`.
3. If the resolved path is relative, resolve it against `basePath` (default: `process.cwd()`).
4. If the resolved path is already absolute, use it as-is.
5. Return the absolute path via `path.resolve()`.

### `formatContent(rule, result)`

| `rule.format` | Output |
|---------------|--------|
| `'json'` | `JSON.stringify(result.artifact, null, 2)` |
| `'json-compact'` | `JSON.stringify(result.artifact)` |
| `'raw'` | `result.stdout` |
| `'envelope'` | `JSON.stringify(result, null, 2)` |
| function | Call `rule.format(result)` and return the result |

### `evaluateCondition(rule, result)`

| `rule.condition` | Pass when | Skip reason |
|------------------|-----------|-------------|
| `'always'` (or undefined defaults to `'on-success'`) | always | never skips |
| `'on-success'` | `result.ok === true` | `'Condition on-success failed: result.ok is false'` |
| `'on-artifact'` | `result.artifact !== null` | `'Condition on-artifact failed: artifact is null'` |
| function | function returns `true` | `'Custom condition returned false'` |

Default condition when `rule.condition` is omitted: `'on-success'`.

### `handleConflict(strategy, filePath)`

1. Check if file exists at `filePath` using `fs.access`.
2. If file does not exist: return `{ path: filePath, skip: false }` regardless of strategy.
3. If file exists:

| Strategy | Behavior |
|----------|----------|
| `'overwrite'` | Return `{ path: filePath, skip: false }` — caller overwrites |
| `'skip'` | Return `{ path: filePath, skip: true }` |
| `'append'` | Return `{ path: filePath, skip: false }` — caller appends instead of writing |
| `'timestamp'` | Compute new path with timestamp suffix (e.g., `file.1713200000000.json`), return `{ path: newPath, skip: false }` |

Timestamp suffix format: insert millisecond timestamp before the file extension. Example: `output.json` becomes `output.1713200000000.json`. If no extension: append `.1713200000000`.

### `materialize(options)`

Orchestration:

1. Evaluate condition. If fail: return `{ written: false, path: null, content: null, skippedReason }`.
2. Resolve path.
3. Format content.
4. If `dryRun`: return `{ written: false, path, content, skippedReason: undefined }`.
5. Handle conflict. If skip: return `{ written: false, path, content: null, skippedReason: 'File exists and conflict strategy is skip' }`.
6. Create parent directories via `fs.mkdir(dir, { recursive: true })`.
7. Write file:
   - For `'append'` conflict strategy: use `fs.appendFile`.
   - For all others: use `fs.writeFile`.
8. Return `{ written: true, path, content }`.

## Boundary Constraints

### relayfile-cli owns

- `MaterializeRule` type definition and all sub-types
- `materialize()` function implementation
- Path resolution (string and function variants)
- Format serialization (all five variants)
- Condition evaluation (all four variants)
- Conflict handling (all four strategies)
- Local filesystem writes via `node:fs/promises`
- Dry-run mode
- Directory creation for nested paths

### relayfile-cli does NOT own or import

- Core relayfile VFS, adapters, providers, or any `@relayfile/*` package
- Canonical file schema definitions or validation
- Provider-specific path conventions (GitHub, Slack, etc.)
- Authentication or credential management
- Remote storage (S3, GCS, etc.)
- Template-string interpolation (`{{...}}` syntax)
- Streaming or file-watching
- Batch materialization (multiple rules per result)

### Dependency surface

The complete import graph of `src/materialize.ts`:
- `node:fs/promises` — `writeFile`, `appendFile`, `mkdir`, `access`
- `node:path` — `resolve`, `dirname`, `extname`, `basename`, `join`
- `./types.js` — local type imports only

Zero runtime dependencies beyond Node.js built-ins and local types.

## What This Does NOT Change

- `src/execute.ts` — untouched
- `src/types.ts` — existing `ExecuteOptions` and `ExecuteResult` interfaces unchanged
- `tests/execute.test.ts` — untouched
- `package.json` — no new dependencies
- `tsconfig.json` — no changes needed
