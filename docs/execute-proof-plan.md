# Execute Proof Implementation Plan

## Overview

This plan defines the exact step-by-step implementation sequence for the relayfile-cli execute + artifact capture proof. Each step produces a verifiable artifact. The implementation agent should execute these steps in order.

---

## Step 1: Update package.json

**File:** `package.json`

Add the following to the existing package.json:

```json
{
  "name": "relayfile-cli",
  "private": true,
  "version": "0.1.0",
  "description": "Standalone CLI substrate for RelayFile-adjacent command execution and artifact capture",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "workflow": "agent-relay run"
  },
  "dependencies": {
    "@agent-relay/sdk": "latest"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^3.0.0",
    "@types/node": "^20.0.0"
  }
}
```

**Verify:** `cat package.json` shows correct scripts and devDependencies.

---

## Step 2: Create tsconfig.json

**File:** `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

**Verify:** File exists and is valid JSON.

---

## Step 3: Create src/types.ts

**File:** `src/types.ts`

Define the two core interfaces:

```typescript
export interface ExecuteOptions {
  /** CLI binary name or absolute path */
  command: string;
  /** Arguments array (default: []) */
  args?: string[];
  /** Working directory for the spawned process (default: process.cwd()) */
  cwd?: string;
  /** Kill timeout in milliseconds (default: 30_000) */
  timeout?: number;
  /** Additional environment variables, merged onto process.env */
  env?: Record<string, string>;
}

export interface ExecuteResult {
  /** true iff exitCode === 0 */
  ok: boolean;
  /** Process exit code, or null if killed by signal/timeout */
  exitCode: number | null;
  /** Raw stdout capture */
  stdout: string;
  /** Raw stderr capture */
  stderr: string;
  /** Wall-clock execution time in milliseconds */
  durationMs: number;
  /** Parsed JSON from stdout, or null if stdout is not valid JSON */
  artifact: unknown | null;
  /** ISO 8601 timestamp of capture completion */
  capturedAt: string;
}
```

**Verify:** `npx tsc --noEmit` passes (after step 4+5 exist as stubs).

---

## Step 4: Create src/execute.ts

**File:** `src/execute.ts`

Implementation requirements:

1. Import `spawn` from `node:child_process`.
2. Accept `ExecuteOptions`, apply defaults (`args: []`, `timeout: 30_000`).
3. Record `startTime` via `performance.now()` or `Date.now()`.
4. Spawn the child process with `{ cwd, env: { ...process.env, ...options.env }, stdio: 'pipe' }`.
5. Collect stdout and stderr into buffers via stream `data` events.
6. Set up a timeout timer that calls `child.kill('SIGTERM')` (or `SIGKILL` as fallback).
7. Wait for the `close` event. Compute `durationMs = endTime - startTime`.
8. Handle the `error` event (e.g., ENOENT for command-not-found) — return `{ ok: false, exitCode: null, stderr: error.message }`.
9. Attempt `JSON.parse(stdout.trim())` — if successful, set `artifact`; otherwise `null`.
10. Return the complete `ExecuteResult`.
11. **Never throw.** Wrap the entire function body so all error paths return a structured result.

Key implementation detail for command-not-found: `spawn` emits an `error` event with code `ENOENT` when the binary doesn't exist. The implementation must handle this event and not let it become an uncaught exception.

Key implementation detail for timeout: The timeout should clear itself if the process exits before the timeout fires. Use `clearTimeout` in the `close` handler.

**Verify:** `npx tsc --noEmit` passes.

---

## Step 5: Create src/index.ts

**File:** `src/index.ts`

```typescript
export { execute } from './execute.js';
export type { ExecuteOptions, ExecuteResult } from './types.js';
```

**Verify:** `npx tsc --noEmit` passes.

---

## Step 6: Install dependencies and build

```bash
npm install
npm run build
```

**Verify:** `dist/` directory contains `index.js`, `execute.js`, `types.js` and corresponding `.d.ts` files.

---

## Step 7: Create tests/execute.test.ts

**File:** `tests/execute.test.ts`

Implement all 8 test cases from the no-regression checklist (TC-1 through TC-8):

1. **TC-1: Basic execution** — `echo hello` → ok, stdout captured, no artifact
2. **TC-2: JSON artifact** — `echo '{"name":"test","value":42}'` → artifact parsed
3. **TC-3: Non-zero exit** — `sh -c 'exit 1'` → ok: false, exitCode: 1
4. **TC-4: Command not found** — `nonexistent-command-xyz-9999` → ok: false, no throw
5. **TC-5: Timeout** — `sleep 60` with 500ms timeout → killed, durationMs < 5000
6. **TC-6: Stderr capture** — `sh -c 'echo err >&2'` → stderr captured
7. **TC-7: Custom env** — `echo $TEST_VAR` with env override → value captured
8. **TC-8: Invalid JSON** — `echo '{invalid json}'` → artifact: null, no error

Import the `execute` function from the source (not dist) for testing:

```typescript
import { describe, it, expect } from 'vitest';
import { execute } from '../src/execute.js';
```

**Verify:** `npm test` — all 8 tests pass.

---

## Step 8: Run full validation

Execute the composite validation command from the no-regression checklist:

```bash
npx tsc --noEmit && \
npm run build && \
npm test && \
! grep -rqE "(from|require).*@relayfile" src/ tests/ && \
! grep -rqE "(createServer|express|fastify|http\.listen|app\.listen)" src/ tests/ && \
test -f src/types.ts && \
test -f src/execute.ts && \
test -f src/index.ts && \
test -f tests/execute.test.ts && \
test -f tsconfig.json && \
echo "RELAYFILE_CLI_EXECUTE_PROOF_ALL_GATES_PASSED"
```

**Verify:** Final line of output is `RELAYFILE_CLI_EXECUTE_PROOF_ALL_GATES_PASSED`.

---

## Step 9: Fix-and-rerun loop

If any gate fails in Step 8:

1. Read the error output.
2. Fix the specific issue.
3. Re-run `npm run build && npm test`.
4. Re-run the full composite validation.
5. Repeat until all gates pass.

Do NOT move past Step 8 until the composite validation prints `RELAYFILE_CLI_EXECUTE_PROOF_ALL_GATES_PASSED`.

---

## Implementation Constraints

- **No new dependencies** beyond `typescript`, `vitest`, and `@types/node`. The execute function uses only Node.js built-in modules (`node:child_process`, `node:util`).
- **No abstractions beyond what's needed.** One function, two types, one test file. No base classes, no plugin systems, no configuration frameworks.
- **No provider-specific code.** The test suite uses `echo`, `sh`, and `sleep` — all POSIX-standard. The `gh` example from the first-proof-direction doc is a usage example, not a test dependency.
- **ES module format.** Use `.js` extensions in imports (required by Node16 module resolution).

---

## Acceptance

The proof is accepted when:

1. All 8 test cases pass (TC-1 through TC-8)
2. All build gates pass (BG-1 through BG-3)
3. All boundary gates pass (BO-1 through BO-4)
4. All file existence gates pass (FE-1 through FE-3)
5. The composite validation command prints `RELAYFILE_CLI_EXECUTE_PROOF_ALL_GATES_PASSED`

RELAYFILE_CLI_EXECUTE_PROOF_PLAN_DEFINED
