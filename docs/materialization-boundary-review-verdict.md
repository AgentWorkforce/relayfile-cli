# Materialization Boundary Review Verdict

## Verdict

**Status: Ready for implementation.**

The boundary definition and proof direction are sound. The abstraction is correctly centered on generic artifact-to-file materialization rather than any specific provider. The ownership lines between relayfile-cli, core relayfile, adapters, and providers are clear and consistent with the existing repo boundary.

My confidence score is **90/100**.

The main reason it does not reach 95+ is that two design decisions are reasonable but unproven — they look right on paper and will need the implementation proof to confirm:

1. The choice to separate `execute()` and `materialize()` as independently called functions rather than a pipeline API.
2. The `ConflictStrategy` surface area, particularly `'timestamp'` and `'append'`, which may be over-specified for a first proof.

Neither of these is a blocking concern. Both are easy to adjust during implementation if they prove wrong.

## Assessment

### 1. Is the abstraction correctly centered?

**Yes.**

The `MaterializeRule` type is provider-agnostic. It speaks in paths, formats, conditions, and conflict strategies — not in GitHub repos, PostHog events, or Kubernetes pods. The provider examples in the boundary document are explicitly labeled as "proof, not architecture." This is the right framing.

Key evidence:

- `MaterializeRule` has no provider-specific fields. No `provider`, `service`, `integration`, or similar discriminator.
- `PathTemplate` accepts a string or a function. Provider-specific path logic lives in the function the caller passes, not in the materialization layer.
- `Format` is a union of standard serialization choices plus a custom function escape hatch. No format is provider-specific.
- `MaterializeCondition` evaluates generic properties of `ExecuteResult` (`ok`, `artifact !== null`). No provider-specific conditions.

The boundary document correctly notes that "provider-specific path conventions are the caller's responsibility." This is the right ownership line.

### 2. Are the ownership boundaries clear and consistent?

**Yes.**

The boundary document defines a clean split:

| Layer | Owns |
|-------|------|
| `execute()` | Process spawning, timeout, output capture |
| `materialize()` | Path resolution, formatting, file writing |
| Caller | Composing the two, providing provider-specific rules |
| Core relayfile | VFS sync (if output path is inside a mount) |
| Adapters | Service-specific path mapping conventions |
| Providers | CLI authentication and credentials |

This is consistent with the existing repo boundary rules:

- Rule 1 (relayfile-cli never defines the relayfile spec) — materialization writes to local paths, does not define VFS contracts.
- Rule 2 (relayfile-cli never runs a server) — materialization is a one-shot function.
- Rule 3 (core relayfile never shells out) — still holds; materialization is in relayfile-cli.
- Rule 4 (no adapter/provider duplication) — materialization does not do webhook normalization or OAuth.
- Rule 5 (adapters/providers don't depend on relayfile-cli) — materialization adds no reverse dependency.

The filesystem-as-integration-point design is elegant: relayfile-cli writes files; core relayfile watches files. No import coupling required. This is the right architecture for the current state of the ecosystem.

### 3. Is the proof direction appropriately scoped?

**Mostly yes.**

Strengths of the scope:

- All five format variants are testable with simple `echo` commands — no real CLIs needed.
- All four condition variants are testable with synthetic `ExecuteResult` objects — no process spawning needed.
- Dry-run mode provides a pure-function testing surface for path resolution and formatting.
- The integration test (execute + materialize end-to-end) proves composition works.

One concern about scope:

The proof includes all four `ConflictStrategy` variants (`overwrite`, `skip`, `append`, `timestamp`). This is a lot of surface area for a first proof. `overwrite` and `skip` are essential. `append` and `timestamp` could be deferred without weakening the proof.

**Recommendation:** Implement all four, but if implementation time becomes a constraint, `append` and `timestamp` can be deferred to a follow-up without compromising the proof's validity. The core claim — "generic artifact-to-file materialization works" — stands on `overwrite` and `skip` alone.

### 4. Does the separation between execute and materialize hold up?

**Yes, with a note.**

The boundary document mandates: "`materialize()` never calls `execute()`." This is the right call for testability and composability. It means:

- `materialize()` can be tested with synthetic `ExecuteResult` objects, no process spawning needed.
- Callers can use `execute()` without `materialize()` (capture without writing).
- Callers can use `materialize()` with hand-crafted results (writing without execution).
- The two functions can evolve independently.

The note: this separation means there is no built-in "execute and materialize" convenience function. The caller must always:

```typescript
const result = await execute({ ... });
const output = await materialize({ result, rule: { ... } });
```

This is fine for a first proof. If the two-step pattern becomes cumbersome in practice, a thin `executeAndMaterialize()` wrapper can be added later without changing either primitive. The boundary document does not preclude this, which is correct — it avoids over-specifying.

### 5. Are the success criteria sufficient?

**Yes.**

The seven success criteria in the proof direction cover:

1. Happy path (write works)
2. Format correctness (all five variants)
3. Condition correctness (all four variants)
4. Conflict handling (all four strategies)
5. Dry-run mode (pure function behavior)
6. End-to-end composition (execute + materialize)
7. Boundary compliance (no cross-repo imports)

This is a stronger set of criteria than the execute proof had. The execute proof review noted that the process-tree claim was "implemented plausibly but only tested against a single process." The materialization criteria are more directly testable because they operate on local state (files) rather than OS-level process semantics.

### 6. What are the risks?

**Low risk: over-engineering the first proof.**

The `MaterializeRule` type has enough surface area (4 format types + custom, 3 conditions + custom, 4 conflict strategies) that implementation could expand beyond what the proof needs to demonstrate. Mitigation: the proof direction explicitly defers template-string interpolation, batch materialization, and remote storage. This is the right set of deferrals.

**Low risk: path resolution edge cases.**

Path templates that resolve to absolute paths when `basePath` is also set, or paths with `..` segments, could create unexpected behavior. The proof should include at least one test for absolute path override and one for relative path resolution against `basePath`.

**Minimal risk: filesystem test isolation.**

Materialization tests write to disk. Tests must use temporary directories and clean up after themselves. This is standard test hygiene, not a design risk, but it is worth noting because the execute proof tests had zero filesystem interaction.

### 7. What should the proof after materialization be?

If the materialization proof passes, the next proof should be:

**Provider rule presets: thin, declarative rule factories for specific CLIs.**

Example:

```typescript
import { githubRules } from '@relayfile/cli/rules/github';

const output = await materialize({
  result,
  rule: githubRules.repoView({ org: 'anthropics' }),
});
```

This would:

- Prove that the generic `MaterializeRule` abstraction supports real provider patterns without modification.
- Add the first provider-specific code in a clearly separated location (`src/rules/` or similar).
- Demonstrate that adding a new provider is additive (new file, new rule factory) not invasive (no changes to `materialize.ts`).

But that is a future proof. The current priority is proving the generic mechanism works.

## Final Judgment

The materialization boundary is well-defined. The abstraction is generic, the ownership lines are clear, the proof direction is appropriately scoped, and the success criteria are sufficient.

**Recommendation: proceed to implementation.**

The only adjustment worth making is pragmatic prioritization of conflict strategies: implement `overwrite` and `skip` first, then `append` and `timestamp`, rather than treating all four as equally critical.

RELAYFILE_CLI_MATERIALIZATION_BOUNDARY_REVIEW_COMPLETE
