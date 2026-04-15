# Bridge Implementation Boundary

## What This Document Defines

The exact implementation boundary for the relayfile-cli bridge proof. This specifies what code will be written, what files will be created or modified, what imports are permitted, and what the proof demonstrates upon completion.

## Implementation Scope

### New Files

| File | Purpose | Imports Permitted |
|------|---------|-------------------|
| `tests/bridge.test.ts` | Bridge proof test suite | `vitest`, `../src/execute.js`, `../src/materialize.js`, `../src/types.js`, `node:fs/promises`, `node:path`, `node:os` |
| `docs/adapter-path-conventions.md` | Reference table mapping CLI commands to adapter path patterns | N/A (documentation only) |

### Modified Files

None. The bridge proof does not modify any existing source file. `execute()`, `materialize()`, and all types remain untouched. The proof composes existing primitives; it does not extend them.

### Explicitly Excluded Files

| File | Reason |
|------|--------|
| `src/materialize.ts` | No changes needed. The existing `MaterializeRule` API supports all bridge patterns. |
| `src/types.ts` | No new types needed. `PathTemplate`, `FormatFn`, and `MaterializeOptions` already support function-based paths and custom formatters. |
| `src/execute.ts` | No changes. Execution primitive is stable. |
| `src/index.ts` | No new exports. The bridge is a composition pattern, not a new primitive. |

## Import Boundary

The bridge test file imports exclusively from:

1. **relayfile-cli source** (`../src/execute.js`, `../src/materialize.js`, `../src/types.js`)
2. **Node.js built-ins** (`node:fs/promises`, `node:path`, `node:os`)
3. **Test framework** (`vitest`)

Zero imports from:
- Core relayfile
- relayfile-adapters
- relayfile-providers
- Any external npm package

This constraint is verifiable by inspection of the import block in `tests/bridge.test.ts`.

## What the Bridge Proof Composes

The proof demonstrates composition of two existing primitives with caller-supplied conventions:

```
execute() → ExecuteResult → materialize(rule with adapter-compatible path) → file at VFS-compatible path
```

The caller (the test code) provides:
1. A `PathTemplate` function that produces adapter-compatible paths (e.g., `github/repos/{owner}/{repo}/issues/{n}.json`)
2. Optionally, a `FormatFn` that reshapes raw CLI output to match canonical file schema expectations

The bridge proof does not add any new runtime code. It proves that the existing API surface is sufficient for the bridge use case.

## Test Cases

### Test 1: Single-Item Bridge

**What it proves:** A single CLI execution result, materialized with an adapter-compatible path function, lands at the correct VFS-compatible location with readable JSON content.

**Flow:**
1. `execute()` runs `node -e 'console.log(JSON.stringify({...}))'` to produce a JSON artifact
2. `materialize()` writes the artifact using a `PathTemplate` function that follows GitHub adapter issue path conventions
3. Assertions verify file path, content validity, and structural correctness

**Adapter convention tested:** `github/repos/{owner}/{repo}/issues/{number}.json`

### Test 2: Multi-Item Bridge

**What it proves:** A list-shaped CLI result can be decomposed by the caller into multiple files at adapter-compatible paths using a loop over `materialize()`.

**Flow:**
1. `execute()` produces a JSON array artifact
2. Caller iterates over array items
3. Each item is materialized with a per-item path function
4. Assertions verify both files exist at correct paths with correct content

**Key insight:** `materialize()` handles single items. The caller handles list decomposition. This is by design — `materialize()` stays simple; the caller stays in control.

### Test 3: Dry-Run Bridge

**What it proves:** Path resolution produces the correct adapter-compatible path without writing to disk. This validates path logic independently of filesystem effects.

**Flow:**
1. `execute()` produces a JSON artifact
2. `materialize()` called with `dryRun: true`
3. Assertions verify `output.path` matches adapter convention, `output.written` is `false`, and `output.content` is populated

### Test 4: Custom Format Bridge (Schema Conformance)

**What it proves:** A caller-supplied `FormatFn` can reshape raw CLI output into a canonical file schema shape before materialization. This demonstrates the caller-driven conformance pattern without relayfile-cli absorbing any schema or adapter logic.

**Flow:**
1. `execute()` produces a JSON artifact with CLI-vendor-shaped fields (e.g., camelCase)
2. `materialize()` called with a `FormatFn` that maps vendor fields to canonical schema fields (e.g., snake_case)
3. Assertions verify the written file contains the remapped fields

### Test 5: Nested Directory Creation

**What it proves:** Adapter-compatible paths with deep nesting (e.g., `github/repos/acme/api/issues/42.json`) correctly trigger `mkdir -p` behavior through the existing `materialize()` implementation.

**Flow:**
1. `execute()` produces a JSON artifact
2. `materialize()` writes to a deeply nested adapter-compatible path
3. Assertions verify the full directory tree was created and the file exists

## Validation Gates

All gates must pass for the bridge proof to be considered complete:

| Gate | Command | Expected |
|------|---------|----------|
| TypeScript compilation | `npm run build` | Exit 0, no errors |
| Type checking | `npm run typecheck` | Exit 0, no errors |
| Full test suite | `npm test` | All tests pass (existing 30 + new bridge tests) |
| Import boundary | Manual inspection of `tests/bridge.test.ts` imports | Zero external package imports |

## What This Proof Does NOT Include

| Excluded Concern | Reason |
|-----------------|--------|
| FUSE mount verification | Requires core relayfile running; this is a local-filesystem proof |
| Writeback testing | Bridge is inbound only (CLI → file); writeback is adapter/provider scope |
| Provider rule presets/factories | Future proof; this uses inline rules only |
| Schema validation against canonical types | Canonical schemas are defined in core relayfile, not here |
| Multiple provider conventions | GitHub only; Slack/Linear/AWS deferred |
| Template-string path interpolation | Function-based paths are sufficient and more flexible |
| New runtime exports | The bridge is a composition pattern, not a new API surface |

## Boundary Contract Summary

1. **No new source code.** Only a test file and a documentation file are created.
2. **No new types.** Existing `PathTemplate`, `FormatFn`, `MaterializeRule`, and `MaterializeOptions` are sufficient.
3. **No new exports.** The bridge is proven through composition, not extension.
4. **No external imports.** The test file uses only relayfile-cli source, Node built-ins, and vitest.
5. **No modifications to existing files.** The proof is purely additive.
6. **Filesystem is the integration point.** The proof writes to a temp directory that simulates a relayfile mount path. No IPC, no RPC, no shared state.
