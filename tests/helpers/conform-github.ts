import type { ExecuteResult } from '../../src/types.js';

function namesFromEntries(
  entries: unknown,
  key: 'name' | 'login'
): string[] {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries.map((entry) => {
    if (typeof entry === 'string') {
      return entry;
    }

    if (entry && typeof entry === 'object' && key in entry) {
      const value = entry[key];
      return typeof value === 'string' ? value : String(value);
    }

    return String(entry);
  });
}

export function conformGitHubIssue(result: ExecuteResult): string {
  const raw = (result.artifact ?? {}) as Record<string, unknown>;
  const state = typeof raw.state === 'string' ? raw.state.toLowerCase() : raw.state;

  const canonical = {
    number: raw.number,
    title: raw.title,
    state,
    body: raw.body || null,
    labels: namesFromEntries(raw.labels, 'name'),
    assignees: namesFromEntries(raw.assignees, 'login'),
    created_at: raw.createdAt ?? raw.created_at,
    updated_at: raw.updatedAt ?? raw.updated_at
  };

  return JSON.stringify(canonical, null, 2);
}
