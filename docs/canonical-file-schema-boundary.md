# Canonical File Schema Boundary

## What This Document Defines

Where canonical relayfile file schemas live, how they relate to CLI-derived artifacts, and how relayfile-cli targets those schemas without absorbing adapter logic. It distinguishes three distinct schema layers and assigns ownership to each.

## The Three Schema Layers

There are three distinct shapes of data in the relayfile ecosystem. They look similar — often identical — but they serve different purposes, change for different reasons, and belong to different repos.

### Layer 1: Raw CLI Schema

**What it is.** The shape of data that a CLI tool produces on stdout. This is whatever `gh issue view --json title,body,state` returns, whatever `linear issue list --format json` outputs, whatever `aws s3api list-buckets` emits.

**Who defines it.** The external CLI tool vendor (GitHub, Linear, AWS, etc.). relayfile has zero control over this shape.

**Where it lives.** Nowhere in the relayfile ecosystem. It is an external contract. relayfile-cli encounters it as `ExecuteResult.stdout` and attempts to parse it into `ExecuteResult.artifact` via `JSON.parse()`. If it parses, great. If not, `artifact` is `null` and `stdout` is the raw string.

**Stability.** Unstable. CLI vendors change output schemas across versions. Fields are added, renamed, deprecated. A `gh` upgrade can change the shape of `--json` output without warning.

```typescript
// Layer 1: raw CLI output — relayfile does not define this
const result = await execute({
  command: 'gh',
  args: ['issue', 'view', '42', '--json', 'title,body,state,number'],
});
// result.artifact is whatever gh returned — vendor-defined shape
```

### Layer 2: Canonical Relayfile File Schema

**What it is.** The shape of data that a file at a relayfile VFS path is expected to contain. When an agent reads `/github/repos/acme/api/issues/42.json`, the schema of that file is the canonical schema. When the GitHub adapter writes that file from a webhook payload, it conforms to this schema. When relayfile-cli writes that file from CLI output, it must also conform to this schema.

**Who defines it.** Core relayfile. These are the file contracts that agents depend on. If two different data sources (webhook vs. CLI) produce files at the same VFS path, those files must have the same shape. The canonical schema is what makes that guarantee possible.

**Where it lives.** In the core relayfile repo, as part of the VFS specification. Not in relayfile-cli. Not in relayfile-adapters (adapters conform to these schemas; they do not define them). The schemas are documentation-and-type-level contracts, potentially expressed as TypeScript interfaces, JSON Schema, or both.

**Stability.** Stable, versioned. Changes to canonical schemas are breaking changes to all consumers (agents, adapters, CLI callers). They should change rarely and deliberately.

```typescript
// Layer 2: canonical relayfile file schema — defined in core relayfile
// This is what a file at /github/repos/{owner}/{repo}/issues/{n}.json must contain
interface GitHubIssueFile {
  number: number;
  title: string;
  state: 'open' | 'closed';
  body: string | null;
  labels: string[];
  assignees: string[];
  created_at: string;
  updated_at: string;
}
```

### Layer 3: Downstream Consumer Schema

**What it is.** The shape of data that a specific agent or consumer expects after further processing. NightCTO might want issues with a `priority` field derived from labels. A reporting agent might want a flattened summary format. These are transformations on top of the canonical file schema.

**Who defines it.** The consuming agent or orchestrator. This is outside the relayfile ecosystem entirely — it is application logic.

**Where it lives.** In the consumer's codebase. Not in relayfile, not in adapters, not in relayfile-cli.

**Stability.** Up to the consumer. Changes here affect only the consumer.

```typescript
// Layer 3: downstream consumer schema — defined by the consuming agent
interface NightCTOIssueView {
  id: number;
  title: string;
  isOpen: boolean;
  priority: 'critical' | 'high' | 'medium' | 'low';  // derived from labels
  summary: string;  // truncated body
}
```

## The Schema Flow

```
CLI vendor defines     core relayfile defines     consumer defines
raw output shape       canonical file schema      downstream shape
      │                        │                        │
      ▼                        ▼                        ▼
┌──────────┐            ┌──────────┐            ┌──────────────┐
│  Layer 1 │            │  Layer 2 │            │   Layer 3    │
│  Raw CLI │ ──adapt──▶ │ Canonical│ ──read──▶  │  Consumer    │
│  Schema  │            │  File    │            │  Schema      │
└──────────┘            │  Schema  │            └──────────────┘
                        └──────────┘
                             ▲
                             │
                    webhook payloads also
                    conform to this same schema
                    (via adapters)
```

The canonical file schema (Layer 2) is the contract surface. Everything upstream adapts to it; everything downstream reads from it.

## Ownership Table

| Concern | Owner | Notes |
|---------|-------|-------|
| Define canonical file schemas | core relayfile | VFS path contracts — what a file at a given path must contain |
| Conform webhook payloads to canonical schemas | relayfile-adapters | Adapters transform webhooks into canonical shape |
| Conform CLI output to canonical schemas | caller of relayfile-cli | The caller writes the `MaterializeRule` that maps raw CLI output to canonical shape |
| Define raw CLI output shapes | external CLI vendors | `gh`, `linear`, `aws`, etc. — relayfile has no control |
| Define downstream consumer schemas | consuming agents | NightCTO, orchestrators, etc. — outside relayfile |
| Provide the `materialize()` mechanism | relayfile-cli | Generic: path + format + write. Schema-unaware. |
| Publish canonical schemas as importable types/specs | core relayfile | So adapters and CLI callers can reference them |
| Validate that a file conforms to canonical schema | optional, future | Could live in core relayfile as a utility |

## How relayfile-cli Targets Canonical Schemas Without Absorbing Adapter Logic

This is the critical boundary question. relayfile-cli must produce files that conform to canonical relayfile file schemas, but it must not become an adapter.

### The Mechanism: Caller-Driven Conformance

`materialize()` is schema-unaware. It takes an `ExecuteResult` and a `MaterializeRule` and writes a file. The `MaterializeRule.format` field controls serialization, and the caller can use a custom `FormatFn` to reshape the artifact before writing.

The conformance step — mapping raw CLI output (Layer 1) to canonical file schema (Layer 2) — happens in the caller's code, not in `materialize()` or anywhere in relayfile-cli's `src/`.

```typescript
// The caller knows both the CLI output shape and the canonical schema.
// The caller bridges them. relayfile-cli provides the mechanism.

const result = await execute({
  command: 'gh',
  args: ['issue', 'view', '42', '--json', 'title,body,state,number,labels,assignees,createdAt,updatedAt'],
});

await materialize({
  result,
  rule: {
    path: (r) => `github/repos/acme/api/issues/${r.artifact.number}.json`,
    format: (r) => {
      // Caller maps raw CLI schema → canonical file schema
      const raw = r.artifact;
      const canonical = {
        number: raw.number,
        title: raw.title,
        state: raw.state.toLowerCase(),
        body: raw.body || null,
        labels: raw.labels.map((l: any) => l.name),
        assignees: raw.assignees.map((a: any) => a.login),
        created_at: raw.createdAt,
        updated_at: raw.updatedAt,
      };
      return JSON.stringify(canonical, null, 2);
    },
    condition: 'on-artifact',
  },
  basePath: '/relayfile/mount',
});
```

### Why This Is Not Adapter Logic

Adapters do three things: path mapping, webhook normalization, and writeback. The caller above does none of those:

1. **Not path mapping.** The caller uses the adapter path convention by string construction. It does not import `GitHubAdapter.computePath()`. The convention is a documented standard, not a code dependency.

2. **Not webhook normalization.** The caller is not processing a webhook payload. It is processing CLI stdout. The input shape (Layer 1) is different from what an adapter receives.

3. **Not writeback.** The caller writes a file. It does not post anything back to an API.

What the caller does is **schema conformance**: mapping one data shape to another. This is a transformation function, not adapter logic. It has the same status as any data mapping code in any application.

### Where Conformance Logic Can Live

For the first proof, conformance logic lives inline in the `MaterializeRule.format` function. As the ecosystem matures, there are several options — all outside relayfile-cli:

| Option | Where | When |
|--------|-------|------|
| Inline in `MaterializeRule.format` | caller code | First proof, simple cases |
| Shared mapping functions per service | a new `@relayfile/schemas` package, or in core relayfile | When multiple callers need the same CLI→canonical mapping |
| Schema-driven validation + coercion | core relayfile utility | When canonical schemas are published as JSON Schema |

In all cases, relayfile-cli's `materialize()` function stays schema-unaware. The conformance is always caller-side.

## What Canonical Schemas Are Not

**Canonical schemas are not CLI output schemas.** `gh issue view --json` returns fields in camelCase; the canonical schema may use snake_case. `gh` returns labels as objects with `name`, `id`, `color`; the canonical schema may flatten to string arrays. The mapping is non-trivial and vendor-specific.

**Canonical schemas are not webhook payloads.** GitHub webhook payloads have a different structure than `gh` CLI output and a different structure than the canonical file schema. Adapters transform webhooks → canonical. CLI callers transform CLI output → canonical. Both target the same canonical shape.

**Canonical schemas are not adapter types.** Adapters may define internal types for their processing pipeline, but those are implementation details. The canonical schema is the output contract — what ends up in the file.

## Boundary Rules

1. **Canonical file schemas are defined in core relayfile.** They are the VFS path contracts. relayfile-cli, relayfile-adapters, and relayfile-providers all conform to them but do not define them.

2. **relayfile-cli is schema-unaware.** `materialize()` does not import, reference, or validate against canonical schemas. It writes whatever the `MaterializeRule` produces.

3. **Schema conformance is the caller's responsibility.** The caller of `materialize()` maps raw CLI output to canonical shape via `FormatFn`. This is data transformation, not adapter logic.

4. **Adapters and CLI callers target the same canonical schema independently.** They do not coordinate at the code level. They follow the same documented specification.

5. **Schema validation is optional and deferred.** A future utility in core relayfile could validate that a file conforms to its canonical schema. This is not relayfile-cli's concern.

6. **Raw CLI schemas are external and unstable.** relayfile-cli does not attempt to stabilize, version, or document raw CLI output shapes. If `gh` changes its `--json` output, the caller's `FormatFn` must adapt.

## Boundary Diagram

```
                     External CLI vendors
                     (gh, linear, aws, ...)
                            │
                     raw output (Layer 1)
                            │
                            ▼
              ┌─────────────────────────┐
              │      relayfile-cli      │
              │                         │
              │  execute() → artifact   │
              │  materialize() → file   │
              │                         │
              │  (schema-unaware)       │
              └────────────┬────────────┘
                           │
                    caller provides
                    FormatFn that maps
                    Layer 1 → Layer 2
                           │
                           ▼
              ┌─────────────────────────┐
              │     local file          │
              │  (conforms to Layer 2   │
              │   canonical schema)     │
              └────────────┬────────────┘
                           │
              ┌─────────────────────────┐
              │    core relayfile VFS   │
              │                         │
              │  canonical file schemas │◀── also populated by
              │  defined here           │    adapters (from webhooks)
              │                         │
              └────────────┬────────────┘
                           │
                           ▼
              ┌─────────────────────────┐
              │  agents / consumers     │
              │                         │
              │  read canonical files   │
              │  (Layer 2)              │
              │                         │
              │  optionally transform   │
              │  to Layer 3             │
              └─────────────────────────┘
```

## Risk Assessment

**Risk: canonical schemas don't exist yet in core relayfile.**
Current state: core relayfile does not publish formal canonical file schemas. Adapters implicitly define them through their output. This is acceptable for the first proof — relayfile-cli callers can follow the adapter's de facto output shape as the canonical standard. The formal schema publication is a core relayfile concern, not blocked by relayfile-cli.

**Risk: relayfile-cli absorbs conformance logic into its core.**
Mitigation: the boundary rule is clear — `materialize()` is schema-unaware. If conformance helper functions appear in `src/`, the boundary has leaked. Conformance functions for specific CLIs may exist as examples or utilities, but they must not be required by `materialize()`.

**Risk: canonical schemas diverge between adapter and CLI paths.**
Mitigation: both adapters and CLI callers should target the same documented canonical schema. When formal schemas are published in core relayfile, both can validate against them. Until then, adapter output is the de facto standard that CLI callers should match.

**Risk: consumers couple to raw CLI shapes instead of canonical.**
Mitigation: `materialize()` with a `FormatFn` is the conformance mechanism. If a caller skips the `FormatFn` and writes raw CLI output (using `format: 'raw'`), the file will not match canonical shape. This is the caller's choice and the caller's problem — relayfile-cli does not enforce it.
