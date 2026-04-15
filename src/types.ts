export interface ExecuteOptions {
  command: string;
  args?: string[];
  cwd?: string;
  timeout?: number;
  env?: Record<string, string>;
}

export interface ExecuteResult {
  ok: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  artifact: unknown | null;
  capturedAt: string;
}

export type PathTemplate =
  | string
  | ((result: ExecuteResult, context?: Record<string, unknown>) => string);

export type FormatFn = (result: ExecuteResult) => string | Buffer;

export type Format = 'json' | 'json-compact' | 'raw' | 'envelope' | FormatFn;

export type ConditionFn = (result: ExecuteResult) => boolean;

export type MaterializeCondition =
  | 'always'
  | 'on-success'
  | 'on-artifact'
  | ConditionFn;

export type ConflictStrategy = 'overwrite' | 'skip' | 'append' | 'timestamp';

export interface MaterializeRule {
  path: PathTemplate;
  format: Format;
  condition?: MaterializeCondition;
  conflict?: ConflictStrategy;
}

export interface MaterializeOptions {
  result: ExecuteResult;
  rule: MaterializeRule;
  basePath?: string;
  context?: Record<string, unknown>;
  dryRun?: boolean;
}

export interface MaterializeOutput {
  written: boolean;
  path: string | null;
  content: string | Buffer | null;
  skippedReason?: string;
}
