(() => {
  const story = document.querySelector('.route-story');
  if (!story) return;
  const stage = story.querySelector('.route-stage');
  const photos = [...story.querySelectorAll('.route-image')];
  const chapters = [...story.querySelectorAll('.route-chapter')];
  const links = [...story.querySelectorAll('.route-chapter-nav a')];
  const pause = story.querySelector('.route-motion');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const compact = matchMedia('(max-width: 700px)');
  let paused = false, frame = 0;
  const paint = () => {
    frame = 0;
    if (paused || reduced.matches || compact.matches) return;
    const rect = story.getBoundingClientRect();
    const progress = Math.max(0, Math.min(1, (78 - rect.top) / (rect.height - innerHeight + 78)));
    story.style.setProperty('--progress', progress);
    let active = 0;
    chapters.forEach((chapter, i) => { if (chapter.getBoundingClientRect().top < innerHeight * .55) active = i; });
    photos.forEach((photo, i) => {
      photo.classList.toggle('is-current', i === active);
      photo.style.transform = `scale(${1.04 + progress * .055}) translateX(${(progress - .5) * 1.5}%)`;
    });
    links.forEach((link, i) => { link.classList.toggle('is-current', i === active); if (i === active) link.setAttribute('aria-current', 'step'); else link.removeAttribute('aria-current'); });
    stage.classList.toggle('is-right', active === 1);
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(paint); };
  pause.addEventListener('click', () => {
    paused = !paused;
    pause.setAttribute('aria-pressed', String(paused));
    pause.textContent = paused ? 'Reanudar movimiento' : 'Pausar movimiento';
    story.classList.toggle('route-static', paused);
    schedule();
  });
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', schedule, { passive: true });
  reduced.addEventListener('change', schedule);
  compact.addEventListener('change', schedule);
  schedule();
})();
const menu = document.querySelector('.cin-menu');
menu?.addEventListener('click', () => {
 const open = menu.getAttribute('aria-expanded') !== 'true';
 menu.setAttribute('aria-expanded', String(open));
 document.querySelector('.cin-links').classList.toggle('is-open', open);
});
document.addEventListener('keydown', event => {
 if (event.key === 'Escape') {
  document.querySelectorAll('.cin-links details[open]').forEach(el => el.open = false);
  if (menu?.getAttribute('aria-expanded') === 'true') { menu.click(); menu.focus(); }
 }
});
