# Dayframe release hardening H2 — dependency gate and browser harness

**Branch:** `feature/dayframe-m53-release-20261107`  
**Status:** one source defect repaired and local build bootstrap prepared. **Dependency build blocked by environment and not executed.** No `main` merge, Actions run, Cloud Shell, database write or deployment.

## H2 dependency environment

- Runtime available to this assistant: Node 22.16 and npm 10.9, with no local repository checkout. Node 24+ is required by the intended release gate.
- An attempted HTTPS Git remote read returned DNS failure for `github.com`; an npm metadata request returned `EAI_AGAIN` for `registry.npmjs.org`. No lockfile was fabricated or imported from an unrelated branch.
- The feature branch still lacks `package-lock.json`. `npm ci`, TypeScript compilation, actual Vite/BlockNote bundling and the full browser suite remain **unverified**.

## Source fix and targeted verification

- Found a definite M7.3 Playwright harness failure: `tests/build-m73-harness.mjs` generated literal `\\n` tokens instead of actual newlines in the injected CSV helper JavaScript; V8 parsing of the original string threw `SyntaxError: Invalid or unexpected token`.
- Replaced string concatenation with `tests/insights-harness-code.mjs`, which validates the actual generated source using a syntax-only `new Function` parse before writing the fixture.
- `tests/insights-harness-code.test.mjs` covers an executable sample helper, literal-vs-real newlines, malformed JavaScript and a missing formatter. It is included in `npm run test:source`.
- The helper was exercised directly in isolated V8: it returned `RESEARCH` from a real sample formatter, rejected malformed source with `SyntaxError`, and rejected missing exports. This is **not** a Vite build or complete Node test run.

## One-command local H2 gate (not executed here)

```bash
bash scripts/h2-bootstrap-local.sh
```

The script refuses to operate outside the named feature branch and requires Node 24+, a real npm registry connection, and a developer-owned checkout. It generates a genuine lockfile **only if missing** using npm; checks dependency metadata; then runs `npm ci`, source/domain/API/PWA tests, TypeScript/Vite build, built-PWA assertions and high-severity production dependency audit. It cannot merge, push, deploy or access live Neon. It will stop at the first actual failure.

## Acceptance boundary

**H2 is not complete.** To close H2, run the local gate in a network-enabled Node 24+ checkout, review and commit the resulting `package-lock.json` on the feature branch, and fix any actual test/type/build failures. M8.3 disposable PostgreSQL, Chromium and Safari tests remain separate, later gates. Production release approval remains withheld.
