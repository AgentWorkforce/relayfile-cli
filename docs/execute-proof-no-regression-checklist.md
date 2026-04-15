# Execute Proof No-Regression Checklist

This checklist defines the exact tests and gates required before the execute + artifact capture proof can be accepted. Each item is binary pass/fail. All must pass.

---

## Test Cases (tests/execute.test.ts)

### TC-1: Basic command execution

- **Input:** `execute({ command: 'echo', args: ['hello'] })`
- **Assert:** `result.ok === true`
- **Assert:** `result.exitCode === 0`
- **Assert:** `result.stdout === 'hello\n'`
- **Assert:** `result.stderr === ''`
- **Assert:** `typeof result.durationMs === 'number' && result.durationMs >= 0`
- **Assert:** `result.artifact === null` (stdout is not JSON)
- **Assert:** `typeof result.capturedAt === 'string'` and is valid ISO 8601

### TC-2: JSON stdout produces parsed artifact

- **Input:** `execute({ command: 'echo', args: ['{"name":"test","value":42}'] })`
- **Assert:** `result.ok === true`
- **Assert:** `result.artifact !== null`
- **Assert:** `result.artifact.name === 'test'`
- **Assert:** `result.artifact.value === 42`
- **Assert:** `result.stdout` contains the raw JSON string

### TC-3: Non-zero exit code

- **Input:** `execute({ command: 'sh', args: ['-c', 'exit 1'] })`
- **Assert:** `result.ok === false`
- **Assert:** `result.exitCode === 1`
- **Assert:** No thrown exception

### TC-4: Command not found

- **Input:** `execute({ command: 'nonexistent-command-xyz-9999' })`
- **Assert:** `result.ok === false`
- **Assert:** `result.exitCode === null` (or system-specific ENOENT behavior)
- **Assert:** `result.stderr` contains error information or is non-empty
- **Assert:** No thrown exception — the function returns normally

### TC-5: Timeout kills process

- **Input:** `execute({ command: 'sleep', args: ['60'], timeout: 500 })`
- **Assert:** `result.ok === false`
- **Assert:** `result.exitCode === null` (killed by signal)
- **Assert:** `result.durationMs >= 400 && result.durationMs < 5000` (killed near the timeout, not after 60s)
- **Assert:** No thrown exception

### TC-6: Stderr capture

- **Input:** `execute({ command: 'sh', args: ['-c', 'echo err >&2'] })`
- **Assert:** `result.ok === true`
- **Assert:** `result.stderr === 'err\n'`
- **Assert:** `result.stdout === ''`

### TC-7: Custom environment variables

- **Input:** `execute({ command: 'sh', args: ['-c', 'echo $TEST_VAR'], env: { TEST_VAR: 'hello_env' } })`
- **Assert:** `result.ok === true`
- **Assert:** `result.stdout === 'hello_env\n'`

### TC-8: Invalid JSON in stdout does not cause error

- **Input:** `execute({ command: 'echo', args: ['{invalid json}'] })`
- **Assert:** `result.ok === true`
- **Assert:** `result.artifact === null`
- **Assert:** `result.stdout` contains `'{invalid json}'`

---

## Build Gates

### BG-1: TypeScript compilation

```bash
npx tsc --noEmit
```

- **Pass criteria:** Exit code 0, no type errors

### BG-2: Production build

```bash
npm run build
```

- **Pass criteria:** Exit code 0, `dist/` directory produced with `.js` and `.d.ts` files

### BG-3: Test suite

```bash
npm test
```

- **Pass criteria:** Exit code 0, all test cases pass (TC-1 through TC-8)

---

## Boundary Gates

### BO-1: No cross-repo imports

```bash
grep -rE "(from|require).*@relayfile" src/ tests/
```

- **Pass criteria:** Zero matches (exit code 1 from grep = no matches found)

### BO-2: No server code

```bash
grep -rE "(createServer|express|fastify|http\.listen|app\.listen)" src/ tests/
```

- **Pass criteria:** Zero matches

### BO-3: No VFS or filesystem abstraction

```bash
grep -rE "(mountPoint|vfs|virtualFileSystem|fuse)" src/ tests/
```

- **Pass criteria:** Zero matches

### BO-4: No OAuth or auth management

```bash
grep -rE "(oauth|accessToken|refreshToken|clientSecret)" src/ tests/
```

- **Pass criteria:** Zero matches

---

## File Existence Gates

### FE-1: Required source files exist

```bash
test -f src/types.ts && test -f src/execute.ts && test -f src/index.ts
```

### FE-2: Required test files exist

```bash
test -f tests/execute.test.ts
```

### FE-3: Required config files exist

```bash
test -f tsconfig.json && test -f package.json
```

---

## Composite Validation Command

Run all gates in sequence — the proof is accepted only if every gate passes:

```bash
# Build gates
npx tsc --noEmit && \
npm run build && \
npm test && \

# Boundary gates
! grep -rqE "(from|require).*@relayfile" src/ tests/ && \
! grep -rqE "(createServer|express|fastify|http\.listen|app\.listen)" src/ tests/ && \

# File existence gates
test -f src/types.ts && \
test -f src/execute.ts && \
test -f src/index.ts && \
test -f tests/execute.test.ts && \
test -f tsconfig.json && \

echo "RELAYFILE_CLI_EXECUTE_PROOF_ALL_GATES_PASSED"
```

If the final echo prints, the proof clears the bar. If any gate fails, the chain short-circuits and the proof is not accepted.
