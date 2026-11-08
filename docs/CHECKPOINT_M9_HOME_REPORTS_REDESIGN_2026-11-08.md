# M9 — Home & Reports frontend redesign checkpoint

**Date:** 2026-11-08  
**Repository:** `azmath25/planner`  
**Branch:** `feature/dayframe-m53-release-20261107`  
**Deployment:** Feature branch only; existing Vercel production has not been promoted to this source in this checkpoint.

## User decisions

- Finish the current Dayframe **web/PWA frontend redesign** before further work on the Android Play Store package.
- Retain the existing Dayframe database. No old-data migration or deletion.
- Home should emphasize **real report summaries, today's tasks, and Quick Notes in that order**. Quick Notes appear directly under today's tasks; the full Notes page remains accessible.
- Replace the large welcome/reminder configuration blocks on Home with compact real activity metrics and a bell entry. Notification permission, time zone, quiet hours and the alert inbox belong in **Profile**.
- Show functional on-screen quick actions for Today's Plan, starting a focus timer and Reports. These web actions are intended to serve as the future source for Android launcher/on-screen shortcuts, but **no Android launcher shortcut is implemented here**.
- Chart type (bar/pie/table) is a viewer choice in Reports. Never fabricate activity, attribute duplicated rollups, or present all-time task focus as a period-specific statistic.

## Completed frontend redesign

### Home

The former welcome banner and large reminder inbox were removed from Home. The new page contains:

1. Compact date header, small bell linking to **Profile → Notifications & Reminders**, New Note and New Task actions.
2. Functional quick actions **Today's Plan**, **Start timer** (scroll/focus into explicit task selector), and **Reports**.
3. Real overview metrics: saved focus this week, today's selected plan task count, current completed-task count (clearly all-time), and tasks due or overdue through 48 hours.
4. A weekly activity card loaded from the existing owner-scoped Neon `GET /v1/time-report?period=week&day=<today>`, with exact recorded focus, fixed planned minutes, and a workspace focus pie with accessible text legend. Loading/error/zero states replace invented sample totals.
5. Today's task rows, a task selector and direct Start action that uses existing validated timer logic and its switch confirmation. The selector is retained across unrelated page updates.
6. **Quick Notes immediately below today's tasks**, showing pinned notes first followed by recently updated notes, with content previews, Open Note and New Note controls. No second notes database or duplicate editor.
7. Existing pinned task and workspace shortcuts remain available below Quick Notes.
8. Workspaces section below the main dashboard.

The new UI is responsive, with explicit 660px and 370px layout rules, wrapping shortcuts and compact metrics/notes.

### Reports

The existing day/week/month controls, saved period API, detailed workspace/long-term task tables, insights, and CSV export remain. Instead of permanent pie cards, a chart panel now offers:

- **Workspaces / Workflows / Tasks** breakdown options.
- **Bars / Pie / Table** display options.
- Accessible labels, legends, zero states, bounded slices, consistent percentages, and a small-screen single-column chart layout.

**Data semantics are deliberately explicit:**

- **Workspaces:** precise period-specific focus per owner-scoped workspace, from the already deployed Neon report endpoint.
- **Workflows/projects:** period-specific, top-level **long-term task** rollups. Nested long-term projects are omitted from the chart to prevent double counting. Non-project tasks are not represented in this subset.
- **Individual tasks:** currently loaded tasks' **all-time direct focus**, including running time, using the app's existing task time state. These **are not filtered by the chosen day/week/month**. The UI says so. True per-task historical period reporting needs a subsequent backend M9.1 API extension; the frontend intentionally does not misrepresent it.

The old illustrative/fake fallback report metrics were removed from the unsigned/local preview.

### Profile / notifications

- Profile now owns the full notification configuration and reminder inbox: push enable/disable, device time zone, quiet hours, refresh, acknowledge and snooze.
- Home bell opens and scrolls directly to the Profile section. The alert loader now re-renders Profile, not just Home.
- Existing backend reminder settings/actions were reused; no notification schema migration or new server endpoints were introduced.

## Automated verification performed

Current feature source was tested in an isolated Vercel sandbox, without GitHub Actions:

- `npm run test:dashboard`: **6 passing** redesign layout/wiring, honest metrics, chart controls and notification location checks.
- `node --test tests/taskDocumentsWiring.test.mjs`: passed.
- `npm run test:quicknotes`: passed.
- `npm run test:reports`: passed.
- `npm run test:time`: passed.
- `npm run test:pwa`: passed.
- `npm run test:documents`: passed.
- `npm run test:source`: passed.
- `npm run test:api`: passed.
- `npm run typecheck`: passed.
- `npm run build` with the existing current Dayframe API/Auth origins, followed by `npm run check:dist`: passed.

The final source (including restored pinned-item shortcuts) was retested in a fresh sandbox: dashboard regression, TypeScript, Vite build and distribution checks all passed.

**Not verified:** real signed-in mobile Chrome/iOS Safari/tablet visual regression, keyboard/safe-area/landscape layout, report drill-down behavior against real historical per-task period data, and push notifications from the new reminder schedule. A separate eight-width Chromium test exists but previously could not execute in Vercel's universal sandbox due to missing OS browser libraries; do not call it passed.

## Publication and follow-on boundaries

The serving site remains `https://dayframe-azmath25s-projects.vercel.app`, on the previous READY deployment. These redesigned screens exist **only in the feature branch until published**. Vercel Hobby rejected a previous production deployment due to the daily quota. Do not create a second project or raise billing to evade this restriction.

Publishing the current branch must be coordinated with the pending Dayframe Neon API push public-key update, followed by enabling the currently disabled `dayframe-reminder-dispatch` scheduled trigger **after** matching frontend and API are verified. The new reminder sender Function is installed but not actively scheduled.

**Future (separate work):** owner-scoped per-task period report API; browser-verified responsive acceptance; real push delivery; full offline synchronization; media/document attachments; Android launcher shortcuts and Play Store packaging. Old Neon database migration remains excluded.
