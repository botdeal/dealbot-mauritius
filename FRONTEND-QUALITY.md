# Frontend quality pass — continuation of 790a302

Only supabase-integration. No Admitad connection, main change or database mutation.

## Implemented

- Central FR/EN message catalog in i18n.js. Static interface text and accessibility attributes use explicit data-i18n markers; dynamic messages call the same translator. No DOM observer, external translation API or translation of merchant-provided descriptions/user messages.
- Language preference persists under the existing storage key. Initial rendering, catalog status, account controls, price-history dates and advertisement labels respect it. Switching language clears stale native validation messages.
- Localized form validation; raw backend errors are no longer appended to signup/contact/admin messages.
- Static copy corrected: authentication already exists; catalog administration is not described as managing test offers.
- Local server explicitly serves the new i18n.js resource with JavaScript MIME type and existing security headers.
- Long-label safeguards: grid/flex children can shrink; account text ellipsizes; long headings/messages wrap; forms stay within their containers; comparison/admin tables scroll within their wrappers; mobile navigation and modals use dynamic viewport height. These are code-level safeguards, not a claim that mobile screenshots have been verified.

## Verification scope

47 automated Node tests (42 previous plus five frontend quality tests). The added tests cover all static translation markers, all literal translation keys, every route with English rendering and zero captured JSDOM runtime exceptions, saved language on a fresh page, translated guest/validation flows, and hamburger/Escape/navigation state. Existing mock-backed tests cover login/signup, favorites, comparison, alerts, profile-related state and admin persistence. They are not real browser authentication tests.

The real preview redirects this browser to Vercel login. The Vercel connector currently returns an empty teams list; the GitHub status for 790a302 reports a successful Vercel deployment. The browser cannot reach the local server either (ERR_BLOCKED_BY_CLIENT). No screenshot audit, actual viewport/overflow measurement or complete real-browser runtime/network audit is claimed.

FULL FR/EN: implemented for application-owned interface text and automated checks; final preview verification pending. Product names, descriptions, merchant names and user messages are source content and are not machine-translated.

FRONTEND READY BEFORE ADMITAD: NO until the current branch preview is accessible for desktop/mobile and real authenticated-route verification. No real catalog has been invented.

## Vercel CSP feedback warning

The reported /_vercel/live/.../feedback.js resource belongs to Vercel Toolbar/Comments. No DealBot source imports or depends on it. DealBot keeps script-src 'self'; no vercel.live allowance, unsafe-eval or unsafe-inline for scripts was added. A same-origin-looking injected URL can redirect to vercel.live, which remains outside script-src 'self'. The exact blocked URL/redirect in this user's console has not been captured because preview login blocks this browser.

Blocking that optional feedback resource disables Vercel feedback, not DealBot's own scripts. This does not prove the absence of unrelated DealBot errors on the protected preview.

Official Vercel documentation provides a clean solution: disable Toolbar for the Preview environment in project settings, or set VERCEL_PREVIEW_FEEDBACK_ENABLED=0 specifically for supabase-integration. Automated tests can send x-vercel-skip-toolbar. Those platform settings have not been changed because the connector exposes no team. Hiding console errors or removing CSP is not a fix.

Reference: https://vercel.com/docs/vercel-toolbar/managing-toolbar

## Remaining verification

- Confirm the new commit's preview deployment and inspect its desktop/mobile render.
- Capture real console/network output across routes; verify actual account, recovery and admin flows after the user securely signs in where required.
- Resolve any real runtime/layout issue observed there. Current test fixtures remain confined to automated tests; no live test records were created.
