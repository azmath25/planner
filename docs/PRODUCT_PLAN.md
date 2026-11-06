# Dayframe — Product Plan

**Status:** v1.1 specification, 2026-11-06  
**Project:** Standalone personal time, task and knowledge management platform  
**Delivery sequence:** Mobile-first website on GitHub Pages + Neon first; Android/Google Play second.  
**Implementation status:** M1.2 mobile design prototype; no backend is connected.

## 1. Product vision

An aesthetically beautiful, fast, mobile-first personal management system for daily actions, long-term work and forgettable reminders. The account's Home screen, Day Planner and Reports include **all** workspaces. Every account has a permanent **General** workspace, plus any number of custom workspaces. A long-term task is **not** a workspace, but can contain nested subtasks, notes and reports and can be used for project-like work. No AI assistant or AI-generated scheduling.

Principles: quick capture; user-controlled deterministic scheduling; an informative, uncluttered Home; independent deadlines and reminders; accurate time records; secure ownership; accessible and responsive UI; clear status and recovery; no hidden destructive behavior.

## 2. Information architecture

- **Global Home:** account-wide alerts, overdue/approaching deadlines, reminders, in-progress timer, day's scheduled intervals and flexible pool, daily/weekly/monthly activity cards, pinned long-term tasks.
- **Tasks:** all-workspace or filtered task list; add/edit/search/sort, filters, archive, restore, Trash, hierarchy. A compact quick-add and an advanced detail form.
- **Plan Your Day:** choose tasks across workspaces, place them in an unordered or manually ordered **daily pool**, optionally schedule one or more **fixed clock intervals** for some or all of each task. Leave other tasks in the pool; move between the two. Warn about overcapacity and time collisions, but never silently change deadlines.
- **Calendar:** day/week/month time blocks, hard deadlines, reminder indicators; calendar is a view of planning data.
- **Workspaces:** General (built-in, permanent) and custom workspaces. Each has an optional avatar, photographic cover, custom accent, task list, notes/documents, scoped calendar and scoped reporting.
- **Task details:** title, status, workspace, ancestry, priority, estimated remaining work, total time, deadline, independent reminders, subtasks, activity, quick notes, BlockNote documents, optional avatar and cover photo.
- **Notes:** globally searchable Quick Notes for small facts/reminders; rich block-based documents attached to workspaces or tasks; nested document pages, content search, autosave, revisions, import/export, attachment storage.
- **Reports:** overall account, individual workspace, individual long-term task: day/week/month views, tracked time, completion, planned vs actual, overdue counts and milestones. Roll up without double-counting.
- **Settings:** profile, account deletion, notification channels/quiet hours/time zone, themes, covers and colors, data export and accessibility preferences.

## 3. Tasks, subtasks and long-term tasks

A task belongs to exactly one workspace and optionally to a parent task **in the same workspace**. Arbitrarily deep nesting is possible but UI can cap visible nesting for readability; disallow ancestry cycles. Ordinary and long-term tasks share a model. Long-term task is a user-facing classification that enables a richer dashboard and multiple document pages, not a separate workspace/table.

Task fields: title; optional description; workspace; optional parent; estimated total minutes; priority; status; created/updated/completed/cancelled timestamps; optional hard deadline (time zone aware); tags; visual identity; pinned state; recurrence metadata if applicable. Statuses: planned, active, paused/in-progress, completed, cancelled, archived (archive is independent from operational status where possible). Save explicit status-event history.

Actions: create, edit, start, pause, resume, stop session, complete, cancel, reopen, move workspace, change deadline, reschedule sessions, add subtasks, archive. **Delete only after explicit confirmation**, move to recoverable Trash; permanent deletion requires separate confirmation and retention policy. Completing a parent with open children requires explicit handling decision. Ensure audit events for consequential edits.

## 4. Soft reminders vs hard deadlines

- **Hard deadline** is a completion requirement. When it passes and task is incomplete, label overdue; snoozing an alert does not move it.
- **Soft reminder** says when the user should be reminded. It can occur without any deadline, have a date and/or hour, be acknowledged, snoozed and rescheduled independently. Permit multiple reminders, channels and recurrence.
- Alerts for upcoming hard deadlines use user-defined thresholds; reminders and deadline alerts must not be conflated.
- Reminder reliability requires a server-side due-reminder queue/trigger plus authenticated delivery channels (e.g. web push or email when configured); client-only timers cannot guarantee alerts when the website is closed. Handle permission denial, retries, deduplication, time zones and daylight-saving changes.

## 5. Hybrid planning model

Global daily plan is per account/date and can contain tasks from any workspace. A plan item means a task has been deliberately placed into that day, **with or without any fixed time**. Unscheduled pool items have position/order but no time interval. A task may have multiple scheduled intervals across one or more days. Scheduled intervals are separate records, each with start/end, time zone, optional lock and task link. A task may have both scheduled effort and some remaining unscheduled effort on the same day.

Track separately: estimated total minutes; actual recorded minutes; allocated future minutes; remaining estimate; day capacity; fixed appointments; breaks/buffer. Display realistic overcapacity warnings for scheduled conflicts and flexible pool workload. Provide drag/drop or accessible move buttons; mobile touch alternatives; undo moves. No AI assistant; user confirms rescheduling. Protect hard deadlines.

## 6. Time tracking

Press Start to create an actual time session (server timestamp). One running timer per account by default, with explicit option to switch tasks by stopping/pausing current session. Pause/resume creates accurate session segments; stop does not imply completion. Recovery across page reloads/devices must compute from timestamps, not setInterval counting alone. Sessions may belong to a subtask or a parent task; reporting sums each raw session exactly once through ancestry and workspace membership. Keep history when tasks move workspaces (design reporting semantics for historic vs current memberships explicitly in backend milestone).

## 7. Notes and knowledge management

- **Quick Notes:** plain/rich lightweight snippets, pin, optional color, optional soft reminder, optional conversion to task, optional attachment to a workspace or task; no enforced due date.
- **BlockNote Documents:** multiple documents per task and workspace; headings, lists, checkboxes, toggles, tables, quotes, code, links, image/file blocks, custom mathematics/LaTeX blocks, nested pages and templates. Use permissively usable open-source BlockNote core; do not rely on commercial XL packages.
- Autosave with conflict/version guards, revisions and restore, search and Markdown/JSON export. A checkbox in a note is not a task unless explicitly converted.

## 8. Visual identity and mobile interaction

Mobile-first, minimal and clean default. Bottom navigation for Home, Plan, Tasks, Notes plus context menu; a global quick-create action. Secondary pages include Workspaces, Calendar, Reports and Settings. Desktop adds a sidebar and multi-column layouts. WCAG contrast, keyboard navigation, focus states, large touch targets, reduced-motion support, responsive empty/loading/error states.

Appearance gallery: **Minimal, Midnight, Nature, Pastel, Editorial, Professional**, with additional coherent presets later. Each preset controls a restrained set of tokens (colors, typography, surfaces, accent, density, motion), not functional layout. User controls light/dark, accents and cover treatment. Tasks and workspaces each support independent avatar/profile image, background/cover, cover focal point, crop, replace and remove. Default lists use tiny avatars or colored identifiers and never huge covers. Store uploaded media privately with authorization, safe type/size limits, resizing/compression, responsive formats, lazy loading, contrast overlays and deletion lifecycle. No external photo service requirement.

## 9. Proposed stack and privacy

- Mobile web first: React + TypeScript + Vite, accessible component system, PWA when stable, GitHub Pages with base-path aware routing.
- Backend: **separate Neon project** (not Quizer/Mimo), Neon Auth, authenticated Neon Functions, PostgreSQL. Keep tokens and DB passwords server-side; never expose connection strings in GitHub Pages frontend.
- Private Object Storage for uploads where supported; signed URLs / access-controlled proxy. Confirm regional availability before provisioning services.
- Offline cache (IndexedDB) with explicit sync and conflict semantics. Start with online-first correctness, then add offline capabilities.
- Accessibility, privacy, backup/restore, audit trail, usage/cost limits and tests from early milestones.
- No AI assistant, LLM calls, AI scheduler, or Android code in Phase I.

Proposed conceptual tables: users/auth, workspaces, tasks, task_relations (or parent_id), task_reminders, day_plans, day_plan_items, scheduled_intervals, time_sessions, quick_notes, documents, document_revisions, stored_media, task_events, user_preferences, notification_deliveries, recurrence_rules. Exact SQL and policies are deferred to backend milestone.

## 10. Milestones (one at a time)

Every milestone: implement only approved scope, run relevant checks, document outcomes and risks, **stop for approval**. The user approved replacement of this repository’s legacy app; the legacy branches have been deleted by the user's explicit instruction, and only GitHub `main` is used. Avoid unrelated protected branches, Neon production resources and live deployments without explicit approval.

### Phase I — website

- **M1.1 Mobile UX architecture:** page map, responsive navigation, Home/Tasks/Plan/Notes/Workspaces/Reports screens, interactive example flow; design-only with sample data; write this plan and checkpoint.
- **M1.2 Visual design system:** theme gallery, typography, palettes, touch controls, image/cover treatments and accessibility.
- **M1.3 React frontend foundation:** reimplement validated prototype as React + TypeScript + Vite, app routing and tests; sample-data flows only.
- **M2.1 Isolated infrastructure:** existing renamed GitHub repository (`azmath25/planner`, `main` only), separate Neon project, CI and safe API foundation.
- **M2.2 Identity:** Neon Auth, server session verification, secure profile management and General workspace auto-creation.
- **M2.3 Workspaces:** create/edit/archive custom workspaces, workspace navigation, image storage plan and authorization tests.
- **M3.1 Tasks:** create/edit, estimates, independent deadlines and reminders, filtering.
- **M3.2 Task lifecycle:** complete/cancel/reopen, trash/restore/confirmed deletion and audit trail.
- **M3.3 Nested work:** subtasks, long-term task views, safe movement, images/covers and history.
- **M4.1 Daily pool:** day assignment, manual order, removal and cross-workspace selection.
- **M4.2 Timed intervals:** fixed intervals, task splitting across days, time conflicts, overcapacity and calendar views.
- **M4.3 Reminders:** soft reminders, hard deadline alerts, snoozing and reliable delivery.
- **M5.1 Time sessions:** start/pause/resume/stop, one-active-session invariant and recovery.
- **M5.2 Rollups:** nested task/workspace/global time aggregation and historical correctness.
- **M5.3 Estimates/targets:** remaining work, plans vs actual, weekly workspace targets.
- **M6.1 Quick Notes:** capture, organization, pins, reminders and task conversion.
- **M6.2 Documents:** BlockNote editor for tasks and workspaces; document libraries and hierarchical pages.
- **M6.3 Persistence:** autosave, revisions, media attachments, search and export.
- **M7.1 Global Home:** all-workspace reminders, approaching deadlines, running timer and daily plan.
- **M7.2 Reports:** account, workspace, long-term task day/week/month reports.
- **M7.3 Insights:** estimates, progress, trends, deadline history and CSV export.
- **M8.1 Quality:** accessibility, mobile responsiveness, device testing, imagery optimization, performance and security.
- **M8.2 PWA:** installation, offline/sync semantics and supported notification behavior.
- **M8.3 Website release:** backup/export verification, end-to-end acceptance and go-live approval. Website preview uses GitHub Pages **Deploy from a branch → main / (root)**; no additional deployment branches or Actions publishing workflow.

### Phase II — Android after stable website

- **M9.1** Capacitor Android package from stable web product.
- **M9.2** Native notifications, lifecycle, offline and battery-related testing.
- **M9.3** Store assets, privacy/data safety, signed Android App Bundle and closed testing.
- **M9.4** Google Play review and production release.

### Optional post-core features

Recurring habits and routines; deterministic rescheduling assistance; calendar integration; Excalidraw whiteboard; richer analytics. These are not prerequisite to the core website.

## 11. Release acceptance criteria

A user can create a reminder-only task without deadline; create a hard-deadline task without reminder; create a long-term task with nested children and documents; assign it to General or a custom workspace; add it to a day pool without time; schedule only some of its effort in fixed intervals over multiple days; start and pause time tracking; view accurate global and scoped reports without double counting; see robust reminder/overdue handling; customize workspace/task cover images and theme while retaining readable mobile layouts; export data and recover accidentally deleted tasks. Critical actions are authorized server-side, audited and tested. All of this must work on the mobile website **before Android work**.

## 12. Current checkpoint

M1.2 visual design milestone: six coherent themes, six optional accent colors, comfortable/compact layout, three cover styles, avatar and cover photo preview for tasks and workspaces with client-side image size/type checks, compression and focal-position adjustment. These appearance controls are deliberately confined to Settings or entity detail views to keep the mobile daily interface clean. Uploaded images are disposable browser-local preview data only (no remote uploads). Use GitHub Pages **branch deployment from `main` / `(root)`**, not a `gh-pages` branch or an Actions deployment workflow. The user explicitly requested GitHub to retain only one branch (`main`); all obsolete branches were deleted. No Neon mutations, real notifications or production uploads. The static demo is not a production application.
