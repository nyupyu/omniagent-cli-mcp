# Local Quality Verification Gate

Before pushing any branch or opening a Pull Request, the agent MUST run and verify the following 4-step local quality gate:

## 1. Strict Typecheck
```bash
npm run typecheck
```
*Requirement:* Zero TypeScript errors (`tsc --noEmit`).

## 2. Fast Bundling
```bash
npm run build
```
*Requirement:* `tsdown` completes under 100ms producing a standalone `dist/index.cjs` bundle with valid source maps.

## 3. Automated Test Suite
```bash
npm test
```
*Requirement:* 100% test pass rate across all suites using native `tsx --test`.

## 4. Package Bundle Integrity
```bash
npm pack --dry-run
```
*Requirement:* Tarball contents strictly include required production assets (`dist/`, `index.js`, `src/`, `assets/`, `README.md`, `LICENSE`) without unneeded development artifacts or node_modules.
