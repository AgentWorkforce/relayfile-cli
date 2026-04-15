# Canonical File Schema Proof Direction

## The Target

Prove that relayfile-cli's `materialize()` can produce files conforming to canonical relayfile file schemas — using caller-supplied conformance logic — without importing adapter code or embedding schema knowledge in `materialize()` itself.

**This is a conformance proof, not a new primitive.** `execute()` and `materialize()` already exist (or are in progress). This proof demonstrates that the composition `execute() → caller conformance → materialize()` produces files indistinguishable from adapter-produced files at the same VFS path.

## Why This Target

1. **Proves schema convergence.** The bridge boundary claims that CLI-derived files and webhook-derived files at the same path are interchangeable. This proof tests that claim with a concrete example.

2. **Validates the FormatFn conformance pattern.** The canonical file schema boundary defines `FormatFn` as the mechanism for mapping raw CLI output to canonical shape. This proof demonstrates that the pattern works end-to-end.

3. **Keeps relayfile-cli honest.** If the proof requires importing adapter types or embedding GitHub-specific logic in `src/`, the boundary has leaked. The proof is a boundary integrity test.

4. **Unblocks downstream consumers.** NightCTO and other agents need to trust that a file at a canonical path has a canonical shape, regardless of origin. This proof gives them that guarantee.

## Prerequisites

- `execute()` — implemented, tested, passing.
- `materialize()` — must be implemented (per materialization proof direction) before this proof begins.
- `MaterializeRule` types — must be implemented, including `FormatFn` support.

## Scope

### In Scope

**Canonical conformance test (GitHub issue):**

- Execute a command that produces GitHub-issue-shaped JSON (via `node -e` for test determinism).
- Apply a `FormatFn` that maps the raw CLI shape to the canonical file schema for a GitHub issue.
- Materialize to the adapter-compatible path.
- Assert: file content matches canonical schema structure (field names, types, nesting).
- Assert: file content is identical in structure to what the GitHub adapter would produce from a webhook.

**Schema divergence test:**

- Execute the same command as above.
- Materialize with `format: 'json'` (no `FormatFn`, raw artifact written directly).
- Assert: file content does NOT match canonical schema (different field names, casing, structure).
- This proves that conformance is the caller's responsibility, not `materialize()`'s default behavior.

**Multi-field conformance test:**

- Execute a command that produces a complex artifact (nested objects, arrays, mixed types).
- Apply a `FormatFn` that selectively maps, renames, flattens, and filters fields.
- Assert: output matches the expected canonical structure exactly.

**Conformance function isolation test:**

- Define the conformance function as a standalone helper (not inline).
- Import it in the test.
- Assert: the helper has zero imports from relayfile-adapters, relayfile-providers, or core relayfile.
- This proves conformance logic can be extracted and shared without creating cross-repo dependencies.

**Round-trip equivalence test:**

- Define a canonical GitHub issue object directly (the "expected" shape).
- Execute a command that produces the raw CLI version of the same issue.
- Apply the conformance `FormatFn` and materialize.
- Read the file back and compare to the expected canonical object.
- Assert: deep equality after JSON parse.

### Out of Scope (Explicitly Deferred)

- **Formal JSON Schema validation.** The proof asserts structural equivalence, not JSON Schema compliance. Formal validation requires canonical schemas to be published as JSON Schema in core relayfile — that is a core relayfile concern.
- **Multiple providers.** GitHub only. Slack, Linear, AWS conformance proofs are future work.
- **Adapter output comparison.** The proof does not run the actual GitHub adapter and compare output. It compares against a documented/expected canonical shape.
- **Schema versioning.** Canonical schemas will evolve; version negotiation is deferred.
- **Automated schema drift detection.** A CI check that verifies CLI output still maps cleanly to canonical schemas is a future concern.
- **Shared conformance library.** Extracting conformance functions into a `@relayfile/schemas` package is deferred. This proof uses local helpers.

## Concrete Deliverable

### Conformance helper: `tests/helpers/conform-github.ts`

```typescript
import type { ExecuteResult } from '../../src/types.js';

/**
 * Maps raw `gh` CLI output for an issue to the canonical relayfile file schema.
 *
 * Raw CLI shape (Layer 1):      Canonical file schema (Layer 2):
 *   title: string                 title: string
 *   body: string                  body: string | null
 *   state: "OPEN" | "CLOSED"     state: "open" | "closed"
 *   number: number                number: number
 *   labels: [{name}]             labels: string[]
 *   assignees: [{login}]         assignees: string[]
 *   createdAt: string             created_at: string
 *   updatedAt: string             updated_at: string
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

This helper imports only from `../../src/types.js` (for the `ExecuteResult` type). Zero adapter imports.

### Test file: `tests/canonical-conformance.test.ts`

```typescript
import { execute } from '../src/execute.js';
import { materialize } from '../src/materialize.js';
import { conformGitHubIssue } from './helpers/conform-github.js';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// The canonical shape an agent expects at /github/repos/{owner}/{repo}/issues/{n}.json
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

// The raw CLI output shape (what `gh issue view --json ...` returns)
const RAW_CLI_OUTPUT = {
  number: 42,
  title: 'Fix the auth bug',
  state: 'OPEN',
  body: 'The login page throws a 500 when...',
  labels: [{ name: 'bug', id: 'L1', color: 'red' }, { name: 'auth', id: 'L2', color: 'blue' }],
  assignees: [{ login: 'octocat', id: 'U1' }],
  createdAt: '2026-01-15T10:00:00Z',
  updatedAt: '2026-01-16T14:30:00Z',
};

// 1. Conformance: FormatFn maps raw CLI output to canonical schema
test('conformGitHubIssue maps raw CLI output to canonical file schema', async () => {
  const result = await execute({
    command: 'node',
    args: ['-e', `console.log(JSON.stringify(${JSON.stringify(RAW_CLI_OUTPUT)}))`],
  });

  const mountRoot = await mkdtemp(join(tmpdir(), 'canonical-'));

  const output = await materialize({
    result,
    rule: {
      path: (r) => `github/repos/acme/api/issues/${(r.artifact as any).number}.json`,
      format: conformGitHubIssue,
      condition: 'on-artifact',
    },
    basePath: mountRoot,
  });

  expect(output.written).toBe(true);
  const content = JSON.parse(await readFile(output.path!, 'utf8'));
  expect(content).toEqual(EXPECTED_CANONICAL_ISSUE);

  await rm(mountRoot, { recursive: true });
});

// 2. Divergence: raw format does NOT match canonical schema
test('raw format produces non-canonical output', async () => {
  const result = await execute({
    command: 'node',
    args: ['-e', `console.log(JSON.stringify(${JSON.stringify(RAW_CLI_OUTPUT)}))`],
  });

  const mountRoot = await mkdtemp(join(tmpdir(), 'canonical-'));

  const output = await materialize({
    result,
    rule: {
      path: 'github/issue-raw.json',
      format: 'json',
      condition: 'on-artifact',
    },
    basePath: mountRoot,
  });

  const content = JSON.parse(await readFile(output.path!, 'utf8'));

  // Raw CLI output has camelCase and nested objects — not canonical
  expect(content.state).toBe('OPEN');              // canonical is lowercase
  expect(content.labels[0]).toHaveProperty('id');   // canonical is string[]
  expect(content.assignees[0]).toHaveProperty('id');// canonical is string[]
  expect(content.createdAt).toBeDefined();          // canonical is created_at
  expect(content.created_at).toBeUndefined();

  await rm(mountRoot, { recursive: true });
});

// 3. Round-trip equivalence
test('CLI output round-trips through conformance to match canonical shape', async () => {
  const result = await execute({
    command: 'node',
    args: ['-e', `console.log(JSON.stringify(${JSON.stringify(RAW_CLI_OUTPUT)}))`],
  });

  const mountRoot = await mkdtemp(join(tmpdir(), 'canonical-'));

  await materialize({
    result,
    rule: {
      path: 'github/repos/acme/api/issues/42.json',
      format: conformGitHubIssue,
      condition: 'on-artifact',
    },
    basePath: mountRoot,
  });

  // Read back and verify deep equality with expected canonical shape
  const filePath = join(mountRoot, 'github/repos/acme/api/issues/42.json');
  const content = JSON.parse(await readFile(filePath, 'utf8'));
  expect(content).toEqual(EXPECTED_CANONICAL_ISSUE);

  await rm(mountRoot, { recursive: true });
});

// 4. Conformance function has no cross-repo imports
test('conformGitHubIssue has no adapter/provider imports', async () => {
  const source = await readFile(
    new URL('./helpers/conform-github.ts', import.meta.url),
    'utf8',
  );

  expect(source).not.toMatch(/@relayfile\/adapter/);
  expect(source).not.toMatch(/@relayfile\/provider/);
  expect(source).not.toMatch(/relayfile-adapters/);
  expect(source).not.toMatch(/relayfile-providers/);
  expect(source).not.toMatch(/@relayfile\/sdk/);
});
```

## Implementation Path

1. Complete the materialization proof (prerequisite — `materialize()` must exist and support `FormatFn`).
2. Create `tests/helpers/conform-github.ts` with the conformance mapping function.
3. Create `tests/canonical-conformance.test.ts` with all four test cases.
4. Verify: `npm run build && npm test` passes. Zero imports from any other relayfile repo.

## Success Criteria

1. **Canonical conformance.** A file written via `FormatFn` conformance matches the expected canonical schema exactly (`toEqual` deep comparison).
2. **Raw divergence.** A file written with `format: 'json'` (no conformance) demonstrably differs from canonical shape — proving conformance is opt-in, not automatic.
3. **Round-trip integrity.** Raw CLI output → conformance function → materialize → read file → deep equal to expected canonical object.
4. **Import isolation.** The conformance helper imports only from `src/types.ts`. Zero imports from adapters, providers, or core relayfile.
5. **Build + test green.** `npm run build && npm test` passes with no new dependencies.

## What This Proves

If the proof passes:

- **The three-layer schema model works.** Raw CLI output (Layer 1) is cleanly mapped to canonical file schema (Layer 2) by a caller-supplied function, without relayfile-cli having schema knowledge.
- **FormatFn is the conformance mechanism.** The `MaterializeRule.format` field is sufficient for schema mapping. No new abstraction is needed.
- **Consumers stay file-centric.** An agent reading the materialized file sees exactly the canonical shape it expects. The CLI origin is invisible.
- **The boundary holds.** relayfile-cli's `materialize()` handles the write mechanics. The caller handles the schema mapping. No adapter logic leaks into relayfile-cli.
- **Conformance is extractable.** The helper function pattern shows how conformance logic can later move to a shared package without changing `materialize()`.
