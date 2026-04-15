import { spawn } from 'node:child_process';

import type { ExecuteOptions, ExecuteResult } from './types.js';

const DEFAULT_TIMEOUT_MS = 30_000;
const FORCE_KILL_DELAY_MS = 250;

function parseArtifact(stdout: string): unknown | null {
  const trimmed = stdout.trim();

  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function createResult(input: {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  startedAt: number;
  timedOut?: boolean;
}): ExecuteResult {
  const durationMs = Date.now() - input.startedAt;

  return {
    ok: input.exitCode === 0 && !input.timedOut,
    exitCode: input.timedOut ? null : input.exitCode,
    stdout: input.stdout,
    stderr: input.stderr,
    durationMs,
    artifact: parseArtifact(input.stdout),
    capturedAt: new Date().toISOString()
  };
}

function killProcessTree(pid: number | undefined, signal: NodeJS.Signals): void {
  if (!pid) {
    return;
  }

  try {
    if (process.platform !== 'win32') {
      process.kill(-pid, signal);
      return;
    }
  } catch {
    // Fall back to direct child kill if process-group signaling is unavailable.
  }

  try {
    process.kill(pid, signal);
  } catch {
    // Ignore kill errors because the process may have already exited.
  }
}

export async function execute(options: ExecuteOptions): Promise<ExecuteResult> {
  const startedAt = Date.now();
  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  const args = options.args ?? [];
  const cwd = options.cwd ?? process.cwd();
  const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;

  try {
    return await new Promise<ExecuteResult>((resolve) => {
      let settled = false;
      let timedOut = false;

      const child = spawn(options.command, args, {
        cwd,
        env: {
          ...process.env,
          ...options.env
        },
        stdio: 'pipe',
        detached: process.platform !== 'win32'
      });

      const settle = (result: ExecuteResult): void => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeoutId);
        clearTimeout(forceKillId);
        resolve(result);
      };

      child.stdout?.on('data', (chunk: Buffer | string) => {
        stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });

      child.stderr?.on('data', (chunk: Buffer | string) => {
        stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });

      child.on('error', (error: NodeJS.ErrnoException) => {
        settle(
          createResult({
            exitCode: null,
            stdout: Buffer.concat(stdoutChunks).toString('utf8'),
            stderr:
              Buffer.concat(stderrChunks).toString('utf8') ||
              error.message ||
              String(error),
            startedAt
          })
        );
      });

      child.on('close', (code) => {
        settle(
          createResult({
            exitCode: code,
            stdout: Buffer.concat(stdoutChunks).toString('utf8'),
            stderr: Buffer.concat(stderrChunks).toString('utf8'),
            startedAt,
            timedOut
          })
        );
      });

      const timeoutId = setTimeout(() => {
        timedOut = true;
        killProcessTree(child.pid, 'SIGTERM');
      }, timeout);

      const forceKillId = setTimeout(() => {
        if (timedOut) {
          killProcessTree(child.pid, 'SIGKILL');
        }
      }, timeout + FORCE_KILL_DELAY_MS);
    });
  } catch (error) {
    return createResult({
      exitCode: null,
      stdout: '',
      stderr: error instanceof Error ? error.message : String(error),
      startedAt
    });
  }
}
