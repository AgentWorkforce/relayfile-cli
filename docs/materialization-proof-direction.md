# Materialization Proof Direction

## The Target

Build the smallest working unit that proves relayfile-cli can generically materialize CLI artifacts into files:

**A `materialize()` function that takes an `ExecuteResult` and a `MaterializeRule`, resolves a file path, formats the content, evaluates conditions, handles conflicts, and writes (or dry-runs) the output.**

This is the second foundational primitive after `execute()`. Together, they complete the core value proposition: run a CLI command, capture its output, write it to a file.

## Why This Target

1. **Completes the pipeline.** `execute()` without materialization is a library that captures output and throws it away. Materialization is where captured artifacts become durable state.

2. **Proves the generic abstraction.** The boundary document defines `MaterializeRule` as provider-agnostic. This proof must demonstrate that the same function handles GitHub CLI output, arbitrary JSON, raw text, and custom formats — without any provider-specific code in `materialize()` itself.

3. **Stays in the boundary.** Materialization writes to local files using `node:fs`. It does not import from core relayfile, adapters, or providers. If the proof needs any of those imports, the boundary is wrong.

## Scope

### In Scope

**Types:**

- `MaterializeRule` — path + format + condition + conflict strategy
- `MaterializeOptions` — result + rule + basePath + context + dryRun
- `MaterializeOutput` — written + path + content + skippedReason
- `PathTemplate` — string literal or function
- `Format` — `'json'` | `'json-compact'` | `'raw'` | `'envelope'` | custom function
- `MaterializeCondition` — `'always'` | `'on-success'` | `'on-artifact'` | custom function
- `ConflictStrategy` — `'overwrite'` | `'skip'` | `'append'` | `'timestamp'`

**Core function:**

- `materialize(options: MaterializeOptions): Promise<MaterializeOutput>`
- Path resolution: static strings and function-based paths
- Format serialization: all five format variants
- Condition evaluation: all four condition variants
- Conflict handling: all four strategies
- Dry-run mode: resolve + format without writing
- Directory creation: `mkdir -p` for nested output paths

**Tests:**

- JSON format: artifact serialized with pretty-print
- JSON-compact format: artifact serialized without whitespace
- Raw format: stdout written as-is
- Envelope format: full `ExecuteResult` serialized
- Custom format function: caller-provided serializer
- Condition `on-success`: skipped when `ok === false`
- Condition `on-artifact`: skipped when `artifact === null`
- Condition `always`: written regardless of `ok` or artifact
- Custom condition function: caller-provided predicate
- Conflict `overwrite`: replaces existing file
- Conflict `skip`: leaves existing file untouched
- Conflict `append`: appends to existing file
- Conflict `timestamp`: creates new file with timestamp suffix
- Dry-run mode: returns resolved path and content without writing
- Nested path creation: intermediate directories created automatically
- Integration: `execute()` result piped into `materialize()`

### Out of Scope (Explicitly Deferred)

- Template-string interpolation (`{{command}}`, `{{capturedAt | date:...}}`) — function paths cover this for now
- Provider-specific rule presets (e.g., a "github" rule factory) — that is a third proof
- Remote/cloud storage writes (S3, GCS) — local disk only
- Batch materialization (multiple rules applied to one result) — caller can loop
- File watching or incremental updates — one-shot write only
- Streaming materialization — complete artifact only
- Schema validation of artifacts before writing
- Symlink or hardlink support

## Concrete Deliverable

### New types (added to `src/types.ts`)

```typescript
type PathTemplate =
  | string
  | ((result: ExecuteResult, context?: Record<string, unknown>) => string);

type FormatFn = (result: ExecuteResult) => string | Buffer;

type Format = 'json' | 'json-compact' | 'raw' | 'envelope' | FormatFn;

type ConditionFn = (result: ExecuteResult) => boolean;

type MaterializeCondition = 'always' | 'on-success' | 'on-artifact' | ConditionFn;

type ConflictStrategy = 'overwrite' | 'skip' | 'append' | 'timestamp';

interface MaterializeRule {
  path: PathTemplate;
  format: Format;
  condition?: MaterializeCondition;
  conflict?: ConflictStrategy;
}

interface MaterializeOptions {
  result: ExecuteResult;
  rule: MaterializeRule;
  basePath?: string;
  context?: Record<string, unknown>;
  dryRun?: boolean;
}

interface MaterializeOutput {
  written: boolean;
  path: string | null;
  content: string | Buffer | null;
  skippedReason?: string;
}
```

### New function (`src/materialize.ts`)

```typescript
import { materialize } from '@relayfile/cli';

// Run a CLI command
const result = await execute({
  command: 'gh',
  args: ['repo', 'view', '--json', 'name,description'],
});

// Materialize the artifact to a file
const output = await materialize({
  result,
  rule: {
    path: (r) => `repos/${r.artifact.name}.json`,
    format: 'json',
    condition: 'on-artifact',
    conflict: 'overwrite',
  },
  basePath: './output',
});

// output.written === true
// output.path === '/abs/path/to/output/repos/relayfile-cli.json'
// output.content === '{\n  "name": "relayfile-cli",\n  ...\n}'
```

### Updated file layout

```
src/
  execute.ts          — existing, unchanged
  materialize.ts      — new: materialize() function
  types.ts            — extended: MaterializeRule, MaterializeOutput, etc.
  index.ts            — extended: re-export materialize + new types
tests/
  execute.test.ts     — existing, unchanged
  materialize.test.ts — new: materialization tests
```

## Implementation Path

1. Extend `src/types.ts` with all new types (`MaterializeRule`, `MaterializeOptions`, `MaterializeOutput`, format/condition/conflict types)
2. Create `src/materialize.ts`:
   - `resolvePath()` — evaluate `PathTemplate` to a concrete path, resolve against `basePath`
   - `formatContent()` — apply `Format` to produce file content
   - `evaluateCondition()` — check `MaterializeCondition` against `ExecuteResult`
   - `handleConflict()` — resolve `ConflictStrategy` (check file existence, modify path for timestamp)
   - `materialize()` — orchestrate the above, create directories, write file or return dry-run result
3. Update `src/index.ts` to re-export `materialize` and new types
4. Create `tests/materialize.test.ts` with all test cases listed in scope
5. Verify: `npm run build && npm test` passes. No imports from any other relayfile repo.

## Success Criteria

All must pass for the proof to be complete:

1. **It writes.** A successful `execute()` result with a JSON artifact, passed through `materialize()` with format `'json'`, produces a correctly formatted JSON file at the resolved path.
2. **It formats.** All five format variants (`json`, `json-compact`, `raw`, `envelope`, custom function) produce correct output.
3. **It conditions.** `on-success` skips when `ok === false`. `on-artifact` skips when `artifact === null`. `always` writes regardless. Custom functions are called.
4. **It handles conflicts.** `overwrite` replaces. `skip` preserves. `append` concatenates. `timestamp` creates a new file.
5. **It dry-runs.** With `dryRun: true`, the function returns resolved path and content without touching the filesystem.
6. **It composes.** An end-to-end test runs `execute()`, passes the result to `materialize()`, and verifies the file on disk.
7. **It stays in its lane.** Zero imports from core relayfile, adapters, or providers. Uses `node:fs`, `node:path`, and local types only.

## What This Proves

If the proof ships:

- **The materialization abstraction is real.** A single generic function handles arbitrary CLI outputs without provider-specific code.
- **The pipeline is complete.** `execute()` + `materialize()` is a usable end-to-end workflow: run CLI, write file.
- **The boundary holds.** Materialization uses `node:fs` for file writes, not core relayfile VFS. Integration with core relayfile happens at the filesystem layer, not the import layer.
- **Provider examples are callers, not architecture.** GitHub, PostHog, kubectl all use the same function with different rules. The abstraction does not leak provider details.
- **The repo has a clear second primitive.** After this proof, relayfile-cli owns two composable functions (`execute`, `materialize`) that together justify its existence as a standalone package.
