# relayfile-cli

`relayfile-cli` is the CLI-execution substrate for the RelayFile ecosystem.

Where core `relayfile` turns APIs into files, `relayfile-cli` turns external CLI tools into structured artifacts that can later be mapped into files or other RelayFile-adjacent outputs.

That makes it useful for workflows where the best retrieval or execution surface is a real vendor/tool CLI rather than direct HTTP calls. Instead of scattering shell scripts everywhere, `relayfile-cli` provides a bounded, testable way to:
- run external CLI commands
- capture stdout, stderr, exit codes, and timing
- promote JSON stdout into structured artifacts
- form the basis for later file-materialization flows

## How it fits in the RelayFile ecosystem

- **core `relayfile`** owns the filesystem abstraction, server/runtime, mount/sync, and API contracts
- **`relayfile-adapters`** own webhook normalization, path mapping, and writeback rules
- **`relayfile-providers`** own OAuth, token handling, and API proxy concerns
- **`relayfile-cli`** owns external CLI execution and structured artifact capture

A useful mental model is:
- `relayfile` makes external systems look like files
- `relayfile-cli` makes external CLIs produce clean artifacts that can later become files

That second part matters because many integrations are easiest to access through an existing CLI. In the same way `relayfile-adapters` can pull normalized data through provider-backed flows and sync it down into files, `relayfile-cli` can become the clean execution layer for CLI-backed retrieval whose output is then mapped or materialized in a file-oriented way.

## Install

### From a local checkout

```bash
npm install
npm run build
```

### Requirements

- Node.js `>=18`
- npm `>=9`

## Usage

```ts
import { execute } from './dist/index.js';

const result = await execute({
  command: 'node',
  args: ['-e', 'console.log(JSON.stringify({ ok: true, source: "cli" }))'],
  timeout: 5_000
});

console.log(result.ok);
console.log(result.exitCode);
console.log(result.stdout);
console.log(result.artifact);
```

Example result shape:

```ts
{
  ok: true,
  exitCode: 0,
  stdout: '{"ok":true,"source":"cli"}\n',
  stderr: '',
  durationMs: 12,
  artifact: { ok: true, source: 'cli' },
  capturedAt: '2026-04-15T12:00:00.000Z'
}
```

## API

### `execute(options: ExecuteOptions): Promise<ExecuteResult>`

Runs a command with optional args, cwd, timeout, and environment overrides. The child process is spawned with piped stdout/stderr, and stdout is parsed as JSON when possible.

### `ExecuteOptions`

- `command: string`
- `args?: string[]`
- `cwd?: string`
- `timeout?: number`
- `env?: Record<string, string>`

### `ExecuteResult`

- `ok: boolean`
- `exitCode: number | null`
- `stdout: string`
- `stderr: string`
- `durationMs: number`
- `artifact: unknown | null`
- `capturedAt: string`

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
```

## License

[MIT](./LICENSE)
