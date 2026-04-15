# relayfile-cli

`relayfile-cli` is a small TypeScript library for running external CLI commands, capturing stdout/stderr/exit codes, and promoting JSON stdout into a structured artifact. It is intended as the CLI-execution substrate for RelayFile-adjacent workflows without pulling server, adapter, or provider concerns into the package.

## Status

This repo is now source-shareable, but it is not yet positioned as a published npm package.

- The package stays `"private": true` on purpose.
- No canonical public repository URL is configured yet, so the `repository` metadata is intentionally left unset.
- The public-facing install path today is cloning the repo and building locally.

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
