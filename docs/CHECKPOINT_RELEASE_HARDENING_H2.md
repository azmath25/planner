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

## H2.1 — Cloud Shell npm ETARGET repair (2026-11-08)

The operator used a separate `~/dayframe-h2` checkout in Google Cloud Shell, selected Node v24.22.2 and ran `scripts/h2-bootstrap-local.sh`. npm reached the registry but refused `@mantine/utils@9.7.5` with `ETARGET`. Registry metadata confirms `@mantine/utils` has no 9.7.5 release (latest 6.0.22), while `@mantine/core` and `@mantine/hooks` each publish 9.7.5. No direct `@mantine/utils` import was found in repository code search; BlockNote's Mantine integration uses the core/hooks peer packages. Removed only the invalid direct manifest dependency, preserving the currently pinned core/hooks and BlockNote versions.

The peer resolution warnings about `better-call` are separate and were not the terminating npm error. Do not suppress them with global peer-dependency overrides before the next install result is available. `package-lock.json`, `npm ci`, TypeScript/build, security scan, and all runtime tests remain unverified until the operator pulls this feature-branch fix and reruns H2.

## H2.2 — First successful npm install; corrected failing search assertion

Cloud Shell run on Node 24.22.2 and npm 11.19.1 generated a genuine `package-lock.json` **in the operator's checkout** (not yet committed) and installed 295 packages. Source, time, documents, PWA, and time-report/insights tests passed. Backend API tests reported 81 passing and 1 failing, stopping H2 before TypeScript/build/dist/dependency-audit checks. Peer-resolution and install-script warnings require review but were not fatal to this run.

The sole failure was `backend/tests/documents.test.mjs` (document search). The test used `encodeURIComponent('%00')` and expected HTTP 400, but this encodes three literal printable characters to `%2500`; the search API rightly interprets them as literal `%00` and returns HTTP 200. An actual null character encodes as `%00` and is rejected by the existing API. Corrected the test to assert 400 for the genuine NUL, 200 for literal percent text, and verify the literal value reaches the bound SQL argument. The API implementation and server behavior were not changed. Node URL parsing behavior was checked in an isolated environment; the complete backend suite has **not** been rerun following the correction.

Next operator step: `cd ~/dayframe-h2 && git pull --ff-only origin feature/dayframe-m53-release-20261107 && bash scripts/h2-bootstrap-local.sh`. The existing untracked `package-lock.json` should remain; the script skips lockfile generation when present. Only after all H2 checks pass should the operator review and commit the lockfile. Do not merge or deploy.

## H2.3 — TypeScript build errors after 82/82 API tests (2026-11-08)

The operator reran `scripts/h2-bootstrap-local.sh` on Node 24.22.2. Dependency installation succeeded using the existing local generated lockfile. Source smoke/H2 regression, timer, document validation, PWA, time report/insights and **all 82 backend API tests** passed. The script then stopped at `tsc --noEmit` with **7 errors in 3 files**. It did not reach the Vite build, distribution check or dependency audit.

Feature-branch source repairs, each minimal and without backend/database changes:

- `web/src/auth/api.ts`: added explicit structurally typed result objects in list-deleted-documents, list-notes and list-trashed-notes paginators. This eliminates TS7022 self-referential inference and restores contextual typing for callbacks (TS7006). No API field names or validation checks changed.
- `web/src/domain/timeInsights.ts`: retained the already-validated six-week unknown array in a local `unknown[]` before the map callback, avoiding TS18046 on a record property whose narrowing was lost inside the callback. The sequential-week ordering check remains the same.
- `web/src/components/BlockDocumentEditor.tsx`: added BlockNote 0.57's required `link` inline spec alongside `text`. This corrects TS2322; links are **not accepted for saving**: existing client/server document-block validators prohibit link nodes, and the editor disables the link toolbar. A user trying to insert a link may see the validation warning; do not claim insertion is fully disabled.

Targeted source readback passed and the narrowed response/list pattern passed an isolated strict TypeScript typecheck with the available local compiler version 5.8.3. **The actual Node 24/TypeScript 5.9.3 application typecheck, Vite build, distribution assertions and npm audit have not been rerun after these repairs.** Operators should pull the feature branch and rerun `bash scripts/h2-bootstrap-local.sh`. The generated `package-lock.json` is still **only in Cloud Shell** and must be reviewed/committed after a successful run. All production actions remain blocked.
