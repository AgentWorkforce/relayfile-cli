import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { execute } from '../src/execute.js';
import { materialize } from '../src/materialize.js';
import { conformGitHubIssue } from './helpers/conform-github.js';

const EXPECTED_CANONICAL_ISSUE = {
  number: 42,
  title: 'Fix the auth bug',
  state: 'open',
  body: 'The login page throws a 500 when...',
  labels: ['bug', 'auth'],
  assignees: ['octocat'],
  created_at: '2026-01-15T10:00:00Z',
  updated_at: '2026-01-16T14:30:00Z'
};

const RAW_CLI_OUTPUT = {
  number: 42,
  title: 'Fix the auth bug',
  state: 'OPEN',
  body: 'The login page throws a 500 when...',
  labels: [
    { name: 'bug', id: 'L1', color: 'red' },
    { name: 'auth', id: 'L2', color: 'blue' }
  ],
  assignees: [{ login: 'octocat', id: 'U1' }],
  createdAt: '2026-01-15T10:00:00Z',
  updatedAt: '2026-01-16T14:30:00Z'
};

const HELPER_PATH = new URL('./helpers/conform-github.ts', import.meta.url);
const ISSUE_PATH = 'github/repos/acme/api/issues/42.json';
const COMMAND_ARGS = ['-e', `console.log(${JSON.stringify(JSON.stringify(RAW_CLI_OUTPUT))})`];

describe('canonical schema conformance', () => {
  let mountRoot: string;

  beforeEach(async () => {
    mountRoot = await mkdtemp(join(tmpdir(), 'relayfile-cli-canonical-'));
  });

  afterEach(async () => {
    await rm(mountRoot, { recursive: true, force: true });
  });

  it('materializes a canonical GitHub issue shape via a custom format function', async () => {
    const result = await execute({
      command: 'node',
      args: COMMAND_ARGS
    });

    const output = await materialize({
      result,
      rule: {
        path: ISSUE_PATH,
        format: conformGitHubIssue,
        condition: 'on-artifact'
      },
      basePath: mountRoot
    });

    expect(output.written).toBe(true);
    expect(output.path).toBe(join(mountRoot, 'github', 'repos', 'acme', 'api', 'issues', '42.json'));

    const fileContent = JSON.parse(await readFile(output.path!, 'utf8'));
    expect(fileContent).toEqual(EXPECTED_CANONICAL_ISSUE);
  });

  it('shows divergence when writing raw json without conformance', async () => {
    const result = await execute({
      command: 'node',
      args: COMMAND_ARGS
    });

    const output = await materialize({
      result,
      rule: {
        path: ISSUE_PATH,
        format: 'json',
        condition: 'on-artifact'
      },
      basePath: mountRoot
    });

    const fileContent = JSON.parse(await readFile(output.path!, 'utf8'));

    expect(fileContent.state).toBe('OPEN');
    expect(fileContent.labels[0]).toHaveProperty('id', 'L1');
    expect(fileContent.assignees[0]).toHaveProperty('id', 'U1');
    expect(fileContent).toHaveProperty('createdAt', RAW_CLI_OUTPUT.createdAt);
    expect(fileContent).not.toHaveProperty('created_at');
  });

  it('round-trips a canonical issue file without data loss', async () => {
    const result = await execute({
      command: 'node',
      args: COMMAND_ARGS
    });

    await materialize({
      result,
      rule: {
        path: ISSUE_PATH,
        format: conformGitHubIssue,
        condition: 'on-artifact'
      },
      basePath: mountRoot
    });

    const filePath = join(mountRoot, 'github', 'repos', 'acme', 'api', 'issues', '42.json');
    const fileContent = JSON.parse(await readFile(filePath, 'utf8'));

    expect(fileContent).toEqual(EXPECTED_CANONICAL_ISSUE);
  });

  it('keeps the conformance helper isolated from relayfile packages', async () => {
    const helperSource = await readFile(HELPER_PATH, 'utf8');

    expect(helperSource).not.toMatch(/@relayfile\/adapter/i);
    expect(helperSource).not.toMatch(/@relayfile\/provider/i);
    expect(helperSource).not.toMatch(/relayfile-adapters/i);
    expect(helperSource).not.toMatch(/relayfile-providers/i);
    expect(helperSource).not.toMatch(/@relayfile\/sdk/i);
    expect(helperSource).toMatch(/from '\.\.\/\.\.\/src\/types\.js'/);
  });
});
