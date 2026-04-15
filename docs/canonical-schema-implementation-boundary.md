# Canonical Schema Conformance — Implementation Boundary

## What This Proof Demonstrates

That relayfile-cli's `materialize()` can produce files conforming to a documented canonical relayfile file schema using only caller-supplied conformance logic — without importing adapter code, embedding schema knowledge in `materialize()`, or adding any runtime code to `src/`.

## What Changes

### New Files (Test-Side Only)

| File | Purpose |
|------|---------|
| `tests/helpers/conform-github.ts` | Standalone conformance function: maps raw `gh` CLI output shape to canonical GitHub issue file schema |
| `tests/canonical-conformance.test.ts` | Four test cases proving conformance, divergence, round-trip equivalence, and import isolation |

### No Changes to Existing Files

| File | Change | Rationale |
|------|--------|-----------|
| `src/types.ts` | None | `FormatFn` already supports `(result: ExecuteResult) => string \| Buffer` — sufficient for conformance |
| `src/materialize.ts` | None | Already schema-unaware; `formatContent()` already delegates to caller-supplied functions |
| `src/execute.ts` | None | Not touched by this proof |
| `src/index.ts` | None | No new exports required |
| `package.json` | None | No new dependencies |
| `tsconfig.json` | None | Tests are already excluded from compilation |

## Boundary Rules

1. **Zero runtime code additions.** This proof adds no files under `src/`. If implementing this proof requires modifying any file in `src/`, the boundary has been violated.

2. **The conformance helper imports only `ExecuteResult` from `src/types.js`.** No imports from `@relayfile/adapters`, `@relayfile/providers`, `@relayfile/sdk`, or any other relayfile package. No imports from `src/execute.js` or `src/materialize.js`.

3. **`materialize()` remains schema-unaware.** It does not validate, inspect, or transform artifacts against any canonical schema. It writes whatever the `MaterializeRule` produces.

4. **The canonical target shape is defined as a test constant, not a runtime type.** The expected canonical schema lives in the test file as a plain object. It is not exported, not importable, not part of relayfile-cli's API surface.

5. **Conformance is opt-in via `FormatFn`.** If a caller uses `format: 'json'` instead of a `FormatFn`, the output will not match canonical schema. This is by design and is explicitly tested (divergence test).

## What This Proof Does NOT Do

- Does not add canonical schema types to `src/types.ts` — schema definitions belong in core relayfile, not relayfile-cli.
- Does not validate against JSON Schema — structural equality via `toEqual` is sufficient for this proof slice.
- Does not test multiple providers — GitHub issues only. Linear, Slack, AWS are future proofs.
- Does not compare against actual adapter output — compares against a documented expected shape.
- Does not add a `@relayfile/schemas` package — that is a future concern for core relayfile.
- Does not run against a live `gh` CLI — uses `node -e` for deterministic test artifacts.

## Boundary Integrity Check

After implementation, the following must all be true:

```
grep -r "relayfile-adapter" src/     → no matches
grep -r "relayfile-provider" src/    → no matches
grep -r "canonical" src/             → no matches
git diff src/                        → empty (no source changes)
git diff package.json                → empty (no dependency changes)
npm run build                        → passes
npm test                             → passes (all existing + new tests)
npm run typecheck                    → passes
```

## Relationship to Prior Proofs

| Prior Proof | What It Proved | What This Proof Adds |
|-------------|---------------|---------------------|
| Materialization | `materialize()` writes files with path resolution, formatting, conditions, conflicts | Conformance: a `FormatFn` can map Layer 1 → Layer 2 shapes |
| Bridge | `execute()` + `materialize()` compose to write files at adapter-compatible paths | Schema fidelity: the file content matches canonical shape, not just the path |

This proof is the third and final layer: path (bridge) + content shape (canonical conformance) = files indistinguishable from adapter-produced files.
