# Canonical Schema Conformance — Implementation Plan

## Overview

This plan implements the canonical schema conformance proof for relayfile-cli. The proof shows that `execute() → caller-supplied FormatFn → materialize()` produces files matching a documented canonical relayfile file schema, without embedding schema knowledge in relayfile-cli's runtime code.

## Prerequisites (Already Met)

- `execute()` — implemented, tested, passing (`src/execute.ts`)
- `materialize()` — implemented, tested, passing (`src/materialize.ts`)
- `FormatFn` type — defined in `src/types.ts` as `(result: ExecuteResult) => string | Buffer`
- Bridge proof — passing, demonstrates path composition (`tests/bridge.test.ts`)

## Implementation Steps

### Step 1: Create `tests/helpers/` directory

Create the `tests/helpers/` directory to house the conformance helper.

### Step 2: Create `tests/helpers/conform-github.ts`

The conformance function that maps raw GitHub CLI output (Layer 1) to canonical GitHub issue file schema (Layer 2).

```typescript
import type { ExecuteResult } from '../../src/types.js';

/**
 * Maps raw `gh` CLI issue output to the canonical relayfile GitHub issue file schema.
 *
 * Layer 1 (raw CLI):           Layer 2 (canonical file schema):
 *   title: string                title: string
 *   body: string                 body: string | null
 *   state: "OPEN" | "CLOSED"    state: "open" | "closed"
 *   number: number               number: number
 *   labels: [{name, id, ...}]   labels: string[]
 *   assignees: [{login, ...}]   assignees: string[]
 *   createdAt: string            created_at: string
 *   updatedAt: string            updated_at: string
 */
export function conformGitHubIssue(result: ExecuteResult): string {
  const raw = result.artifact as Record<string, unknown>;
  const canonical = {
    number: raw.number,
    title: raw.title,
    state: (raw.state as string).toLowerCase(),
    body: raw.body || null,
    labels: ((raw.labels as any[]) || []).map((l) => l.name ?? l),
    assignees: ((raw.assignees as any[]) || []).map((a) => a.login ?? a),
    created_at: raw.createdAt ?? raw.created_at,
    updated_at: raw.updatedAt ?? raw.updated_at,
  };
  return JSON.stringify(canonical, null, 2);
}
```

Key properties:
- Imports only `ExecuteResult` from `../../src/types.js`
- Zero imports from any `@relayfile/*` package
- Pure function: `ExecuteResult` in, JSON string out
- Handles the three key mapping operations: case normalization (`OPEN` → `open`), structure flattening (label objects → string array), and field renaming (`createdAt` → `created_at`)

### Step 3: Create `tests/canonical-conformance.test.ts`

Four test cases, each proving a distinct aspect of canonical schema conformance.

#### Test Data Constants

Two constants anchor all tests:

```typescript
// The canonical shape — what an agent expects at /github/repos/{owner}/{repo}/issues/{n}.json
const EXPECTED_CANONICAL_ISSUE = {
  number: 42,
  title: 'Fix the auth bug',
  state: 'open',
  body: 'The login page throws a 500 when...',
  labels: ['bug', 'auth'],
  assignees: ['octocat'],
  created_at: '2026-01-15T10:00:00Z',
  updated_at: '2026-01-16T14:30:00Z',
};

// The raw CLI shape — what `gh issue view --json ...` returns
const RAW_CLI_OUTPUT = {
  number: 42,
  title: 'Fix the auth bug',
  state: 'OPEN',
  body: 'The login page throws a 500 when...',
  labels: [
    { name: 'bug', id: 'L1', color: 'red' },
    { name: 'auth', id: 'L2', color: 'blue' },
  ],
  assignees: [{ login: 'octocat', id: 'U1' }],
  createdAt: '2026-01-15T10:00:00Z',
  updatedAt: '2026-01-16T14:30:00Z',
};
```

These constants make the Layer 1 → Layer 2 mapping explicit and testable.

#### Test 1: Canonical Conformance

**Purpose:** Prove that `execute() → conformGitHubIssue → materialize()` produces a file whose content deep-equals the expected canonical shape.

**Flow:**
1. Execute `node -e` that emits `RAW_CLI_OUTPUT` as JSON stdout.
2. Materialize with `format: conformGitHubIssue` and adapter-compatible path.
3. Read file back, parse JSON, assert `toEqual(EXPECTED_CANONICAL_ISSUE)`.

**What it proves:** The FormatFn conformance pattern works end-to-end. A file at a canonical VFS path contains canonical-shaped data.

#### Test 2: Schema Divergence

**Purpose:** Prove that without a conformance `FormatFn`, raw CLI output does NOT match canonical schema.

**Flow:**
1. Execute same `node -e` command producing `RAW_CLI_OUTPUT`.
2. Materialize with `format: 'json'` (no FormatFn — writes artifact as-is).
3. Read file back, assert specific divergences: `state` is `"OPEN"` not `"open"`, `labels[0]` has `id` property, `createdAt` exists but `created_at` does not.

**What it proves:** Conformance is opt-in. `materialize()` does not auto-conform. Schema awareness lives in the caller, not the primitive.

#### Test 3: Round-Trip Equivalence

**Purpose:** Prove full round-trip: raw CLI output → execute → conform → materialize → read file → deep equal to expected canonical object.

**Flow:**
1. Execute, conform, materialize to a canonical path.
2. Read the file from the filesystem using the resolved path.
3. Parse and assert deep equality with `EXPECTED_CANONICAL_ISSUE`.

**What it proves:** No data loss or corruption through the full pipeline. The file is byte-for-byte what the canonical schema demands.

#### Test 4: Import Isolation

**Purpose:** Prove that the conformance helper has zero cross-repo dependencies.

**Flow:**
1. Read `tests/helpers/conform-github.ts` source as a string.
2. Assert no matches for `@relayfile/adapter`, `@relayfile/provider`, `relayfile-adapters`, `relayfile-providers`, or `@relayfile/sdk`.

**What it proves:** The conformance function is self-contained. It can be extracted to a shared package later without pulling in adapter code. The boundary between relayfile-cli and adapters is intact.

### Step 4: Validate

Run all validation gates:

```bash
npm run build        # TypeScript compilation — no source changes, should pass
npm test             # All existing tests + 4 new canonical conformance tests
npm run typecheck    # Type checking — no source changes, should pass
```

Additionally verify boundary integrity:

```bash
git diff src/        # Must be empty — no runtime code changes
git diff package.json # Must be empty — no dependency changes
```

## File Dependency Graph

```
tests/canonical-conformance.test.ts
  ├── imports: tests/helpers/conform-github.ts
  │     └── imports: src/types.ts (ExecuteResult type only)
  ├── imports: src/execute.ts (execute function)
  └── imports: src/materialize.ts (materialize function)
```

No new dependency paths are introduced. The conformance helper sits in `tests/helpers/`, outside the compilation target (`src/`), outside the package distribution (`dist/`).

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| `node -e` JSON output varies across Node versions | Very low | Output is `JSON.stringify` — deterministic |
| Conformance helper type cast is too loose (`as any[]`) | Low | Acceptable for test helper; prod conformance would use stricter types |
| Test reads file with race condition | Very low | Single-process sequential test execution |
| Future `materialize()` changes break conformance tests | Low | Tests use the stable public API, not internal functions |

## What Success Looks Like

After implementation:
- 4 new tests in `tests/canonical-conformance.test.ts`, all passing
- 1 new helper in `tests/helpers/conform-github.ts`
- Zero changes to `src/`
- Zero new dependencies
- `npm run build && npm test && npm run typecheck` all green
