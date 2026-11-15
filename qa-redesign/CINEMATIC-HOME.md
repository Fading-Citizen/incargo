# Incargo cinematic home — 2026-11-15

- Scope: public home only. Existing client, tracking, operations, activation, quotation submission and API implementation remain unchanged.
- Visual assets: existing repository images `img/8.jpg`, `img/2.jpg`, `img/6.jpg`; no third-party assets introduced. This edition uses photographic transitions, not video.
- Desktop: native scrolling, sticky photographic stage, crossfades and restrained transform-only camera motion. Pause control available. No scroll hijacking.
- Mobile and reduced motion: static photos per section, all content and links remain available. Navigation works without Bootstrap JS or jQuery.
- QA: Chrome headless 1440×1000 and 390×844; visual screenshots reviewed; no page exceptions; no horizontal overflow; single h1; all local .html destinations return 200; mobile menu and Escape tested; reduced motion stage hidden; pause aria-pressed tested. Existing form action retained; no real enquiry submitted. No authentication or operational data mutations performed.

## Desktop sticky-boundary regression correction

Reproduced the reported desktop problem: the sticky photo stage with a negative bottom margin painted and intercepted pointer events over the following services section. Replaced that negative-margin overlap with a shared CSS grid area, explicit stacking order and an isolated story context. The photo now stops exactly at the story boundary.

Regression: 1920×1080, 1440×900, 1366×768, 1024×768, 768×1024 and 390×844, each in light/dark preference. All service/portal/form/footer hit tests pass; scrolling reaches page bottom; no horizontal overflow or JS exceptions. Reduced-motion static layout verified. Form success flow tested with an intercepted local mock response only, without sending a real enquiry.
