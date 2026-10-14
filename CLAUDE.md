# Travel Adda – Haj & Umrah Assistant (project rules)

Stack: React Native + Expo (SDK 54), Supabase (Postgres + RLS). Android first.
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

## Workflow
- Push to main triggers .github/workflows/check.yml. Read failures via check-run annotations (logs API is blocked).
- APK: dispatch .github/workflows/build-apk.yml (REST: POST actions/workflows/build-apk.yml/dispatches).
- DB changes: new numbered SQL file in supabase/, idempotent, RLS on every table; owner runs it in SQL Editor.
