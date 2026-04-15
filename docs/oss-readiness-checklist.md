# OSS Readiness Checklist — First Slice

## Purpose

This checklist defines the concrete tasks for the first OSS readiness slice. Each item is independently verifiable. The scope is limited to repo hygiene and metadata — no runtime code changes.

---

## Checklist

### Critical (blocking for public repo)

- [ ] **Add `.gitignore`**
  - Must include: `node_modules/`, `dist/`, `.env`, `*.tsbuildinfo`
  - Should include: `.DS_Store`, `*.log`
  - Verify: `cat .gitignore` shows entries; `git status` no longer lists `node_modules/` or `dist/`

- [ ] **Add `LICENSE` file**
  - Choose license (recommendation: MIT for simplicity and ecosystem alignment)
  - File must be in repo root as `LICENSE` (no extension)
  - Verify: `cat LICENSE` shows full license text with correct year and copyright holder

- [ ] **Add `license` field to `package.json`**
  - Must match the LICENSE file (e.g., `"license": "MIT"`)
  - Verify: `node -e "console.log(require('./package.json').license)"` outputs the license identifier

- [ ] **Add `repository` field to `package.json`**
  - Format: `{ "type": "git", "url": "https://github.com/<org>/relayfile-cli.git" }`
  - Verify: `node -e "console.log(require('./package.json').repository)"` outputs the repo URL

- [ ] **Remove `"private": true` or document why it stays**
  - If the intent is npm-publishable: remove `"private": true`
  - If the intent is public source but not npm-published: keep it, but document in README that install is from git
  - Verify: check `package.json` for `private` field

### Important (expected for a credible public repo)

- [ ] **Add `engines` field to `package.json`**
  - Based on `tsconfig.json` target (ES2022) and Node 16 module resolution: `"engines": { "node": ">=18" }`
  - Verify: `node -e "console.log(require('./package.json').engines)"`

- [ ] **Expand `README.md`**
  - Required sections:
    - Summary (1 paragraph: what this is, what it does)
    - Install (npm install or git clone)
    - Usage (code example showing `execute()` with options and result)
    - API reference (document `ExecuteOptions` and `ExecuteResult` fields)
    - Development (how to build, test, typecheck)
    - License (link to LICENSE file)
  - Verify: `README.md` contains each section heading

- [ ] **Ensure `dist/` is not tracked by git**
  - If `dist/` files appear in `git ls-files`, remove them with `git rm -r --cached dist/`
  - Verify: `git ls-files dist/` returns empty

- [ ] **Ensure `node_modules/` is not tracked by git**
  - If `node_modules/` files appear in `git ls-files`, remove them with `git rm -r --cached node_modules/`
  - Verify: `git ls-files node_modules/` returns empty

### Nice to Have (not blocking, but improves quality)

- [ ] **Add `author` field to `package.json`**
  - Verify: `node -e "console.log(require('./package.json').author)"`

- [ ] **Add `keywords` field to `package.json`**
  - Suggested: `["cli", "execute", "artifact", "relayfile"]`
  - Verify: `node -e "console.log(require('./package.json').keywords)"`

- [ ] **Remove `@agent-relay/sdk` from `dependencies`**
  - This is a private/internal dependency. A public repo should not have dependencies that cannot be resolved by external users.
  - If the workflow script (`npm run workflow`) needs it, move it to `devDependencies` or remove the `workflow` script from `package.json`
  - Verify: `npm install` succeeds in a clean environment without private registry access

---

## Validation Commands

After all items are complete, run these commands to verify:

```bash
# Tests still pass
npm test

# Build still succeeds
npm run build

# Typecheck passes
npm run typecheck

# No private dependencies in production
node -e "const p = require('./package.json'); console.log('license:', p.license); console.log('private:', p.private); console.log('repository:', p.repository); console.log('engines:', p.engines)"

# dist/ and node_modules/ are not tracked
git ls-files dist/ node_modules/

# .gitignore exists
cat .gitignore

# LICENSE exists
head -1 LICENSE
```

## What This Checklist Does NOT Cover

The following are real needs but belong in future slices:

| Item | Why deferred |
|------|-------------|
| GitHub Actions CI | Requires repo to be on GitHub first; separate infra concern |
| ESLint / Prettier | Code quality tooling, not a prerequisite for visibility |
| CONTRIBUTING.md | The repo is 3 source files; contribution guidance is premature |
| CHANGELOG.md | 6 commits; no meaningful history to document yet |
| CODE_OF_CONDUCT.md | Standard for community projects but not blocking |
| npm publish pipeline | Separate decision from "source is public" |
| Process-tree test hardening | Code quality improvement, not OSS hygiene |
