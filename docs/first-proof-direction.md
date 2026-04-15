# First Proof Direction: CLI Execute + Artifact Capture

## The 80-to-100 Target

Build the smallest working unit that proves relayfile-cli has a reason to exist as a standalone repo:

**An `execute` function that runs an external CLI command, captures its output as a structured artifact with metadata, and handles failures without throwing.**

This is the execute-and-capture primitive. Every future capability — provider CLI wrappers, dependency verification, multi-step proof chains — depends on this working correctly.

## Why This Target

Three reasons this is the right first proof:

1. **Foundation dependency.** Nothing else in the roadmap works without a reliable execute-and-capture primitive. Building provider adapters or proof workflows first would require inventing this inline.

2. **Boundary litmus test.** This code has zero reason to exist in core relayfile, relayfile-adapters, or relayfile-providers. Core relayfile is a VFS server. Adapters normalize webhooks. Providers manage OAuth. None of them shell out to `gh` and parse stdout. If the first proof touches VFS mount logic or OAuth tokens, the boundary is wrong.

3. **Ecosystem complement, not overlap.** relayfile-providers handle GitHub auth via OAuth + API proxy. relayfile-cli's first proof runs `gh repo view --json` — same data source, orthogonal execution path. This demonstrates the complementary relationship without duplicating provider or adapter logic.

## Scope

### In Scope

- A `run`/`execute` function that spawns a child process for a given command + args
- Capture of: stdout, stderr, exit code, wall-clock duration (ms)
- Structured output envelope (JSON) with metadata: `ok`, `exitCode`, `stdout`, `stderr`, `durationMs`, `capturedAt`
- Automatic JSON parsing: if stdout is valid JSON, parse it into an `artifact` field; otherwise leave stdout as a string
- Error handling without throwing: command-not-found, non-zero exit, timeout all return structured results with `ok: false`
- Configurable timeout (default 30s)
- One real provider example: `gh` (GitHub CLI) — `gh repo view --json name,description`
- Tests against: `echo` (always available), `gh` (real provider), deliberately-failing command

### Out of Scope (explicitly deferred)

- Multiple provider CLI wrappers (second proof)
- CLI dependency auto-installation or version management
- Retry/backoff logic
- Streaming output capture
- Integration with core relayfile APIs or VFS
- Authentication or credential management (providers handle this)
- Webhook normalization (adapters handle this)
- Any server or long-running process

## Concrete Deliverable

### Types (`src/types.ts`)

```typescript
interface ExecuteOptions {
  command: string;
  args?: string[];
  cwd?: string;
  timeout?: number; // ms, default 30_000
  env?: Record<string, string>;
}

interface ExecuteResult {
  ok: boolean;
  exitCode: number | null; // null if process was killed (timeout, signal)
  stdout: string;
  stderr: string;
  durationMs: number;
  artifact: unknown | null; // parsed JSON from stdout, or null
  capturedAt: string; // ISO 8601
}
```

### Core function (`src/execute.ts`)

```typescript
import { execute } from '@relayfile/cli';

const result = await execute({
  command: 'gh',
  args: ['repo', 'view', '--json', 'name,description'],
  timeout: 30_000,
});

// Happy path:
// {
//   ok: true,
//   exitCode: 0,
//   stdout: '{"name":"relayfile-cli","description":"..."}',
//   stderr: '',
//   durationMs: 342,
//   artifact: { name: "relayfile-cli", description: "..." },
//   capturedAt: "2026-04-15T12:00:00.000Z",
// }

// Failure path (command not found):
// {
//   ok: false,
//   exitCode: null,
//   stdout: '',
//   stderr: 'command not found: nonexistent',
//   durationMs: 12,
//   artifact: null,
//   capturedAt: "2026-04-15T12:00:00.000Z",
// }
```

### File layout

```
src/
  execute.ts       — core execute function (child_process.spawn wrapper)
  types.ts         — ExecuteOptions, ExecuteResult
  index.ts         — public API re-exports
tests/
  execute.test.ts  — tests against echo, gh, failing command, timeout
package.json       — build + test scripts, vitest or similar
tsconfig.json      — TypeScript config
```

## Success Criteria

All five must pass for the proof to be complete:

1. **It runs.** `execute({ command: 'echo', args: ['hello'] })` returns a structured `ExecuteResult` with `ok: true` and `stdout: 'hello\n'`.
2. **It captures.** stdout, stderr, exit code, and `durationMs` are all present and correct for both success and failure cases.
3. **It fails cleanly.** A missing command returns `{ ok: false, exitCode: null }` — no uncaught exception, no process crash.
4. **It parses when possible.** JSON stdout is parsed into the `artifact` field. Non-JSON stdout leaves `artifact: null`.
5. **It stays in its lane.** Zero imports from core relayfile, relayfile-adapters, or relayfile-providers. Zero filesystem abstraction. Zero server code. Zero OAuth.

## Implementation Path

1. `npm init` / update `package.json` with TypeScript, vitest, build scripts
2. Create `src/types.ts` with `ExecuteOptions` and `ExecuteResult`
3. Create `src/execute.ts` — spawn child process, capture streams, measure timing, attempt JSON parse on stdout
4. Create `src/index.ts` — re-export public API
5. Create `tests/execute.test.ts`:
   - `echo hello` → ok, stdout captured, no artifact (not JSON)
   - `echo '{"a":1}'` → ok, artifact parsed
   - `nonexistent-command-xyz` → ok: false, handled gracefully
   - timeout test (sleep command killed after short timeout)
6. Verify: `npm run build && npm test` passes. No imports from any other relayfile repo.

## What This Proves

If the proof ships:

- **The boundary is real.** This code has no structural reason to live in core relayfile, adapters, or providers.
- **The execute primitive is sound.** It can be the foundation for provider-specific CLI wrappers.
- **Artifact capture works.** Structured output from CLI tools is reliably captured and optionally parsed.
- **The repo stands alone.** It has its own build, test, and (future) release cycle with no cross-repo dependencies.
- **The ecosystem position is clear.** relayfile-cli complements providers (same services, different execution path) without duplicating adapters (no webhook normalization) or core (no VFS).
