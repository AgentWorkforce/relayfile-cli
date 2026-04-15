# Repo Boundary Review Verdict

## Summary

The relayfile-cli repo split is justified. The boundary is clear against all four ecosystem repos (core, adapters, providers, cli). The first proof target — execute + artifact capture — is the right starting point.

## Boundary Assessment

### Is the split warranted?

**Yes.** The relayfile ecosystem already follows a separation-of-concerns pattern: core owns the VFS, adapters own webhook/path mapping, providers own auth/proxy. relayfile-cli introduces a genuinely new concern — shell execution and structured output capture — that doesn't belong in any of the existing three repos.

The dependency graphs are different (child_process vs. HTTP clients), the test strategies are different (spawn real CLIs vs. mock API responses), and the release cadences are independent (a new `gh` CLI flag doesn't affect the VFS spec).

### Is the boundary clear?

**Yes.** The ownership table in `repo-boundary.md` draws unambiguous lines across all four repos. The critical distinctions:

- **vs. core relayfile:** Core never shells out. relayfile-cli never runs a server or defines VFS paths.
- **vs. relayfile-adapters:** Adapters normalize webhooks and compute VFS paths. relayfile-cli doesn't touch webhooks or VFS path mapping.
- **vs. relayfile-providers:** Providers manage OAuth tokens and proxy HTTP API calls. relayfile-cli runs CLI commands. Same external services (GitHub, Linear, etc.), orthogonal execution model (shell vs. HTTP).

The one-directional dependency rule is correct: relayfile-cli may consume shared types from core relayfile, but core, adapters, and providers never import from relayfile-cli.

### Risk of premature split?

**Low.** The first proof has zero imports from any other relayfile repo. The repo already has its own `package.json`. If the split turns out wrong, the merge-back cost is trivial (`cp -r` + package.json merge). The cost of not splitting — tangling `child_process.spawn` logic into the VFS server or the OAuth provider layer — would create coupling that's harder to undo.

### Risk of scope creep?

**Medium.** The most likely failure mode is relayfile-cli gradually absorbing adapter-like behavior (webhook normalization) or provider-like behavior (OAuth management) as convenience shortcuts. The boundary rules in `repo-boundary.md` exist to prevent this. These rules should be enforced at PR review time.

## First Proof Assessment

### Is the target bounded?

**Yes.** "Execute a CLI command and capture structured output" is a single function with a clear type signature, five testable success criteria, and an explicit out-of-scope list. The scope excludes multi-provider adapters, retry logic, streaming, and any integration with the wider relayfile ecosystem.

### Is it the right first target?

**Yes.** Every future capability depends on this primitive:
- Provider CLI wrappers need execute + capture
- Dependency verification needs execute (to check `gh --version`)
- E2E proof chains need execute (to run multi-step CLI flows)
- Artifact persistence needs capture (to have something to persist)

Building anything else first would require inventing this inline.

### Is the success criteria honest?

**Yes.** Five concrete, verifiable criteria:
1. It runs (echo test)
2. It captures (stdout/stderr/exit code/timing all present)
3. It fails cleanly (missing command → structured error, not exception)
4. It parses when possible (JSON stdout → artifact field)
5. It stays in its lane (zero cross-repo imports)

No hand-waving. No "and then we'll figure out the architecture." The proof either passes all five or it doesn't.

### Does the proof validate the ecosystem position?

**Yes.** The `gh repo view --json` example deliberately targets the same service (GitHub) that relayfile-adapters and relayfile-providers already handle — via webhooks and OAuth respectively. If the proof works, it demonstrates that CLI execution is a complementary path, not a redundant one.

## Open Questions (non-blocking)

These are explicitly deferred and should not block the first proof:

1. **Contract format for core relayfile integration.** How will core relayfile trigger CLI executions? Event-driven? Config-driven? This is a second-proof question — the execute primitive must exist first.

2. **Artifact persistence.** The first proof captures artifacts in memory (returned from the function). Where they go afterward (filesystem, VFS, database) is a follow-up decision.

3. **Provider CLI adapter pattern.** The first proof uses `gh` as a bare example. The abstraction pattern for wrapping multiple provider CLIs should emerge from the second and third integrations, not be designed upfront.

4. **CLI auth bridging.** Some CLIs (like `gh`) have their own auth (`gh auth login`). How this relates to relayfile-providers' OAuth management is an open design question for later.

## Verdict

**Approved to proceed.**

The boundary is sound across the full four-repo ecosystem. The first proof is well-scoped, honestly bounded, and validates both the execution primitive and the ecosystem position. Ship the `execute` function, prove it works against `echo` and `gh`, and use that foundation for everything that follows.

RELAYFILE_CLI_REPO_BOUNDARY_REVIEW_COMPLETE
