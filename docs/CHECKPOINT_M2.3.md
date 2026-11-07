# M2.3 checkpoint — saved workspaces/tasks and login diagnostics

**Scope:** one GitHub branch `main`; dedicated Neon project `soft-night-61558675` / database `dayframe`. No changes to Mimo or Quizer.

## Persisted in Neon
- Per-account General and custom workspaces; custom workspace create/edit, title, subtitle, color, cover preset.
- Tasks saved with notes, status, priority, estimate, independent hard deadline and soft reminder, long-term flag, and optional same-workspace parent.
- Composite database foreign keys reject cross-owner workspace and parent reassignment, even from SQL.
- Optimistic revisions on edits, validated data, paginated task/Trash lists, recoverable task deletion. No permanent task deletion route.
- No automatic import of old sample tasks.

## Still local and *not* synchronized
- Active timer, time sessions, daily pool and timed schedule, quick notes, media and theme preferences.
- No push reminders or Android app.

## Verified
- `0003_persistent_tasks` migration applied to Neon; one schema ledger record.
- Neon API deployment 4 reports completed (latest packaged Node 24 function).
- GitHub backend tests and bundled function build passed on the M2.3 source.
- React build/typecheck and branch-based Pages build passed; compiled Pages bundle includes the login session check.
- Live anonymous API security smoke and live Neon Auth connectivity, CORS/preflight, invalid-credentials and Pages HTML smoke passed.
- Only `main` used, no `gh-pages` branch.

## Known login blocker — not closed
Neon Managed Auth is currently called directly from `https://azmath25.github.io` to a different `neonauth.*.aws.neon.tech` host. Safari's Intelligent Tracking Prevention may reject that third-party session cookie even when sign-in responds successfully. The UI now explicitly checks `getSession()` after a successful sign-in and provides an actionable error if a valid session cannot be restored, rather than silently returning to the login form.

**No real-user Safari sign-in has passed an end-to-end test**. The existing direct cross-site cookie architecture should not be represented as Safari-compatible. A custom domain plus same-site proxy/hosted auth route, or an approved different hosting arrangement, is needed for reliable Safari login. Do not weaken browser tracking protection or bypass JWT verification as a workaround.

## Remaining verification
- Complete a real-user sign-up/sign-in/sign-out/reload test in Safari and at least one other browser after the auth hosting fix.
- Test two distinct authenticated accounts end-to-end against cloud tasks, including cross-owner denial and task restore.
- Revisit tablet/mobile interactions after account data replaces local sample tasks.
- Do not start the next milestone before explicit approval.
