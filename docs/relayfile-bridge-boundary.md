# relayfile-cli to relayfile Bridge Boundary

## What This Document Defines

The clean bridge from relayfile-cli artifacts to relayfile file-shaped state. It specifies how CLI-derived `ExecuteResult` artifacts, materialized into local files by `materialize()`, become first-class relayfile VFS state — without collapsing the boundary between the two repos.

## The Bridge Problem

relayfile-cli has two primitives:

- `execute()` runs a CLI command and captures structured output.
- `materialize()` (defined in the materialization boundary, not yet implemented) writes that output to a local file.

Core relayfile has a VFS that maps local files to a virtual filesystem backed by webhooks, adapters, and writebacks. Agents interact with that VFS — they `cat` files, `echo` into paths, `ls` directories. They do not call CLIs.

The bridge question is: **how does a file written by `materialize()` become state that an agent reads through relayfile's VFS?**

The answer must keep consumers (NightCTO, agents, orchestrators) file-centric. They should never need to know that a file's content originated from a CLI invocation rather than a webhook or API call.

## Design Principle: The Filesystem Is the Bridge

relayfile-cli does not integrate with core relayfile through imports, RPCs, or shared state. The integration point is the local filesystem.

```
  CLI tool ──▶ execute() ──▶ ExecuteResult ──▶ materialize() ──▶ local file
                                                                     │
                                                         ┌───────────┘
                                                         │
                                            relayfile mount path
                                                         │
                                                         ▼
                                              core relayfile VFS
                                            (watch / poll / sync)
                                                         │
                                                         ▼
                                                agent reads file
```

The bridge is a directory path. When `materialize()` writes to a path that is inside a relayfile mount, core relayfile picks up the change through its existing watch/sync mechanism. No new protocol, no new dependency, no new API.

This is the same mechanism that would apply if a human wrote a file into a mount path, or if a cron job deposited output there. relayfile-cli is just a structured producer of those files.

## Ownership Table

| Concern | Owner | Notes |
|---------|-------|-------|
| Running CLI commands | relayfile-cli | `execute()` |
| Capturing structured artifacts | relayfile-cli | `ExecuteResult.artifact` |
| Resolving output file paths | relayfile-cli | `materialize()` via `MaterializeRule.path` |
| Formatting artifact content | relayfile-cli | `materialize()` via `MaterializeRule.format` |
| Writing to local filesystem | relayfile-cli | `materialize()` via `node:fs` |
| Watching mount paths for changes | core relayfile | FUSE mount or polling sync |
| Exposing files in the VFS tree | core relayfile | File appears at its VFS path after sync |
| Path mapping conventions per service | relayfile-adapters | e.g., GitHub issues → `/github/issues/{id}.json` |
| Writeback when agent modifies a file | core relayfile + adapters | Adapter maps VFS write to API call |
| OAuth / credentials for CLI tools | relayfile-providers | `gh auth`, `aws configure`, etc. |

## How Adapter-Style Mapping Rules Participate

Adapters define path conventions: a GitHub issue lives at `/github/repos/{owner}/{repo}/issues/{number}.json`. A Slack message lives at `/slack/channels/{channel}/messages/{ts}.json`.

relayfile-cli does not enforce these conventions. But it enables them.

The caller of `materialize()` passes a `MaterializeRule` with a `path` field. That path can follow adapter conventions:

```typescript
// Caller follows the GitHub adapter path convention
const output = await materialize({
  result,
  rule: {
    path: (r) => `github/repos/${r.artifact.owner}/${r.artifact.repo}/issues/${r.artifact.number}.json`,
    format: 'json',
    condition: 'on-artifact',
  },
  basePath: '/relayfile/mount',
});
```

The key insight: **adapter path conventions are a naming standard, not a code dependency.** relayfile-cli callers can follow the same path structure that adapters use, so that CLI-derived files land in the same VFS locations that webhook-derived files would. The adapter code does not need to run. The convention is applied at the `MaterializeRule` level by the caller.

This means:

1. **Adapter conventions can be documented as path standards** that both adapters and CLI callers follow.
2. **relayfile-cli does not import adapter code.** It follows the convention by string construction.
3. **Core relayfile does not distinguish CLI-derived files from webhook-derived files.** A file at `/github/repos/acme/api/issues/42.json` is a file regardless of how it got there.
4. **Adapters do not need to know about relayfile-cli.** The dependency arrow never reverses.

### When Conventions Diverge

If a CLI produces data that doesn't map to an existing adapter path (e.g., `gh api` output that has no webhook equivalent), the caller chooses its own path. There is no requirement that every CLI-materialized file map to an adapter-known path. The VFS handles arbitrary file trees.

## What Consumers See

NightCTO and other agents see files. They do not see CLIs, executors, or materializers.

```bash
# Agent reads a file that was CLI-materialized
cat /relayfile/github/repos/acme/api/issues/42.json

# Agent does not know (and does not need to know) that this file
# was produced by: gh issue view 42 --json title,body,state
# and materialized by relayfile-cli into the mount path
```

The file is indistinguishable from one that arrived via webhook + adapter. This is the design goal: **consumers stay file-centric regardless of the data source.**

### Writeback Symmetry

When an agent writes to a relayfile VFS path, core relayfile + adapters handle the writeback to the source API. This works the same whether the file was originally populated by a webhook or by CLI materialization:

```bash
# Agent writes a review (adapter handles writeback to GitHub API)
echo '{"body":"LGTM","event":"APPROVE"}' > /relayfile/github/repos/acme/api/pulls/42/reviews/review.json
```

relayfile-cli is not involved in writebacks. The adapter and provider handle the outbound API call. CLI materialization is a one-way inbound path: CLI → file. Writeback is a separate outbound path: file → API.

## What relayfile-cli Does NOT Do in This Bridge

| Anti-pattern | Why it's wrong |
|-------------|----------------|
| Import core relayfile to register files in the VFS | Collapses the boundary. The filesystem is the integration point. |
| Call relayfile's API to PUT files | Makes relayfile-cli a client of core relayfile. It should be a filesystem peer. |
| Run a watcher/daemon to sync artifacts | relayfile-cli is one-shot: execute, materialize, exit. Core relayfile owns watching. |
| Encode adapter path conventions in its own types | Provider-specific path logic belongs to the caller, not to `materialize()`. |
| Handle writeback or outbound API calls | That is adapters + providers. relayfile-cli only produces files. |
| Manage OAuth tokens or API credentials | That is providers. relayfile-cli assumes the CLI tool is already authenticated. |

## The Boundary as a Contract

The bridge contract between relayfile-cli and core relayfile is:

1. **relayfile-cli writes files to local paths.** The path and format are determined by `MaterializeRule`.
2. **If those paths are inside a relayfile mount, core relayfile syncs them.** No coordination needed.
3. **Path conventions are a shared standard, not a shared dependency.** Both adapters and CLI callers can follow the same path structure independently.
4. **relayfile-cli has zero runtime dependency on core relayfile.** It works with or without a relayfile mount active.
5. **Core relayfile has zero awareness of relayfile-cli.** A file is a file. The VFS does not distinguish origins.

## Boundary Diagram

```
                     relayfile-cli boundary
                     ───────────────────────
                     │                     │
  CLI tool ─────────▶│  execute()          │
                     │       │             │
                     │       ▼             │
                     │  ExecuteResult      │
                     │       │             │
                     │       ▼             │
                     │  materialize()      │
                     │       │             │
                     ─────── │ ─────────────
                             │
                        local file write
                             │
                     ─────── │ ─────────────
                     │       ▼             │
                     │  mount path         │
                     │  (if applicable)    │
                     │       │             │
                     │       ▼             │
                     │  VFS sync           │
                     │       │             │
                     │       ▼             │
                     │  agent reads file   │
                     │                     │
                     ───────────────────────
                     core relayfile boundary
```

The two boundaries touch at a single point: a file on disk. This is the bridge.
