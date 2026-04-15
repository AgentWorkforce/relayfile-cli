# Artifact-to-File Materialization Boundary

## What This Document Defines

This is the boundary definition for relayfile-cli's **materialization layer**: the generic mechanism by which structured artifacts captured from CLI execution are mapped into files (or file-like outputs). It defines what relayfile-cli owns, what it delegates to core relayfile, and how the two connect without coupling.

## The Problem

relayfile-cli's `execute()` function produces structured artifacts. Today, these artifacts are returned to the caller and discarded. There is no standard path from "artifact captured" to "file written." Every consumer must invent its own mapping: pick a filename, choose a format, decide where to write, handle overwrites.

This is the gap between "CLI tool produces clean output" and "that output exists as a file." Closing it is the reason relayfile-cli exists as a distinct repo — it is the execution-and-materialization substrate, not just an execute-and-forget wrapper.

## Core Abstraction: MaterializeRule

A `MaterializeRule` is a declarative description of how to turn an `ExecuteResult` into a file. It is provider-agnostic. The abstraction does not know about GitHub, PostHog, AWS, or any specific CLI. It knows about artifacts, paths, and formats.

```typescript
interface MaterializeRule {
  /** How to derive the output file path from the artifact and execution context */
  path: PathTemplate;

  /** How to transform the artifact into file content */
  format: Format;

  /** When to write: always, only on success, only when artifact is non-null */
  condition?: MaterializeCondition;

  /** What to do when the target file already exists */
  conflict?: ConflictStrategy;
}
```

### PathTemplate

A path template resolves to a concrete file path using values from the `ExecuteResult` and an optional user-supplied context object.

```typescript
type PathTemplate = string | ((result: ExecuteResult, context?: Record<string, unknown>) => string);

// Static path:
//   "output/result.json"
//
// Dynamic path (template string resolved at materialization time):
//   "captures/{{command}}/{{capturedAt | date:YYYY-MM-DD}}.json"
//
// Function path (full control):
//   (result, ctx) => `repos/${ctx.org}/${result.artifact.name}.json`
```

For the first proof, only string and function variants are required. Template-string interpolation (the `{{...}}` syntax) is explicitly deferred.

### Format

Format controls how the artifact is serialized into file content.

```typescript
type Format =
  | 'json'           // JSON.stringify(artifact, null, 2)
  | 'json-compact'   // JSON.stringify(artifact)
  | 'raw'            // result.stdout as-is (no artifact parsing)
  | 'envelope'       // full ExecuteResult as JSON (metadata + artifact)
  | FormatFn;        // custom serializer

type FormatFn = (result: ExecuteResult) => string | Buffer;
```

### MaterializeCondition

```typescript
type MaterializeCondition =
  | 'always'          // write regardless of exit code or artifact
  | 'on-success'      // write only when result.ok === true
  | 'on-artifact'     // write only when result.artifact !== null
  | ConditionFn;      // custom predicate

type ConditionFn = (result: ExecuteResult) => boolean;
```

Default: `'on-success'`.

### ConflictStrategy

```typescript
type ConflictStrategy =
  | 'overwrite'       // replace existing file
  | 'skip'            // leave existing file untouched
  | 'append'          // append to existing file (useful for logs/captures)
  | 'timestamp'       // add timestamp suffix to avoid collision
```

Default: `'overwrite'`.

## The Materialization Function

```typescript
interface MaterializeOptions {
  result: ExecuteResult;
  rule: MaterializeRule;
  basePath?: string;          // root directory for relative paths
  context?: Record<string, unknown>;  // extra values for path templates
  dryRun?: boolean;           // resolve path + format without writing
}

interface MaterializeOutput {
  written: boolean;           // was a file actually written?
  path: string | null;        // resolved absolute path, or null if condition failed
  content: string | Buffer | null;  // what was (or would be) written
  skippedReason?: string;     // why the write was skipped, if applicable
}

function materialize(options: MaterializeOptions): Promise<MaterializeOutput>;
```

`materialize()` is a pure function of its inputs plus the filesystem. It does not call `execute()`. The caller is responsible for running the CLI command first, then passing the result to `materialize()`.

This separation is intentional:

- `execute()` handles process spawning, timeout, output capture.
- `materialize()` handles path resolution, formatting, file writing.
- The caller composes them. This keeps both functions testable and avoids hidden coupling.

## What relayfile-cli Owns

| Concern | Owned by relayfile-cli |
|---------|:---:|
| `MaterializeRule` type definition | Yes |
| `materialize()` function implementation | Yes |
| Path resolution from templates/functions | Yes |
| Format serialization (json, raw, envelope, custom) | Yes |
| Condition evaluation | Yes |
| Conflict handling (overwrite, skip, append, timestamp) | Yes |
| Writing to local filesystem (`fs.writeFile`) | Yes |
| Dry-run mode (resolve without writing) | Yes |

## What relayfile-cli Does NOT Own

| Concern | Owned by | Why |
|---------|----------|-----|
| VFS mount targets | core relayfile | Materialization writes to local paths. If those paths happen to be inside a relayfile mount, core relayfile handles the VFS sync. relayfile-cli does not know or care. |
| Path mapping rules per service | relayfile-adapters | Adapters define how a GitHub issue maps to `/github/issues/123.json`. relayfile-cli provides the generic mechanism; adapters provide the service-specific rules. |
| Authentication for CLI commands | relayfile-providers | If `gh` needs a token, providers handle that. Materialization does not touch auth. |
| Remote/cloud storage writes | future concern | Materialization writes to local disk. S3, GCS, or other remote targets are out of scope. |
| Streaming materialization | future concern | The first proof handles complete artifacts. Streaming (e.g., `tail -f` into a file) is deferred. |

## Boundary Between Materialization and Core relayfile

The relationship is **output-compatible, not import-dependent**.

relayfile-cli writes files to local paths. If those paths are inside a relayfile-managed directory, core relayfile's file-watching or sync mechanisms pick up the changes. relayfile-cli does not import from core relayfile to accomplish this. The integration point is the filesystem itself.

```
  execute()  ──▶  ExecuteResult  ──▶  materialize()  ──▶  local file
                                                              │
                                                              │ (if path is inside a relayfile mount)
                                                              ▼
                                                     core relayfile VFS picks
                                                     up the file via watch/sync
```

This means:

1. relayfile-cli can be used without core relayfile installed. Files are just files.
2. relayfile-cli can be used with core relayfile. Files written into mount paths are automatically synced.
3. No import coupling is required for either case.

## Provider Examples as Proof, Not Architecture

The materialization layer is generic. Provider-specific examples demonstrate that the abstraction works, but they do not define its shape.

### Example: GitHub CLI (`gh`)

```typescript
const result = await execute({
  command: 'gh',
  args: ['repo', 'view', '--json', 'name,description,url'],
});

const output = await materialize({
  result,
  rule: {
    path: (r) => `github/repos/${r.artifact.name}.json`,
    format: 'json',
    condition: 'on-artifact',
    conflict: 'overwrite',
  },
});
// writes to: github/repos/relayfile-cli.json
```

### Example: PostHog CLI (hypothetical)

```typescript
const result = await execute({
  command: 'posthog',
  args: ['events', 'list', '--format', 'json'],
});

const output = await materialize({
  result,
  rule: {
    path: `posthog/events/latest.json`,
    format: 'json',
    condition: 'on-artifact',
    conflict: 'overwrite',
  },
});
// writes to: posthog/events/latest.json
```

### Example: Raw stdout capture (any CLI)

```typescript
const result = await execute({
  command: 'kubectl',
  args: ['get', 'pods', '-o', 'json'],
});

const output = await materialize({
  result,
  rule: {
    path: `k8s/pods.json`,
    format: 'raw',
    condition: 'on-success',
  },
});
// writes to: k8s/pods.json (raw stdout, no artifact parsing)
```

The same `materialize()` function handles all three. The abstraction is the function + rule; the providers are just callers.

## File Layout (After Materialization Proof)

```
src/
  execute.ts         — existing: CLI execution
  materialize.ts     — new: artifact-to-file materialization
  types.ts           — extended: MaterializeRule, MaterializeOutput, etc.
  index.ts           — extended: re-export materialize + new types
tests/
  execute.test.ts    — existing: execution tests
  materialize.test.ts — new: materialization tests
```

## Boundary Rules

1. **`materialize()` never calls `execute()`.** They are composed by the caller, not coupled internally.
2. **`materialize()` never imports from core relayfile, adapters, or providers.** It uses `node:fs` and `node:path`. That is the full dependency surface.
3. **`materialize()` is deterministic given its inputs.** The same `ExecuteResult` + `MaterializeRule` produces the same output (modulo filesystem state for conflict resolution).
4. **Provider-specific path conventions are the caller's responsibility.** `materialize()` does not encode knowledge about GitHub's URL structure, PostHog's event schema, or any other service.
5. **Dry-run mode must work without filesystem access.** Path resolution and formatting are pure; only the write step touches disk.
6. **No streaming, no watchers, no long-running processes.** Materialization is a one-shot operation: resolve, format, write, return.
