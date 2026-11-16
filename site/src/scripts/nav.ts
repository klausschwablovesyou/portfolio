/**
 * Navigation: the tone of the bar (ink over dark sections, paper over light ones, nothing
 * while the hero is at rest), the active section, the reading progress, and the language
 * switch, which remembers the choice in a cookie and keeps the current section.
 * Everything is driven by observers: no handler reads layout while the page scrolls.
 */

const nav = document.querySelector<HTMLElement>('[data-nav]');
const progressBar = document.querySelector<HTMLElement>('[data-progress]');
const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-nav-link]'));
const langLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-lang-switch]'));
const hasIo = 'IntersectionObserver' in window;

/* ───────── tone of the bar ───────── */
if (nav && hasIo) {
  // scrolled or not: a marker at the very top of the page
  const top = document.createElement('div');
  top.setAttribute('aria-hidden', 'true');
  top.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:1px;pointer-events:none';
  document.body.prepend(top);
  new IntersectionObserver(([entry]) => nav.classList.toggle('is-scrolled', !entry.isIntersecting), {
    rootMargin: '24px 0px 0px 0px',
  }).observe(top);

  // paper or ink: which kind of section crosses the middle line of the bar
  const lights = Array.from(document.querySelectorAll('.light'));
  const under = new Set<Element>();
  let toneIo: IntersectionObserver | undefined;
  const watchTone = (): void => {
    toneIo?.disconnect();
    under.clear();
    const line = Math.round(nav.offsetHeight / 2);
    toneIo = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) under.add(e.target);
          else under.delete(e.target);
        }
        nav.classList.toggle('on-light', under.size > 0);
      },
      { rootMargin: `-${line}px 0px -${Math.max(0, window.innerHeight - line - 1)}px 0px` },
    );
    lights.forEach((el) => toneIo?.observe(el));
  };
  watchTone();
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(watchTone, 150);
  });
}

/* ───────── reading progress ─────────
   Scroll-driven in CSS where the browser can (sections.css). Otherwise from scrollY, with the
   scroll range measured only when the page changes size, never while scrolling. */
if (progressBar && !CSS.supports('animation-timeline: scroll()')) {
  let max = 1;
  let queued = false;
  const update = (): void => {
    queued = false;
    progressBar.style.setProperty('--progress', Math.min(1, Math.max(0, window.scrollY / max)).toFixed(4));
  };
  const measure = (): void => {
    max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    update();
  };
  window.addEventListener(
    'scroll',
    () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(update);
    },
    { passive: true },
  );
  window.addEventListener('resize', measure);
  if ('ResizeObserver' in window) new ResizeObserver(measure).observe(document.body);
  measure();
}

/* ───────── active section ─────────
   Every section with an id counts, so the language switch can keep any of them;
   only the ones in the nav get highlighted. */
let activeId = '';

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
if (hasIo && sections.length) {
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
