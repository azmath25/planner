# Dayframe M1.1 checkpoint — mobile UX architecture

**Date:** 2026-11-06  
**Scope:** Replace the legacy canvas editor with a new mobile-first design prototype and preserve the current product plan.  
**Status:** Design prototype; no Neon backend or production notifications.

## Implemented

- Mobile-first static GitHub Pages shell with responsive desktop sidebar and mobile bottom navigation.
- Global Home: overview, alerts, workspace cards, sample daily/weekly/monthly metrics and focus preview.
- Tasks: example task list, workspace filtering, local search, completion, task detail and create/edit form with independent hard deadline and soft reminder.
- Hybrid day planner: date selection, daily unscheduled pool, manual up/down ordering, fixed start/end intervals, pool selection, move out of timed intervals and capacity warning.
- Workspace overview and per-workspace task/quick-note snapshots. General is represented as permanent in the design.
- Quick Notes create/delete with explicit confirmation; BlockNote document and image features clearly identified as later work.
- Reports sample UI, simple calendar agenda and theme gallery (six presets).
- Local demo state uses browser localStorage only; explicit preview labels prevent confusing samples with live data.
- Full product plan in `docs/PRODUCT_PLAN.md`, including recent image upload/profile/cover and visual-customization requirements.

## Not implemented in this milestone

Neon Auth/Functions/PostgreSQL, production task persistence, server-side authorization, real notifications, exact tracked time, recoverable Trash, uploads, rich editor, true computed reports, drag-and-drop, multi-user data and Android package.

## Verification

- **PASS:** `node --check app.js`.
- Content: presence of Home/Tasks/Plan/Calendar/Workspaces/Notes/Reports/Settings screens and independent deadline/reminder controls.
- **PASS:** Playwright + Chromium mobile smoke flow (`python3 tests/smoke.py`): task create with reminder hour, day pool, timed interval, quick note, theme selection, task details, confirmation-before-delete and no page errors.
- **PASS:** Chromium desktop (1440px) and mobile (390px) visual screenshots were inspected.
- **Known gap:** Browser smoke uses a localStorage shim because container security policy blocks browser navigation to local origins; actual served-page loading was not verified end-to-end in this environment.

## Repository safety

Original code backed up to `backup/legacy-canvas-20261106`. GitHub `home-planner` is now the explicit destination requested by the user. Replaced code files are absent from the new source tree. Quizer, Mimo and all Neon projects unchanged.

## Next milestone

M1.2 — refined visual system, image/cover treatments, accessibility review, and design polish. Do not begin without approval.
