# Dayframe UI checkpoint — profile navigation and account bar removal
Date: 2026-11-07. Scope: narrow UI change requested by user.

## Done
- Removed top horizontal account bar from signed-in application and local demo.
- Sidebar identity now shows the current account name and initials; avatar in desktop header and mobile header is a button to Profile.
- Profile page shows account display name and email when authenticated, refreshes saved task/workspace data, and signs out.
- For the local demonstration, Profile says "Local demo" and offers Return to sign in instead.
- Loading/recovery error view continues to expose sign-out access if task sync is unavailable.
- Timer still occupies the existing task-specific bar only when tracking.
- No new database tables, no credentials or profile editing, no hosting change and no changes to the upcoming full profile milestone.

## Verification
- Run `npm run test:source`, `npm run test:time`, `npm run build`, `npm run check:dist` in CI.
- Test both desktop and mobile profile access and sign-out manually; the automated source test checks wiring, not end-to-end account behavior.
- Account profile edits / avatar uploads / account deletion remain intentionally deferred.
- Branch-based GitHub Pages publishing stays on `main` only.
