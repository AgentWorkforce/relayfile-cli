import { describe, expect, it } from 'vitest';

import { execute } from '../src/execute.js';

describe('execute', () => {
  it('runs a basic command and captures stdout', async () => {
    const result = await execute({ command: 'echo', args: ['hello'] });

    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('hello\n');
    expect(result.stderr).toBe('');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.artifact).toBeNull();
    expect(new Date(result.capturedAt).toISOString()).toBe(result.capturedAt);
  });

  it('parses JSON stdout into artifact', async () => {
    const result = await execute({
      command: 'echo',
      args: ['{"name":"test","value":42}']
    });

    expect(result.ok).toBe(true);
    expect(result.stdout).toContain('{"name":"test","value":42}');
    expect(result.artifact).toEqual({ name: 'test', value: 42 });
  });

  it('returns a structured result for non-zero exit codes', async () => {
    const result = await execute({ command: 'sh', args: ['-c', 'exit 1'] });

    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
  });

  it('returns a structured result when the command is missing', async () => {
    const result = await execute({ command: 'nonexistent-command-xyz-9999' });

    expect(result.ok).toBe(false);
    expect(result.exitCode).toBeNull();
    expect(result.stderr.length).toBeGreaterThan(0);
  });

  it('kills long-running processes when timeout is reached', async () => {
    const result = await execute({
      command: 'sleep',
      args: ['60'],
      timeout: 500
    });

    expect(result.ok).toBe(false);
    expect(result.exitCode).toBeNull();
    expect(result.durationMs).toBeGreaterThanOrEqual(400);
    expect(result.durationMs).toBeLessThan(5_000);
  });

  it('captures stderr independently from stdout', async () => {
    const result = await execute({
      command: 'sh',
      args: ['-c', 'echo err >&2']
    });

    expect(result.ok).toBe(true);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('err\n');
  });

  it('merges custom environment variables with process.env', async () => {
    const result = await execute({
      command: 'sh',
      args: ['-c', 'echo $TEST_VAR'],
      env: { TEST_VAR: 'hello_env' }
    });

    expect(result.ok).toBe(true);
    expect(result.stdout).toBe('hello_env\n');
  });

  it('returns null artifact for invalid JSON', async () => {
    const result = await execute({
      command: 'echo',
      args: ['{invalid json}']
    });

    expect(result.ok).toBe(true);
    expect(result.stdout).toContain('{invalid json}');
    expect(result.artifact).toBeNull();
  });
});
