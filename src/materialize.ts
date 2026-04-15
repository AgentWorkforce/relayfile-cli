import { access, appendFile, mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';

import type {
  ConflictStrategy,
  ExecuteResult,
  Format,
  MaterializeCondition,
  MaterializeOptions,
  MaterializeOutput,
  MaterializeRule
} from './types.js';

function resolvePath(
  rule: MaterializeRule,
  result: ExecuteResult,
  basePath: string,
  context?: Record<string, unknown>
): string {
  const rawPath = typeof rule.path === 'function' ? rule.path(result, context) : rule.path;

  return resolve(basePath, rawPath);
}

function formatContent(format: Format, result: ExecuteResult): string | Buffer {
  if (typeof format === 'function') {
    return format(result);
  }

  switch (format) {
    case 'json':
      return JSON.stringify(result.artifact, null, 2);
    case 'json-compact':
      return JSON.stringify(result.artifact);
    case 'raw':
      return result.stdout;
    case 'envelope':
      return JSON.stringify(result, null, 2);
  }
}

function evaluateCondition(
  condition: MaterializeCondition | undefined,
  result: ExecuteResult
): { pass: boolean; reason?: string } {
  const resolvedCondition = condition ?? 'on-success';

  if (typeof resolvedCondition === 'function') {
    return resolvedCondition(result)
      ? { pass: true }
      : { pass: false, reason: 'Custom condition returned false' };
  }

  switch (resolvedCondition) {
    case 'always':
      return { pass: true };
    case 'on-success':
      return result.ok
        ? { pass: true }
        : { pass: false, reason: 'Condition on-success failed: result.ok is false' };
    case 'on-artifact':
      return result.artifact !== null
        ? { pass: true }
        : { pass: false, reason: 'Condition on-artifact failed: artifact is null' };
  }
}

async function handleConflict(
  strategy: ConflictStrategy,
  filePath: string
): Promise<{ path: string; skip: boolean; append: boolean }> {
  const exists = await access(filePath).then(
    () => true,
    () => false
  );

  if (!exists) {
    return { path: filePath, skip: false, append: false };
  }

  switch (strategy) {
    case 'overwrite':
      return { path: filePath, skip: false, append: false };
    case 'skip':
      return { path: filePath, skip: true, append: false };
    case 'append':
      return { path: filePath, skip: false, append: true };
    case 'timestamp': {
      const extension = extname(filePath);
      const baseName = basename(filePath, extension);
      const parentDir = dirname(filePath);
      const timestamp = Date.now();
      const nextPath = join(
        parentDir,
        extension ? `${baseName}.${timestamp}${extension}` : `${baseName}.${timestamp}`
      );

      return { path: nextPath, skip: false, append: false };
    }
  }
}

export async function materialize(
  options: MaterializeOptions
): Promise<MaterializeOutput> {
  const {
    result,
    rule,
    basePath = process.cwd(),
    context,
    dryRun = false
  } = options;

  const condition = evaluateCondition(rule.condition, result);
  if (!condition.pass) {
    return {
      written: false,
      path: null,
      content: null,
      skippedReason: condition.reason
    };
  }

  const resolvedPath = resolvePath(rule, result, basePath, context);
  const content = formatContent(rule.format, result);

  if (dryRun) {
    return {
      written: false,
      path: resolvedPath,
      content
    };
  }

  const conflict = await handleConflict(rule.conflict ?? 'overwrite', resolvedPath);
  if (conflict.skip) {
    return {
      written: false,
      path: conflict.path,
      content: null,
      skippedReason: 'File exists and conflict strategy is skip'
    };
  }

  await mkdir(dirname(conflict.path), { recursive: true });

  if (conflict.append) {
    await appendFile(conflict.path, content);
  } else {
    await writeFile(conflict.path, content);
  }

  return {
    written: true,
    path: conflict.path,
    content
  };
}
