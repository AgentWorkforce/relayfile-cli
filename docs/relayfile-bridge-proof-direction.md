# Bridge Proof Direction

## The Target

Prove that relayfile-cli artifacts can flow through `materialize()` into a local directory structure that a relayfile mount would recognize, using adapter-compatible path conventions, without importing from any other relayfile repo.

**This is not a new primitive.** It is a composition proof: `execute()` + `materialize()` + adapter-compatible path conventions = files that bridge into the relayfile VFS.

## Why This Target

1. **Closes the value loop.** The execute proof showed CLI output can be captured. The materialization proof (pending) will show artifacts can become files. This bridge proof shows those files can land where relayfile expects them — completing the path from CLI invocation to agent-readable state.

2. **Keeps consumers file-centric.** The whole point of the bridge is that NightCTO and other agents never learn about CLIs. If the proof produces files that an agent would read identically to webhook-derived files, the bridge works.

3. **Tests the boundary, not just the code.** The interesting claim is that adapter path conventions can be followed without adapter code. This proof must demonstrate that a CLI-materialized file at `github/repos/acme/api/issues/42.json` is structurally identical to what the GitHub adapter would produce — by convention, not by import.

## Prerequisites

The materialization proof must be complete before this bridge proof begins. This proof depends on:

- `execute()` — implemented, tested, passing.
- `materialize()` — defined in materialization boundary, implementation pending.
- `MaterializeRule` types — defined, implementation pending.

## Scope

### In Scope

**Path convention alignment test:**

- Define a set of adapter-compatible path patterns for GitHub (the simplest, most concrete case).
- Write `MaterializeRule` instances whose `path` functions produce paths matching those patterns.
- Verify that the materialized file lands at the expected path relative to a `basePath` that simulates a relayfile mount directory.

**End-to-end bridge test:**

- `execute()` a command that produces JSON output (e.g., `echo '{"number": 42, "title": "Fix bug", "state": "open"}'`).
- `materialize()` the result with a path function that follows the GitHub adapter's issue path convention.
- Assert: file exists at `{basePath}/github/repos/acme/api/issues/42.json`.
- Assert: file content is valid JSON matching the artifact.
- Assert: file is readable by a hypothetical agent doing `cat {basePath}/github/repos/acme/api/issues/42.json`.

**Convention documentation:**

- A small reference table mapping CLI commands to the adapter path conventions their output should follow.
- This is documentation, not code. relayfile-cli does not enforce these conventions; it enables them.

**Dry-run bridge test:**

- Same as end-to-end but with `dryRun: true`.
- Assert: `MaterializeOutput.path` resolves to the correct adapter-compatible path.
- Assert: no file is written.
- This proves path resolution works without filesystem side effects.

**Multi-file bridge test:**

- Execute a command that returns a list (e.g., `echo '[{"number": 1, "title": "A"}, {"number": 2, "title": "B"}]'`).
- Caller loops over `result.artifact` items, calling `materialize()` once per item with a per-item path function.
- Assert: two files exist at `{basePath}/github/repos/acme/api/issues/1.json` and `{basePath}/github/repos/acme/api/issues/2.json`.
- This proves the caller-driven composition pattern works for list-shaped CLI output.

### Out of Scope (Explicitly Deferred)

- **Actual relayfile mount verification.** This proof writes to a local directory. Verifying that core relayfile's FUSE mount or polling sync picks up the files requires core relayfile to be running. That is an integration test for a future milestone.
- **Writeback testing.** The bridge is inbound only (CLI → file). Writeback (file → API) is tested at the adapter/provider level.
- **Provider rule presets.** Reusable `MaterializeRule` factories for specific CLIs (e.g., `githubRules.issueView()`) are a future proof. This proof uses inline rules.
- **Template-string path interpolation.** Function-based paths are sufficient for this proof.
- **Multiple provider conventions.** GitHub is the only provider tested. Slack, Linear, etc. are deferred.
- **Schema validation.** The proof does not validate that CLI output matches the schema an adapter would produce. Content equivalence is out of scope; path equivalence is in scope.

## Concrete Deliverable

### Test file: `tests/bridge.test.ts`

```typescript
import { execute } from '../src/execute.js';
import { materialize } from '../src/materialize.js';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// 1. Single-item bridge: CLI artifact → adapter-compatible path
test('materializes CLI artifact to adapter-compatible GitHub issue path', async () => {
  const result = await execute({
    command: 'node',
    args: ['-e', 'console.log(JSON.stringify({ number: 42, title: "Fix bug", state: "open" }))'],
  });

  const mountRoot = await mkdtemp(join(tmpdir(), 'bridge-'));

  const output = await materialize({
    result,
    rule: {
      path: (r) => `github/repos/acme/api/issues/${r.artifact.number}.json`,
      format: 'json',
      condition: 'on-artifact',
    },
    basePath: mountRoot,
  });

  expect(output.written).toBe(true);
  expect(output.path).toBe(join(mountRoot, 'github/repos/acme/api/issues/42.json'));

  const content = JSON.parse(await readFile(output.path!, 'utf8'));
  expect(content.number).toBe(42);
  expect(content.title).toBe('Fix bug');

  await rm(mountRoot, { recursive: true });
});

// 2. Multi-item bridge: list artifact → multiple adapter-compatible paths
test('materializes list artifact to multiple adapter-compatible paths', async () => {
  const result = await execute({
    command: 'node',
    args: ['-e', 'console.log(JSON.stringify([{ number: 1, title: "A" }, { number: 2, title: "B" }]))'],
  });

  const mountRoot = await mkdtemp(join(tmpdir(), 'bridge-'));
  const items = result.artifact as Array<{ number: number; title: string }>;

  for (const item of items) {
    await materialize({
      result: { ...result, artifact: item },
      rule: {
        path: (r) => `github/repos/acme/api/issues/${r.artifact.number}.json`,
        format: 'json',
        condition: 'on-artifact',
      },
      basePath: mountRoot,
    });
  }

  const file1 = JSON.parse(await readFile(join(mountRoot, 'github/repos/acme/api/issues/1.json'), 'utf8'));
  const file2 = JSON.parse(await readFile(join(mountRoot, 'github/repos/acme/api/issues/2.json'), 'utf8'));
  expect(file1.title).toBe('A');
  expect(file2.title).toBe('B');

  await rm(mountRoot, { recursive: true });
});

// 3. Dry-run bridge: path resolves correctly without writing
test('dry-run resolves adapter-compatible path without writing', async () => {
  const result = await execute({
    command: 'node',
    args: ['-e', 'console.log(JSON.stringify({ number: 99, title: "Dry" }))'],
  });

  const output = await materialize({
    result,
    rule: {
      path: (r) => `github/repos/acme/api/issues/${r.artifact.number}.json`,
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

### Convention reference: `docs/adapter-path-conventions.md`

A short document mapping CLI commands to adapter path patterns. Example entries:

| CLI Command | Adapter Path Pattern | Notes |
|-------------|---------------------|-------|
| `gh issue view {n} --json ...` | `github/repos/{owner}/{repo}/issues/{n}.json` | Matches GitHub adapter issue path |
| `gh pr view {n} --json ...` | `github/repos/{owner}/{repo}/pulls/{n}/metadata.json` | Matches GitHub adapter PR path |
| `gh repo view --json ...` | `github/repos/{owner}/{repo}/metadata.json` | Repo-level metadata |

This table is reference documentation. It is not code, not enforced, and not a type definition. Its purpose is to help callers write `MaterializeRule.path` functions that produce adapter-compatible paths.

## Implementation Path

1. Complete the materialization proof (prerequisite).
2. Create `tests/bridge.test.ts` with the three test cases above.
3. Create `docs/adapter-path-conventions.md` with the convention reference table.
4. Verify: `npm run build && npm test` passes. Zero imports from core relayfile, adapters, or providers.

## Success Criteria

1. **Path alignment.** A CLI-materialized file lands at a path that matches the adapter convention for the same resource. Verified by string assertion on `MaterializeOutput.path`.
2. **Content readability.** The materialized file is valid JSON, readable by `JSON.parse()`, and contains the artifact data. An agent doing `cat` on the file gets usable content.
3. **No import coupling.** The bridge test file imports only from `../src/`. Zero imports from core relayfile, adapters, or providers.
4. **Dry-run correctness.** Path resolution produces the correct adapter-compatible path without writing to disk.
5. **List composition.** The caller-driven loop pattern produces multiple files at correct paths from a single list-shaped CLI result.
6. **Convention documentation exists.** A reference table maps CLI commands to adapter paths so future callers have a starting point.

## What This Proves

If the bridge proof passes:

- **The filesystem-as-bridge design works.** CLI artifacts become VFS-compatible files through materialization alone, no import coupling required.
- **Adapter conventions are followable without adapter code.** The path `github/repos/acme/api/issues/42.json` can be produced by both the GitHub adapter and a `MaterializeRule.path` function, independently.
- **Consumers stay file-centric.** The test reads the file with `readFile` — the same operation an agent would perform through the VFS. The origin (CLI vs. webhook) is invisible.
- **The composition pattern scales.** Single items, lists, and dry-runs all work with the same `materialize()` function and caller-driven path logic.
- **The boundary holds under integration.** `execute()` + `materialize()` + adapter-compatible paths compose cleanly without pulling in any other relayfile repo.
