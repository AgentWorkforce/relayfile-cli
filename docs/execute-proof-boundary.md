# Execute Proof Boundary

## Scope Definition

This document defines the exact bounded implementation slice for the relayfile-cli execute + artifact capture proof. Everything listed here is in scope. Everything not listed is explicitly out of scope.

## Files to Create

| File | Purpose | Lines (est.) |
|------|---------|-------------|
| `src/types.ts` | `ExecuteOptions` and `ExecuteResult` interfaces | 25–35 |
| `src/execute.ts` | Core `execute()` function — spawns child process, captures streams, measures timing, attempts JSON parse | 80–120 |
| `src/index.ts` | Public API re-exports: `{ execute, ExecuteOptions, ExecuteResult }` | 5–10 |
| `tests/execute.test.ts` | Test suite covering all five success criteria | 80–120 |
| `tsconfig.json` | TypeScript compiler configuration | 15–20 |

## Files to Modify

| File | Change | Reason |
|------|--------|--------|
| `package.json` | Add `typescript`, `vitest`, `@types/node` as devDependencies. Add `build`, `test`, `typecheck` scripts. Add `main`, `types`, `files` fields. | Build and test infrastructure. |

## Type Contracts

### `ExecuteOptions`

```typescript
interface ExecuteOptions {
  command: string;           // CLI binary name or path (e.g., 'gh', 'echo', '/usr/bin/env')
  args?: string[];           // Arguments array (default: [])
  cwd?: string;              // Working directory (default: process.cwd())
  timeout?: number;          // Kill timeout in ms (default: 30_000)
  env?: Record<string, string>; // Additional env vars merged with process.env
}
```

### `ExecuteResult`

```typescript
interface ExecuteResult {
  ok: boolean;               // true iff exitCode === 0
  exitCode: number | null;   // null if process was killed (timeout, signal)
  stdout: string;            // Raw stdout capture
  stderr: string;            // Raw stderr capture
  durationMs: number;        // Wall-clock execution time
  artifact: unknown | null;  // Parsed JSON from stdout, or null if not valid JSON
  capturedAt: string;        // ISO 8601 timestamp of capture completion
}
```

## Function Contract

```typescript
export async function execute(options: ExecuteOptions): Promise<ExecuteResult>
```

Behavioral guarantees:

1. **Never throws.** All failures (command not found, non-zero exit, timeout, signal) are represented in the returned `ExecuteResult` with `ok: false`.
2. **Timeout kills the process tree.** When the timeout fires, the spawned process is killed and `exitCode` is set to `null`.
3. **JSON parsing is best-effort.** If `stdout` is valid JSON, `artifact` contains the parsed value. If not, `artifact` is `null`. Parsing failure is silent — it is not an error.
4. **Environment is additive.** `options.env` is merged on top of `process.env`, not a replacement.
5. **Streams are fully buffered.** stdout and stderr are collected into strings. No streaming API.

## Hard Boundaries

These constraints are non-negotiable for this proof:

1. **Zero imports from other relayfile repos.** No `@relayfile/core`, no `@relayfile/adapters`, no `@relayfile/providers`. The dependency graph is: `node:child_process` + `node:util` + devDependencies only.
2. **Zero server code.** No HTTP listener, no WebSocket, no long-running process.
3. **Zero filesystem abstraction.** No VFS, no mount, no sync. The only filesystem interaction is `cwd` for the spawned process.
4. **Zero auth/credential management.** The execute function runs whatever CLI is available in the PATH. Auth is the caller's responsibility.
5. **Zero retry/backoff logic.** One execution, one result. Retry is a future concern.
6. **Zero streaming.** Full buffering only. Streaming capture is explicitly deferred.

## Out of Scope (Explicitly Deferred)

- Provider-specific CLI wrapper functions (e.g., `ghRepoView()`)
- CLI dependency detection or auto-installation
- Retry, backoff, or circuit-breaker patterns
- Streaming stdout/stderr capture
- Integration with core relayfile VFS or APIs
- Artifact persistence (write to disk, database, etc.)
- Multi-step execution chains or pipelines
- Any form of authentication or credential management

## Deterministic Validation Gates

The implementation must pass these gates before acceptance:

### Gate 1: TypeScript Compiles

```bash
npx tsc --noEmit
# Exit code must be 0
```

### Gate 2: All Tests Pass

```bash
npx vitest run
# Exit code must be 0
# All test cases green
```

### Gate 3: No Cross-Repo Imports

```bash
grep -r "from.*@relayfile" src/ tests/ && exit 1 || echo "PASS: no cross-repo imports"
grep -r "require.*relayfile" src/ tests/ && exit 1 || echo "PASS: no cross-repo requires"
```

### Gate 4: Build Succeeds

```bash
npm run build
# Exit code must be 0
# dist/ directory contains compiled JS
```

### Gate 5: File Layout Matches Spec

```bash
test -f src/types.ts && \
test -f src/execute.ts && \
test -f src/index.ts && \
test -f tests/execute.test.ts && \
test -f tsconfig.json && \
echo "PASS: file layout correct"
```

## Success Criteria (all five required)

1. **It runs.** `execute({ command: 'echo', args: ['hello'] })` returns `{ ok: true, stdout: 'hello\n' }`.
2. **It captures.** stdout, stderr, exitCode, and durationMs are all present and correct for success and failure.
3. **It fails cleanly.** A missing command returns `{ ok: false, exitCode: null }` — no uncaught exception.
4. **It parses when possible.** `echo '{"a":1}'` produces `artifact: { a: 1 }`. `echo 'hello'` produces `artifact: null`.
5. **It stays in its lane.** Zero imports from any other relayfile repo. Zero VFS. Zero server. Zero OAuth.

RELAYFILE_CLI_EXECUTE_PROOF_BOUNDARY_DEFINED
