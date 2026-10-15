# Incargo public-site redesign QA — 15 October 2026

Base and remote `main` checked at `08a9e60826c4e84d6cc90b346268d5ea196f1963`. No push or deployment.

## Visual evidence

- `incargo-before-desktop.png`, `incargo-before-mobile.png`: original home, 1440×900 and 390×844.
- `incargo-index-desktop.png`, `incargo-index-mobile.png`: redesigned home at those viewports.
- `incargo-service-desktop.png`, `incargo-service-mobile.png`, `incargo-quote-desktop.png`, `incargo-quote-mobile.png`: shared pages.

Screenshots were taken in headless Chromium with reduced motion. The original captures show a loading overlay while external scripts were pending; the redesign removes the overlay at DOM ready as a fallback.

## Checks

- `python3 -m unittest discover -s incargo-app/tests -v`: 3 passed.
- `node incargo-app/tests/browser.test.cjs`: passed existing local operations flow.
- `node incargo-app/tests/activation.test.cjs`: passed invite and recovery fixture flow.
- Playwright audit: all 17 public HTML pages at 1440×900 and 390×844 had no horizontal overflow, stuck spinner, or missing relative link target. Home, Services, and Quote had no broken loaded images.
- Keyboard: first Tab reaches skip link; Enter opens mobile menu and dropdown with `aria-expanded=true`; reduced-motion media query active. Home quote form has five associated labels. No forms were submitted.
- `git diff --check`: passed.

## Limits

This checks local static pages and fixture flows. It does not validate real Auth accounts, outbound form delivery, Apps Script, Supabase operations, or production E2E. External network assets can behave differently in production. Publication policy for this repo remains unresolved in the repository documentation.
