# Bridge Boundary Review Verdict

## Verdict

**Status: Ready for implementation (after materialization proof lands).**

The bridge boundary is well-defined and correctly minimal. The filesystem-as-integration-point design avoids the most common boundary failure mode — import coupling disguised as "convenience." The ownership lines are clear, the consumer model stays file-centric, and the proof direction is scoped tightly enough to ship without scope creep.

Confidence score: **88/100**.

The gap to 95+ comes from two unresolved questions that can only be answered by implementation experience, not by boundary documents:

1. Whether adapter path conventions are stable enough to follow by string convention alone, or whether they will drift and require a shared constants package.
2. Whether the caller-driven loop pattern for list-shaped output is ergonomic enough, or whether a `materializeMany()` helper will be needed quickly.

Neither blocks implementation. Both are addressable post-proof.

## Assessment

### 1. Does the bridge keep consumers file-centric?

**Yes. This is the strongest aspect of the design.**

The bridge contract is: relayfile-cli writes files to local paths. Core relayfile syncs those paths if they're in a mount. Agents read files. At no point does a consumer interact with `execute()`, `materialize()`, or any CLI concept.

The proof direction reinforces this by testing file readability with `readFile` — the same operation an agent would perform. The test does not assert anything about CLI execution; it asserts about file existence and content. This is the right testing posture for a bridge proof.

NightCTO and other consumers will interact with the VFS. They will `cat` files, `ls` directories, and `echo` content into writeback paths. The bridge is invisible to them by design. This is correct.

### 2. Are the ownership boundaries between repos clear?

**Yes. The five-way ownership table is unambiguous.**

| Layer | Bridge Role |
|-------|------------|
| relayfile-cli | Produces files. Owns execution, capture, path resolution, formatting, writing. |
| core relayfile | Consumes files. Owns VFS sync, mount, watch. |
| adapters | Define path conventions. Do not run. Do not import. Followed by string convention. |
| providers | Handle CLI auth. Not involved in materialization or bridging. |
| caller | Composes `execute()` + `materialize()`. Provides `MaterializeRule` with adapter-compatible paths. |

The critical insight is that adapters participate in the bridge as a naming standard, not as a code dependency. The path `github/repos/{owner}/{repo}/issues/{n}.json` is a convention that both the GitHub adapter and a `MaterializeRule.path` function can follow independently. This is the right level of coupling: zero code coupling, shared convention.

### 3. Does the bridge collapse any boundaries?

**No. The boundary document explicitly lists six anti-patterns and avoids all of them.**

The anti-patterns are:

- Importing core relayfile to register files → avoided, filesystem is the integration point
- Calling relayfile's API to PUT files → avoided, uses `node:fs`
- Running a watcher/daemon → avoided, one-shot execution
- Encoding adapter path conventions in types → avoided, path logic is in caller's `MaterializeRule`
- Handling writeback → avoided, that's adapters + providers
- Managing OAuth → avoided, that's providers

Each anti-pattern has a clear explanation of why it's wrong. This is good documentation practice — it tells future contributors what not to do, not just what to do.

### 4. Is the proof direction appropriately scoped?

**Yes, with one note about sequencing.**

The proof depends on the materialization proof being complete. This is correct — the bridge proof composes `execute()` + `materialize()`, and both must exist. The document states this prerequisite explicitly.

The scope is tight:

- Three test cases (single item, list, dry-run) — enough to prove the pattern, not so many that implementation stalls.
- One provider convention (GitHub) — enough to demonstrate convention-following, not so many that the proof becomes a provider catalog.
- One documentation deliverable (adapter-path-conventions table) — establishes the convention reference without over-formalizing.

The out-of-scope list is appropriate. Notably, it defers:

- Actual relayfile mount verification (requires core relayfile running)
- Writeback testing (separate concern, separate proof)
- Provider rule presets (future ergonomic improvement)
- Schema validation (content equivalence is a harder claim than path equivalence)

These deferrals are honest. The bridge proof proves path alignment and file readability, not semantic equivalence between CLI-derived and webhook-derived content. That's a reasonable first claim.

### 5. Does the adapter path convention approach hold up?

**Probably yes, with a caveat about drift.**

The design assumes adapter path conventions are stable enough to follow by string construction. This works when:

- Adapter paths are documented and versioned
- Adapter paths are simple (hierarchical, predictable)
- The number of conventions is small

It may struggle when:

- Adapter paths change without notice (no shared constants to update)
- Adapter paths encode complex logic (conditional segments, query parameters)
- Many providers need convention tables (maintenance burden)

For the first proof (GitHub only, simple paths), this is fine. If relayfile-cli grows to support 10+ providers, a shared `@relayfile/path-conventions` package might become necessary. But that is a future concern, not a blocking one.

**Recommendation:** Track convention drift as a risk. If the adapter-path-conventions table grows beyond 20 entries or if a convention change causes a bridge test to fail, revisit whether a shared constants package is warranted.

### 6. Is the multi-file composition pattern sufficient?

**Yes, for now.**

The proof uses a caller-driven loop for list-shaped output:

```typescript
for (const item of items) {
  await materialize({ result: { ...result, artifact: item }, rule, basePath });
}
```

This is explicit, readable, and avoids adding a `materializeMany()` API before the need is proven. The materialization boundary review verdict flagged this same principle: don't add convenience wrappers until the primitive is proven.

If the loop pattern becomes a common caller burden, a thin wrapper can be added later. The bridge boundary does not preclude this.

### 7. What risks remain?

**Low risk: convention divergence.**

If the GitHub adapter changes its path structure (e.g., `issues/{n}.json` → `issues/{n}/metadata.json`), relayfile-cli callers writing inline `MaterializeRule.path` functions won't know. Mitigation: the adapter-path-conventions doc serves as a single source of truth. Keep it updated.

**Low risk: mount timing.**

The bridge assumes core relayfile's file watcher picks up materialized files "soon enough." In practice, FUSE mounts see writes immediately; polling sync has a configurable interval. This is a core relayfile concern, not a bridge concern, but it's worth noting that the bridge's end-to-end latency includes sync delay.

**Minimal risk: content shape mismatch.**

A webhook-derived GitHub issue and a CLI-derived GitHub issue may have different JSON shapes (different fields, different nesting). The bridge proof does not claim content equivalence — only path equivalence. This is honest. Content normalization, if needed, belongs in a future layer (possibly adapter-defined schemas that both webhook and CLI paths conform to).

### 8. Is this the right next proof after materialization?

**Yes.**

The proof sequence is:

1. `execute()` — done. Proves CLI execution and artifact capture.
2. `materialize()` — pending. Proves artifact-to-file writing.
3. **Bridge** — this proof. Proves CLI-to-VFS path alignment.
4. Provider rule presets — future. Proves ergonomic reuse of bridge patterns.

Each proof builds on the previous without skipping steps. The bridge proof is the first to test composition across both primitives, which is exactly what should come third.

## Slice Assessment

**Is this mergeable?** Yes. The bridge proof adds one test file and one reference doc. It does not modify existing code. It does not add new source files to `src/`. It composes existing primitives.

**Is this honest?** Yes. The bridge proof claims path alignment and file readability. It does not claim semantic equivalence, sync verification, or writeback correctness. The deferred items are clearly listed. The risks are acknowledged.

**Does this set up the next proof?** Yes. After the bridge proof, the natural next step is provider rule presets — reusable `MaterializeRule` factories that encode adapter conventions so callers don't have to write path functions from scratch. The bridge proof establishes that convention-following works; the provider presets proof would make it ergonomic.

## Final Judgment

The bridge boundary is clean, minimal, and correct. The filesystem-as-integration-point design is the right architecture for this stage of the ecosystem. The proof direction is well-scoped and sequenced. The ownership table is unambiguous.

**Recommendation: proceed to implementation once the materialization proof lands.**

RELAYFILE_CLI_BRIDGE_BOUNDARY_REVIEW_COMPLETE
