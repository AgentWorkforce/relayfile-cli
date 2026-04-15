import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { execute } from '../src/execute.js';
import { materialize } from '../src/materialize.js';
import type { ExecuteResult } from '../src/types.js';

function mockResult(overrides: Partial<ExecuteResult> = {}): ExecuteResult {
  return {
    ok: true,
    exitCode: 0,
    stdout: '{"k":"v"}\n',
    stderr: '',
    durationMs: 10,
    artifact: { k: 'v' },
    capturedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  };
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

describe('materialize', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'relayfile-cli-materialize-'));
    originalCwd = process.cwd();
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
    await rm(tempDir, { recursive: true, force: true });
  });

  it('writes json formatted artifact', async () => {
    const output = await materialize({
      result: mockResult(),
      rule: { path: 'artifact.json', format: 'json' },
      basePath: tempDir
    });

    expect(output.written).toBe(true);
    expect(await readFile(join(tempDir, 'artifact.json'), 'utf8')).toBe('{\n  "k": "v"\n}');
  });

  it('writes compact json formatted artifact', async () => {
    await materialize({
      result: mockResult(),
      rule: { path: 'artifact.json', format: 'json-compact' },
      basePath: tempDir
    });

    expect(await readFile(join(tempDir, 'artifact.json'), 'utf8')).toBe('{"k":"v"}');
  });

  it('writes raw stdout as-is', async () => {
    await materialize({
      result: mockResult({ stdout: 'plain text\n', artifact: null }),
      rule: { path: 'artifact.txt', format: 'raw' },
      basePath: tempDir
    });

    expect(await readFile(join(tempDir, 'artifact.txt'), 'utf8')).toBe('plain text\n');
  });

  it('writes the full execute result for envelope format', async () => {
    const result = mockResult();

    await materialize({
      result,
      rule: { path: 'artifact.json', format: 'envelope' },
      basePath: tempDir
    });

    expect(await readFile(join(tempDir, 'artifact.json'), 'utf8')).toBe(JSON.stringify(result, null, 2));
  });

  it('supports a custom format function', async () => {
    await materialize({
      result: mockResult(),
      rule: {
        path: 'artifact.txt',
        format: (result) => `stdout=${result.stdout.trim()}`
      },
      basePath: tempDir
    });

    expect(await readFile(join(tempDir, 'artifact.txt'), 'utf8')).toBe('stdout={"k":"v"}');
  });

  it('uses on-success as the default condition and skips failed results', async () => {
    const output = await materialize({
      result: mockResult({ ok: false, exitCode: 1 }),
      rule: { path: 'artifact.json', format: 'json' },
      basePath: tempDir
    });

    expect(output).toEqual({
      written: false,
      path: null,
      content: null,
      skippedReason: 'Condition on-success failed: result.ok is false'
    });
    expect(await exists(join(tempDir, 'artifact.json'))).toBe(false);
  });

  it('writes on-success when the result succeeded', async () => {
    const output = await materialize({
      result: mockResult(),
      rule: { path: 'artifact.json', format: 'json', condition: 'on-success' },
      basePath: tempDir
    });

    expect(output.written).toBe(true);
  });

  it('skips on-artifact when artifact is null', async () => {
    const output = await materialize({
      result: mockResult({ artifact: null }),
      rule: { path: 'artifact.json', format: 'json', condition: 'on-artifact' },
      basePath: tempDir
    });

    expect(output).toEqual({
      written: false,
      path: null,
      content: null,
      skippedReason: 'Condition on-artifact failed: artifact is null'
    });
  });

  it('writes on-artifact when artifact exists', async () => {
    const output = await materialize({
      result: mockResult(),
      rule: { path: 'artifact.json', format: 'json', condition: 'on-artifact' },
      basePath: tempDir
    });

    expect(output.written).toBe(true);
  });

  it('writes always even when the result failed and artifact is null', async () => {
    const output = await materialize({
      result: mockResult({ ok: false, exitCode: 1, artifact: null }),
      rule: { path: 'artifact.txt', format: 'raw', condition: 'always' },
      basePath: tempDir
    });

    expect(output.written).toBe(true);
    expect(await exists(join(tempDir, 'artifact.txt'))).toBe(true);
  });

  it('uses a custom condition function', async () => {
    const deny = await materialize({
      result: mockResult(),
      rule: {
        path: 'artifact.txt',
        format: 'raw',
        condition: () => false
      },
      basePath: tempDir
    });

    const allow = await materialize({
      result: mockResult(),
      rule: {
        path: 'allowed.txt',
        format: 'raw',
        condition: (result) => result.stdout.includes('"k"')
      },
      basePath: tempDir
    });

    expect(deny.skippedReason).toBe('Custom condition returned false');
    expect(allow.written).toBe(true);
  });

  it('overwrites existing files by default', async () => {
    const target = join(tempDir, 'artifact.txt');
    await writeFile(target, 'old');

    await materialize({
      result: mockResult({ stdout: 'new' }),
      rule: { path: 'artifact.txt', format: 'raw' },
      basePath: tempDir
    });

    expect(await readFile(target, 'utf8')).toBe('new');
  });

  it('skips existing files when conflict strategy is skip', async () => {
    const target = join(tempDir, 'artifact.txt');
    await writeFile(target, 'existing');

    const output = await materialize({
      result: mockResult({ stdout: 'new' }),
      rule: { path: 'artifact.txt', format: 'raw', conflict: 'skip' },
      basePath: tempDir
    });

    expect(output).toEqual({
      written: false,
      path: target,
      content: null,
      skippedReason: 'File exists and conflict strategy is skip'
    });
    expect(await readFile(target, 'utf8')).toBe('existing');
  });

  it('appends to existing files when conflict strategy is append', async () => {
    const target = join(tempDir, 'artifact.txt');
    await writeFile(target, 'existing\n');

    await materialize({
      result: mockResult({ stdout: 'new\n' }),
      rule: { path: 'artifact.txt', format: 'raw', conflict: 'append' },
      basePath: tempDir
    });

    expect(await readFile(target, 'utf8')).toBe('existing\nnew\n');
  });

  it('creates a timestamped file when conflict strategy is timestamp', async () => {
    const target = join(tempDir, 'artifact.json');
    await writeFile(target, 'existing');
    vi.spyOn(Date, 'now').mockReturnValue(1_713_200_000_000);

    const output = await materialize({
      result: mockResult(),
      rule: { path: 'artifact.json', format: 'json', conflict: 'timestamp' },
      basePath: tempDir
    });

    const timestampedPath = join(tempDir, 'artifact.1713200000000.json');

    expect(output.path).toBe(timestampedPath);
    expect(await readFile(target, 'utf8')).toBe('existing');
    expect(await readFile(timestampedPath, 'utf8')).toBe('{\n  "k": "v"\n}');
  });

  it('resolves a static relative path against basePath', async () => {
    const output = await materialize({
      result: mockResult(),
      rule: { path: 'nested/artifact.json', format: 'json' },
      basePath: tempDir
    });

    expect(output.path).toBe(join(tempDir, 'nested', 'artifact.json'));
  });

  it('uses a function path with result and context', async () => {
    const output = await materialize({
      result: mockResult({ artifact: { file: 'dynamic' } }),
      rule: {
        path: (result, context) =>
          join(String(context?.folder ?? 'fallback'), `${String((result.artifact as { file: string }).file)}.txt`),
        format: 'raw'
      },
      basePath: tempDir,
      context: { folder: 'from-context' }
    });

    expect(output.path).toBe(join(tempDir, 'from-context', 'dynamic.txt'));
  });

  it('creates nested directories automatically', async () => {
    await materialize({
      result: mockResult(),
      rule: { path: 'a/b/c/artifact.json', format: 'json' },
      basePath: tempDir
    });

    expect(await exists(join(tempDir, 'a', 'b', 'c', 'artifact.json'))).toBe(true);
  });

  it('uses absolute paths as-is', async () => {
    const absolutePath = join(tempDir, 'absolute.json');

    const output = await materialize({
      result: mockResult(),
      rule: { path: absolutePath, format: 'json' },
      basePath: '/ignored/base/path'
    });

    expect(output.path).toBe(absolutePath);
  });

  it('returns the resolved path and formatted content during dry-run without writing', async () => {
    const output = await materialize({
      result: mockResult(),
      rule: { path: 'dry-run.json', format: 'json' },
      basePath: tempDir,
      dryRun: true
    });

    expect(output).toEqual({
      written: false,
      path: join(tempDir, 'dry-run.json'),
      content: '{\n  "k": "v"\n}'
    });
    expect(await exists(join(tempDir, 'dry-run.json'))).toBe(false);
  });

  it('uses process.cwd() as the default basePath', async () => {
    process.chdir(tempDir);
    const expectedPath = resolve(process.cwd(), 'cwd.json');

    const output = await materialize({
      result: mockResult(),
      rule: { path: 'cwd.json', format: 'json' }
    });

    expect(output.path).toBe(expectedPath);
    expect(await exists(expectedPath)).toBe(true);
  });

  it('composes with execute() using a real command', async () => {
    const result = await execute({
      command: 'echo',
      args: ['{"k":"v"}']
    });

    const output = await materialize({
      result,
      rule: { path: 'execute.json', format: 'json' },
      basePath: tempDir
    });

    expect(output.written).toBe(true);
    expect(await readFile(join(tempDir, 'execute.json'), 'utf8')).toBe('{\n  "k": "v"\n}');
  });
});
