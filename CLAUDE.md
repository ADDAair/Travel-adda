# Travel Adda – Haj & Umrah Assistant (project rules)

Stack: React Native + Expo (SDK 58), Supabase (Postgres + RLS). Android first.
Owner is non-technical; Claude does the work end to end. Security is top priority.

## Permanent product principles (full text: docs/master-principles-bn.md — follow it)
1. Never replace the existing concept; improve step by step on existing code. Don't rewrite working features or change architecture without reason.
2. Bengali first: all user-visible text in simple, natural Bengali; Bengali digits for display; keep i18n-ready (strings in src/strings.js).
3. One main task per screen; few options; next step always obvious; short forms.
4. Built for elderly / low-literacy / first-time users: body text 18–20, primary buttons 56–64 high, touch targets ≥ 48dp, strong contrast, icon + Bengali label, never color-only meaning, layouts survive large system font, accessibility labels everywhere.
5. Premium, modern, consistent look (tokens in src/theme.js) — no decoration that hurts usability.
6. One-time hands-on tutorial (skippable, replayable from Account).
7. Every button says exactly what it does; loading, success and failure states in plain Bengali.
8. Prevent errors, keep entered data on failure, confirm destructive actions, block double submit, never show success unless it really succeeded.
9. Voice/TTS/smart help only when it truly helps; app must work without it.
10–11. Verify every changed flow; CI (expo-doctor + export + APK build) must pass; no secrets in code (only Supabase publishable key).
12. Never claim usability is proven without real-user tests (plan: docs/usability-test-plan-bn.md).
14. No fake data or non-working buttons presented as working — unfinished features must be clearly labelled "শীঘ্রই আসছে".

Priority order: clarity > ease > accessibility > reliability > speed > beauty > uniqueness.

## Testing (permanent rule: TDD — owner request Oct 2026)
- Test first: for every new feature or bug fix, first write a test that fails (shows the missing behaviour / the bug), then write the code until it passes, then clean up. Never delete or weaken a test to make it pass.
- Unit tests (app logic, src/lib): tests/unit/*.test.mjs, `npm run test:unit` (node:test; tests/unit/register.mjs fakes React Native/Expo/Supabase).
- Database integration tests: tests/sql/tNN.sh (one suite per SQL step), all run by `npm run test:db` (tests/sql/run_all.sh). Every new SQL file gets a suite.
- Server function tests: supabase/functions/*/index_test.ts (Deno).
- End-to-end on the real database: tests/groups_e2e.py + tests/groups_api.mjs (workflow groups-e2e, also every night).
- CI runs unit + static + export (check.yml), database suites (db-tests.yml) and function tests (otp-test.yml) on EVERY push; all must be green before telling the owner something works.

## Latest technology (permanent rule — owner request Oct 2026)
- New work uses the latest stable versions/technology. Existing code is moved up step by step (one Expo SDK at a time,
  TypeScript file by file), never all at once: explain the reason, ask the owner (options + consequences), then do it,
  keeping every feature working (all tests + CI + APK + owner phone check after each step).
- Status Oct 2026: app on Expo SDK 58 (RN 0.88, React 19.3, Hermes v1, R8 in release builds) — the latest. App code is JavaScript.

## Workflow
- Push to main triggers .github/workflows/check.yml. Read failures via check-run annotations (logs API is blocked).
- APK: dispatch .github/workflows/build-apk.yml (REST: POST actions/workflows/build-apk.yml/dispatches).
- DB changes: new numbered SQL file in supabase/, idempotent, RLS on every table; owner runs it in SQL Editor.
