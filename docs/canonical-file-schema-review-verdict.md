# Canonical File Schema Boundary — Review Verdict

## Status: APPROVED

The boundary is clean, the proof direction is scoped, and the design avoids the two failure modes that would matter: relayfile-cli absorbing adapter logic, or canonical schemas becoming a relayfile-cli responsibility.

## What Was Reviewed

1. `docs/canonical-file-schema-boundary.md` — the three-layer schema model and ownership assignments
2. `docs/canonical-file-schema-proof-direction.md` — the conformance proof plan

## Verdict: Pass on All Criteria

### 1. Three-layer distinction is clear and non-overlapping

The boundary draws three layers — raw CLI, canonical file, downstream consumer — and assigns each to a different owner. The layers change for different reasons (vendor update, VFS spec change, consumer requirement), which validates the split.

**No concerns.** The distinction between "what `gh` returns" and "what a file at a VFS path contains" is the key insight. Without this distinction, relayfile-cli would either write raw CLI output (breaking consumer expectations) or embed adapter logic (breaking the repo boundary).

### 2. Canonical schemas belong to core relayfile

The boundary correctly places canonical file schemas in core relayfile, not in adapters or relayfile-cli. Adapters and CLI callers both target these schemas but do not define them.

**One caveat.** Core relayfile does not yet publish formal canonical schemas. The boundary acknowledges this and treats adapter output as the de facto standard until formal schemas exist. This is pragmatic and honest. The proof direction does not block on core relayfile publishing schemas — it tests against an expected shape documented in the test file itself.

### 3. relayfile-cli stays schema-unaware

`materialize()` does not import, reference, or validate canonical schemas. The `FormatFn` in `MaterializeRule` is the conformance mechanism, and conformance is entirely caller-driven.

**This is the right design.** If `materialize()` knew about schemas, every new schema or schema change would require a relayfile-cli release. By keeping it schema-unaware, relayfile-cli can serve any canonical schema — current or future — without modification.

### 4. Conformance is not adapter logic

The boundary draws a clear line: adapters do path mapping + webhook normalization + writeback. Conformance (mapping one data shape to another) is a data transformation, not an adapter concern. The `FormatFn` pattern proves this — it is a function `(ExecuteResult) => string`, no different from any serialization callback.

**No concerns.** The test for import isolation (`conformGitHubIssue has no adapter/provider imports`) is a direct boundary integrity check.

### 5. Consumers stay file-centric

The entire design ensures that agents read files without knowing the data source. A file at `/github/repos/acme/api/issues/42.json` has the same canonical shape whether it arrived via webhook or CLI. NightCTO reads a file; the origin is invisible.

**This is the design goal of the entire relayfile ecosystem.** The canonical schema boundary preserves it across the CLI execution path.

### 6. Proof is scoped and honest

The proof direction tests conformance with one provider (GitHub), defers multi-provider conformance, defers JSON Schema validation, and defers a shared conformance library. Each deferral is explicit and has a rationale.

**The scope is right.** One provider with four test cases (conformance, divergence, round-trip, import isolation) is enough to validate the pattern without overbuilding.

## Risks Acknowledged

| Risk | Assessment |
|------|-----------|
| Canonical schemas don't exist yet in core relayfile | Acceptable. The proof uses a documented expected shape. Formal schemas are a core relayfile concern. |
| Conformance logic could leak into `src/` | Low risk. The boundary rule is testable: `tests/helpers/` is the conformance location, not `src/`. The import isolation test enforces this. |
| Adapter and CLI paths could diverge in schema shape | Medium risk. Both should target the same canonical schema. Until formal schemas exist, adapter output is the de facto standard. The round-trip test catches drift. |
| `FormatFn` conformance is boilerplate-heavy per provider | True, but acceptable. Shared conformance functions are explicitly deferred. The boilerplate validates the pattern before premature abstraction. |

## Boundary Integrity Checks

The following invariants must hold after the proof ships:

1. `src/materialize.ts` has zero references to canonical schema types, field names, or service-specific logic.
2. `src/types.ts` has zero imports from core relayfile, adapters, or providers.
3. The conformance helper (`tests/helpers/conform-github.ts`) imports only `ExecuteResult` from `src/types.ts`.
4. `npm run build` succeeds with no new dependencies beyond `node:fs` and `node:path`.
5. The test file demonstrates both conforming and non-conforming output to prove conformance is opt-in.

## Next Proof After This

The canonical file schema proof depends on the materialization proof (for `materialize()` and `FormatFn` support). The dependency chain is:

```
execute proof (done)
    → materialization proof (in progress)
        → canonical file schema proof (this)
            → provider rule presets (future — reusable MaterializeRule factories per CLI)
```

The next bounded proof after the canonical schema proof would be **provider rule presets**: reusable `MaterializeRule` factories that bundle path conventions + conformance functions for specific CLIs (e.g., `githubRules.issueView(owner, repo)`). These presets would live in a separate package or in caller code, not in relayfile-cli core — consistent with the schema-unaware design.

## Final Assessment

The canonical file schema boundary answers the right question: "where do file schemas live, and how does CLI output conform to them?" The answer — canonical schemas in core relayfile, conformance via caller-supplied `FormatFn`, relayfile-cli stays schema-unaware — is the simplest design that preserves the repo boundary and keeps consumers file-centric.

The proof direction is the smallest slice that validates this design: one provider, four tests, no new dependencies, no new primitives.

Ready to implement after the materialization proof ships.
