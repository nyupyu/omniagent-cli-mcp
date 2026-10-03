# Cross-Platform & CI Matrix Guardrails

OmniAgent is tested and supported across a 6-job matrix:
* **Operating Systems:** Ubuntu (`ubuntu-latest`), macOS (`macos-latest`), Windows (`windows-latest`).
* **Node.js LTS Versions:** Node 20.x and Node 22.x.

## Rules for Cross-Platform Reliability:
1. **No Shell Glob Assumptions:** Never hardcode file globs (e.g. `test/*.test.js`) in npm scripts, as Windows `cmd.exe` does not expand globs and Node 20's test runner treats them literally. Use zero-argument `tsx --test` for cross-platform test discovery.
2. **Process Tree Teardown:**
   - On POSIX: Spawn with `detached: true` and terminate with `process.kill(-proc.pid, 'SIGTERM')` to cleanly kill child sub-trees.
   - On Windows: Use process termination with stream destruction (`proc.stdin/stdout/stderr.destroy()`).
3. **Memory Limits & Stream Safety:** Always enforce `maxBufferBytes` (e.g. 512 KB in `runCommand`, 4 MB in `runGit`) to prevent memory exhaustion from runaway CLI outputs.
4. **Node 20 Polyfill:** Toolchains relying on `Promise.withResolvers` (such as `tsdown`) must be preloaded with `scripts/node20-polyfill.cjs` when executed on Node 20.
