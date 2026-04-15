# relayfile-cli Repo Boundary

## The Split: Why This Is a Separate Repo

The relayfile ecosystem already has a clear separation-of-concerns pattern:

| Repo | Concern | Changes when... |
|------|---------|-----------------|
| **relayfile** (core) | VFS abstraction, server runtime, mount/sync/writeback, APIs | ...the filesystem model, API spec, or runtime behavior changes |
| **relayfile-adapters** | Path mapping, webhook normalization, writeback rules per service | ...a service adds new object types or webhook formats |
| **relayfile-providers** | OAuth, API proxying, credential management per auth platform | ...an auth platform changes its token flow or adds capabilities |
| **relayfile-cli** _(this repo)_ | CLI execution, artifact capture, E2E proof of CLI-backed flows | ...a provider CLI changes its interface or a new CLI integration is needed |

`relayfile-cli` introduces a fourth concern that doesn't fit in the other three: **direct invocation of external CLI tools and structured capture of their output**. The existing repos operate entirely through HTTP — webhooks in, API calls out. `relayfile-cli` operates through shell execution — spawning `gh`, `aws`, `gcloud`, `linear`, etc., and capturing stdout/stderr/exit codes as structured artifacts.

## Where relayfile-cli Fits in the Ecosystem

```
                   ┌─────────────────────────────────┐
                   │       core relayfile (VFS)       │
                   │  specs · runtime · mount · APIs  │
                   └──────────┬──────────────────┬────┘
                              │                  │
               consumes specs │                  │ consumes specs
                              ▼                  ▼
           ┌──────────────────────┐   ┌──────────────────────┐
           │  relayfile-adapters  │   │  relayfile-providers  │
           │  path map · webhook  │──▶│  OAuth · proxy · creds│
           │  normalization · wb  │   │  per auth platform    │
           └──────────────────────┘   └──────────────────────┘
                                               │
                                               │ provider CLIs expose
                                               │ same services differently
                                               ▼
                              ┌──────────────────────────┐
                              │     relayfile-cli         │
                              │  CLI exec · artifact      │
                              │  capture · E2E proofs     │
                              └──────────────────────────┘
```

The key relationship: **relayfile-providers** handle auth for HTTP-based API access. **relayfile-cli** handles execution of the same providers' CLI tools (e.g., `gh` for GitHub, `linear` for Linear). These are complementary, not overlapping — providers deal in OAuth tokens and API proxying; relayfile-cli deals in shell commands and stdout parsing.

relayfile-cli does NOT replace adapters or providers. It adds a parallel execution path for cases where CLI invocation is more practical, more reliable, or the only option (e.g., `gh` commands that have no clean REST equivalent, or CLI-only tools).

## What Belongs Here vs. Elsewhere

| Concern | relayfile-cli | core relayfile | adapters | providers |
|---------|:---:|:---:|:---:|:---:|
| Execute external CLI commands | ✓ | | | |
| Capture stdout/stderr/exit code as structured artifact | ✓ | | | |
| Verify CLI dependencies are installed and usable | ✓ | | | |
| Parse CLI JSON output into typed artifacts | ✓ | | | |
| E2E proof workflows for CLI-driven integrations | ✓ | | | |
| VFS path mapping and filesystem abstraction | | ✓ | | |
| Server runtime, mount, sync | | ✓ | | |
| API specs and SDK contracts | | ✓ | | |
| Webhook normalization per service | | | ✓ | |
| Writeback rules per service | | | ✓ | |
| OAuth token management | | | | ✓ |
| API proxying with auth injection | | | | ✓ |
| Connection health checks | | | | ✓ |

## Boundary Rules

1. **relayfile-cli never defines the relayfile spec.** It may consume types/contracts from core relayfile. The dependency is one-directional.
2. **relayfile-cli never runs a server.** It is a CLI tool: execute, capture, return.
3. **Core relayfile never shells out to provider CLIs.** If a workflow needs `gh` or `aws`, that logic belongs here.
4. **relayfile-cli does not duplicate adapter or provider logic.** It doesn't do webhook normalization (adapters do that) or OAuth management (providers do that). It runs CLI commands.
5. **Adapters and providers do not depend on relayfile-cli.** The dependency arrow only points from relayfile-cli toward core relayfile (for shared types), never toward adapters or providers.

## Dependency Graph

```
core relayfile ──exports types/contracts──▶ relayfile-cli (optional, when shared types exist)

relayfile-cli  ──never imports from──▶ relayfile-adapters
relayfile-cli  ──never imports from──▶ relayfile-providers
relayfile-adapters ──never imports from──▶ relayfile-cli
relayfile-providers ──never imports from──▶ relayfile-cli
```

relayfile-cli is a leaf node in the dependency graph. It may consume shared types from core relayfile but has no coupling to adapters or providers. This is intentional: CLI execution is an orthogonal concern.

## What This Repo Is Not

- **Not a replacement for the core relayfile server.** The VFS, mount, and runtime stay in core.
- **Not a general-purpose CLI framework.** Only CLI integrations relevant to relayfile workflows.
- **Not a monorepo re-merge.** The four-repo split exists because these concerns change independently.
- **Not a provider or adapter.** It doesn't handle OAuth or webhook normalization. It runs commands and captures output.

## Risk Assessment

**Risk of premature split:** Low. The repo has its own `package.json`, the first proof target has zero imports from any other relayfile repo, and the cost of merging back is a copy and a package.json merge. The cost of not splitting — tangling shell execution concerns into the VFS server — is higher and harder to undo.

**Risk of scope creep:** Medium. The clearest risk is relayfile-cli gradually absorbing adapter-like or provider-like logic. The boundary rules above exist to prevent this. If relayfile-cli starts doing webhook normalization or OAuth token management, the boundary has leaked.
