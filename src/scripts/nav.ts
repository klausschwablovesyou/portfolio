/**
 * Navigation: scroll progress bar, active section highlight, and the language switch,
 * which remembers the choice in a cookie and keeps the current section.
 */

const progressBar = document.querySelector<HTMLElement>('[data-progress]');
const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-nav-link]'));
const langLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-lang-switch]'));

let activeId = '';

/* ───────── progress bar ───────── */
let queued = false;
function updateProgress(): void {
  queued = false;
  if (!progressBar) return;
  const max = document.documentElement.scrollHeight - window.innerHeight;
  const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
  progressBar.style.setProperty('--progress', p.toFixed(4));
}
function queueProgress(): void {
  if (queued) return;
  queued = true;
  requestAnimationFrame(updateProgress);
}
window.addEventListener('scroll', queueProgress, { passive: true });
window.addEventListener('resize', queueProgress);
updateProgress();

/* ───────── active section ─────────
   Every section with an id counts, so the language switch can keep any of them;
   only the ones in the nav get highlighted. */
function setActive(id: string): void {
  if (id === activeId) return;
  activeId = id;
  for (const link of links) {
    const on = link.dataset.navLink === id;
    link.classList.toggle('is-active', on);
    if (on) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  }
  for (const link of langLinks) {
    const base = link.getAttribute('href')?.split('#')[0] ?? '/';
    link.setAttribute('href', id && id !== 'top' ? `${base}#${id}` : base);
  }
}

const sections = Array.from(document.querySelectorAll<HTMLElement>('main section[id]'));
if ('IntersectionObserver' in window && sections.length) {
  const visible = new Set<HTMLElement>();
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) visible.add(e.target as HTMLElement);
        else visible.delete(e.target as HTMLElement);
      }
      // The topmost section crossing the reading line wins.
      const current = sections.find((s) => visible.has(s));
      setActive(current ? current.id : '');
    },
    { rootMargin: '-45% 0px -54% 0px' },
  );
  sections.forEach((s) => io.observe(s));
}

/* ───────── language switch ───────── */
for (const link of langLinks) {
  link.addEventListener('click', () => {
    const lang = link.dataset.langSwitch;
    if (lang) document.cookie = `lang=${lang}; path=/; max-age=31536000; samesite=lax`;
  });
}

export {};
