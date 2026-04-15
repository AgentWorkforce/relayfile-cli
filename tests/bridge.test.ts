import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { execute } from '../src/execute.js';
import { materialize } from '../src/materialize.js';

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

describe('bridge', () => {
  let mountRoot: string;

  beforeEach(async () => {
    mountRoot = await mkdtemp(join(tmpdir(), 'relayfile-cli-bridge-'));
  });

  afterEach(async () => {
    await rm(mountRoot, { recursive: true, force: true });
  });

  it('materializes CLI artifact to adapter-compatible GitHub issue path', async () => {
    const result = await execute({
      command: 'node',
      args: [
        '-e',
        'console.log(JSON.stringify({ number: 42, title: "Fix bug", state: "open" }))'
      ]
    });

    const output = await materialize({
      result,
      rule: {
        path: (current) =>
          `github/repos/acme/api/issues/${String((current.artifact as { number: number }).number)}.json`,
        format: 'json',
        condition: 'on-artifact'
      },
      basePath: mountRoot
    });

    expect(output.written).toBe(true);
    expect(output.path).toBe(join(mountRoot, 'github', 'repos', 'acme', 'api', 'issues', '42.json'));

    const content = JSON.parse(await readFile(output.path!, 'utf8'));
    expect(content).toEqual({
      number: 42,
      title: 'Fix bug',
      state: 'open'
    });
  });

  it('materializes list artifact to multiple adapter-compatible paths', async () => {
    const result = await execute({
      command: 'node',
      args: [
        '-e',
        'console.log(JSON.stringify([{ number: 1, title: "A", state: "open" }, { number: 2, title: "B", state: "closed" }]))'
      ]
    });

    const items = result.artifact as Array<{ number: number; title: string; state: string }>;
    const outputs = await Promise.all(
      items.map((item) =>
        materialize({
          result: { ...result, artifact: item },
          rule: {
            path: (current) =>
              `github/repos/acme/api/issues/${String((current.artifact as { number: number }).number)}.json`,
            format: 'json',
            condition: 'on-artifact'
          },
          basePath: mountRoot
        })
      )
    );

    expect(outputs.map((output) => output.path)).toEqual([
      join(mountRoot, 'github', 'repos', 'acme', 'api', 'issues', '1.json'),
      join(mountRoot, 'github', 'repos', 'acme', 'api', 'issues', '2.json')
    ]);

    expect(await exists(join(mountRoot, 'github', 'repos', 'acme', 'api', 'issues', '1.json'))).toBe(true);
    expect(await exists(join(mountRoot, 'github', 'repos', 'acme', 'api', 'issues', '2.json'))).toBe(true);

    const first = JSON.parse(
      await readFile(join(mountRoot, 'github', 'repos', 'acme', 'api', 'issues', '1.json'), 'utf8')
    );
    const second = JSON.parse(
      await readFile(join(mountRoot, 'github', 'repos', 'acme', 'api', 'issues', '2.json'), 'utf8')
    );

    expect(first).toEqual({ number: 1, title: 'A', state: 'open' });
    expect(second).toEqual({ number: 2, title: 'B', state: 'closed' });
  });

  it('dry-run resolves adapter-compatible path without writing', async () => {
    const result = await execute({
      command: 'node',
      args: [
        '-e',
        'console.log(JSON.stringify({ number: 99, title: "Dry run", state: "open" }))'
      ]
    });

    const output = await materialize({
      result,
      rule: {
        path: (current) =>
          `github/repos/acme/api/issues/${String((current.artifact as { number: number }).number)}.json`,
        format: 'json',
        condition: 'on-artifact'
      },
      basePath: '/hypothetical/mount',
      dryRun: true
    });

    expect(output.written).toBe(false);
    expect(output.path).toBe('/hypothetical/mount/github/repos/acme/api/issues/99.json');
    expect(output.content).toBe('{\n  "number": 99,\n  "title": "Dry run",\n  "state": "open"\n}');
    expect(await exists('/hypothetical/mount/github/repos/acme/api/issues/99.json')).toBe(false);
  });

  it('reshapes CLI output to canonical schema via a custom format function', async () => {
    const result = await execute({
      command: 'node',
      args: [
        '-e',
        'console.log(JSON.stringify({ number: 42, title: "Fix bug", state: "OPEN", body: "Details here", labels: [{ name: "bug" }, { name: "priority" }], assignees: [{ login: "alice" }], createdAt: "2026-01-15T10:00:00Z", updatedAt: "2026-01-16T12:00:00Z" }))'
      ]
    });

    const output = await materialize({
      result,
      rule: {
        path: (current) =>
          `github/repos/acme/api/issues/${String((current.artifact as { number: number }).number)}.json`,
        format: (current) => {
          const artifact = current.artifact as {
            number: number;
            title: string;
            state: string;
            body: string;
            labels: Array<{ name: string }>;
            assignees: Array<{ login: string }>;
            createdAt: string;
            updatedAt: string;
          };

          return JSON.stringify(
            {
              number: artifact.number,
              title: artifact.title,
              state: artifact.state.toLowerCase(),
              body: artifact.body,
              labels: artifact.labels.map((label) => label.name),
              assignees: artifact.assignees.map((assignee) => assignee.login),
              created_at: artifact.createdAt,
              updated_at: artifact.updatedAt
            },
            null,
            2
          );
        },
        condition: 'on-artifact'
      },
      basePath: mountRoot
    });

    const content = JSON.parse(await readFile(output.path!, 'utf8'));

    expect(content.state).toBe('open');
    expect(content.labels).toEqual(['bug', 'priority']);
    expect(content.assignees).toEqual(['alice']);
    expect(content.created_at).toBe('2026-01-15T10:00:00Z');
    expect(content.updated_at).toBe('2026-01-16T12:00:00Z');
  });

  it('creates nested directory tree for adapter-compatible paths', async () => {
    const result = await execute({
      command: 'node',
      args: [
        '-e',
        'console.log(JSON.stringify({ number: 7, title: "Nested", state: "open" }))'
      ]
    });

    const output = await materialize({
      result,
      rule: {
        path: (current) =>
          `github/repos/acme/api/issues/${String((current.artifact as { number: number }).number)}.json`,
        format: 'json',
        condition: 'on-artifact'
      },
      basePath: mountRoot
    });

    expect(output.written).toBe(true);
    expect(output.path).toBe(join(mountRoot, 'github', 'repos', 'acme', 'api', 'issues', '7.json'));
    expect(await exists(join(mountRoot, 'github', 'repos', 'acme', 'api', 'issues', '7.json'))).toBe(true);

    const content = JSON.parse(await readFile(output.path!, 'utf8'));
    expect(content).toEqual({
      number: 7,
      title: 'Nested',
      state: 'open'
    });
  });
});
