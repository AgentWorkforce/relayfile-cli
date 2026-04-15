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
