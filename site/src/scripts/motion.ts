/**
 * Motion of the page itself (the 3D scene has a loop of its own):
 *
 *  - Reveals: content comes in once, when it first enters the viewport, and then stays.
 *    One IntersectionObserver does it; the chart's bars grow from the same class (see
 *    `.chart` in sections.css).
 *  - Parallax: elements with `data-speed` drift against the page as it scrolls.
 *  - Tracks: a line with `data-track` fills as the page scrolls past it, and the marks along
 *    it light up as the fill reaches them. (The reading progress in the nav is not one of
 *    them: see nav.ts.)
 *
 * Where things are is measured when the layout changes, never while scrolling, so a scroll
 * frame is arithmetic and a few style writes: it reads nothing from the page.
 */

declare global {
  interface Window {
    __motion?: boolean;
  }
}

window.__motion = true;

/* ───────── reveals ───────── */
const targets = document.querySelectorAll<HTMLElement>('[data-reveal]');

if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        // what already lies above the viewport (a reload half-way down, a jump to a section)
        // is shown at once: nothing should fade in while scrolling back up
        const above = entry.boundingClientRect.bottom <= 0;
        if (!entry.isIntersecting && !above) continue;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -6% 0px' },
  );
  targets.forEach((el) => io.observe(el));
} else {
  targets.forEach((el) => el.classList.add('is-in'));
}

/* ───────── parallax ─────────
   data-speed="0.1": the element moves by a tenth of its distance from the middle of the
   viewport (positive: it lags behind the page, negative: it runs ahead).
   data-speed-desktop: the same, from 1024 px only.
   data-speed-limit="24": the drift never exceeds that many pixels either way. */
interface Drifter {
  el: HTMLElement;
  speed: number;
  desktopOnly: boolean;
  limit: number;
  /** the middle of the element in the document, without its own drift */
  centre: number;
  half: number;
  /** the drift as last written */
  offset: number;
}

const reduceMq = matchMedia('(prefers-reduced-motion: reduce)');
const desktopMq = matchMedia('(min-width: 1024px)');
const drifters: Drifter[] = [];

document.querySelectorAll<HTMLElement>('[data-speed], [data-speed-desktop]').forEach((el) => {
  const desktopOnly = el.dataset.speed === undefined;
  const speed = Number(desktopOnly ? el.dataset.speedDesktop : el.dataset.speed) || 0;
  if (speed === 0) return;
  const limit = Number(el.dataset.speedLimit) || Infinity;
  drifters.push({ el, speed, desktopOnly, limit, centre: 0, half: 0, offset: 0 });
});

/* ───────── tracks ─────────
   data-track: a line that fills. Its child with data-track-fill gets --fill, from 0 to 1: how
   far the reading line (a little below the middle of the viewport) has come down the track.
   data-track-mark: marks along the track; each gets the class is-reached when the reading
   line has passed its middle. Track and marks are looked up and measured inside the parent
   of the track, which must be positioned (position: relative). That parent gets the class
   has-track, so the styles can show a full line and lit marks until the script runs. */
interface Mark {
  el: HTMLElement;
  /** the middle of the mark, from the top of the root */
  at: number;
  reached: boolean;
}

interface Track {
  el: HTMLElement;
  fill: HTMLElement;
  root: HTMLElement;
  /** the top of the root in the document */
  rootTop: number;
  /** the track inside the root */
  top: number;
  height: number;
  marks: Mark[];
  /** the fill as last written */
  value: number;
}

/** the reading line, as a part of the viewport height from the top */
const READING_LINE = 0.55;
const tracks: Track[] = [];

document.querySelectorAll<HTMLElement>('[data-track]').forEach((el) => {
  const fill = el.querySelector<HTMLElement>('[data-track-fill]');
  const root = el.parentElement;
  if (!fill || !root) return;
  const marks = Array.from(root.querySelectorAll<HTMLElement>('[data-track-mark]'), (mark) => ({
    el: mark,
    at: 0,
    reached: false,
  }));
  root.classList.add('has-track');
  tracks.push({ el, fill, root, rootTop: 0, top: 0, height: 1, marks, value: -1 });
});

/** the top of an element inside a positioned ancestor, whatever is transformed in between */
function topWithin(el: HTMLElement, root: HTMLElement): number {
  let top = 0;
  for (let node: HTMLElement | null = el; node && node !== root; node = node.offsetParent as HTMLElement | null) {
    top += node.offsetTop;
  }
  return top;
}

if (drifters.length || tracks.length) {
  let viewHeight = window.innerHeight;
  let scrollY = window.scrollY;
  let still = reduceMq.matches;
  let desktop = desktopMq.matches;
  let queued = false;

  // reads layout: only when the layout can have changed
  const measure = (): void => {
    viewHeight = window.innerHeight;
    scrollY = window.scrollY;
    for (const d of drifters) {
      const rect = d.el.getBoundingClientRect();
      d.half = rect.height / 2;
      d.centre = rect.top + scrollY - d.offset + d.half;
    }
    for (const t of tracks) {
      t.rootTop = t.root.getBoundingClientRect().top + scrollY;
      t.top = t.el.offsetTop;
      t.height = Math.max(1, t.el.offsetHeight);
      for (const m of t.marks) m.at = topWithin(m.el, t.root) + m.el.offsetHeight / 2;
    }
  };

  // Runs once per frame while scrolling, after the 3D scene has written its styles for that
  // frame. It reads nothing from the page: even window.scrollY would make the browser work
  // out those styles on the spot, a second time in the same frame.
  const apply = (): void => {
    queued = false;
    for (const d of drifters) {
      let offset = 0;
      if (!still && (!d.desktopOnly || desktop)) {
        const fromMiddle = d.centre - scrollY - viewHeight / 2;
        // far outside the viewport nothing is seen: leave the style as it is
        if (Math.abs(fromMiddle) > viewHeight * 1.5 + d.half) continue;
        offset = Math.max(-d.limit, Math.min(d.limit, Math.round(fromMiddle * d.speed * 10) / 10));
      }
      if (offset === d.offset) continue;
      d.offset = offset;
      if (offset === 0) d.el.style.removeProperty('--py');
      else d.el.style.setProperty('--py', `${offset}px`);
    }
    // a track follows the scroll position also with reduced motion: it is a reading aid
    // that moves only as far as the reader scrolls, not an animation
    for (const t of tracks) {
      const line = scrollY + viewHeight * READING_LINE - t.rootTop;
      const value = Math.round(Math.max(0, Math.min(1, (line - t.top) / t.height)) * 10000) / 10000;
      if (value !== t.value) {
        t.value = value;
        t.fill.style.setProperty('--fill', String(value));
      }
      for (const m of t.marks) {
        const reached = line >= m.at;
        if (reached === m.reached) continue;
        m.reached = reached;
        m.el.classList.toggle('is-reached', reached);
      }
    }
  };

  const queue = (): void => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(apply);
  };
  // the scroll position is read here, at the start of the frame, where it costs nothing
  const onScroll = (): void => {
    scrollY = window.scrollY;
    queue();
  };
  const relayout = (): void => {
    measure();
    queue();
  };
  const onMedia = (): void => {
    still = reduceMq.matches;
    desktop = desktopMq.matches;
    queue();
  };

  measure();
  apply();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', relayout);
  // fonts and images arrive after the first measure and move everything below them
  if ('ResizeObserver' in window) new ResizeObserver(relayout).observe(document.body);
  reduceMq.addEventListener('change', onMedia);
  desktopMq.addEventListener('change', onMedia);
}

export {};
