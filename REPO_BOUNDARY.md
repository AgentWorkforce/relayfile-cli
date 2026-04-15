# relayfile-cli repo boundary

## Why this exists

`relayfile-cli` should likely become its own repo because its center of gravity is different from the core `relayfile` server/API/runtime repo.

Core `relayfile` is about:
- filesystem abstraction
- server/runtime
- APIs/specs
- writeback/mount/sync behavior

`relayfile-cli` is about:
- CLI-backed execution and retrieval
- external command integration
- artifact capture
- provider CLI invocation
- E2E validation of CLI-backed flows

## Likely responsibilities

- command execution wrappers
- CLI dependency verification/bootstrap guidance
- artifact capture and structured output handling
- reusable contracts for CLI-backed retrieval/execution flows
- proof workflows for external CLI-driven integrations

## Non-goals

- replacing the core relayfile server
- owning relayfile mount/runtime APIs
- collapsing all relayfile concerns into one repo again
