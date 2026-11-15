# Incargo cinematic home — 2026-11-15

- Scope: public home only. Existing client, tracking, operations, activation, quotation submission and API implementation remain unchanged.
- Visual assets: existing repository images `img/8.jpg`, `img/2.jpg`, `img/6.jpg`; no third-party assets introduced. This edition uses photographic transitions, not video.
- Desktop: native scrolling, sticky photographic stage, crossfades and restrained transform-only camera motion. Pause control available. No scroll hijacking.
- Mobile and reduced motion: static photos per section, all content and links remain available. Navigation works without Bootstrap JS or jQuery.
- QA: Chrome headless 1440×1000 and 390×844; visual screenshots reviewed; no page exceptions; no horizontal overflow; single h1; all local .html destinations return 200; mobile menu and Escape tested; reduced motion stage hidden; pause aria-pressed tested. Existing form action retained; no real enquiry submitted. No authentication or operational data mutations performed.
