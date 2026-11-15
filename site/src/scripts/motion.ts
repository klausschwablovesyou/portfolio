/**
 * Scroll-driven motion without a library: reveals (in and out), parallax, counters, the experience
 * timeline and card tilt. One IntersectionObserver for reveals, one rAF-scheduled update
 * for everything that depends on the scroll position.
 */

declare global {
  interface Window {
    __motion?: boolean;
  }
}

window.__motion = true;

const reduceMq = matchMedia('(prefers-reduced-motion: reduce)');
const desktopMq = matchMedia('(min-width: 1024px)');
const finePointer = matchMedia('(hover: hover) and (pointer: fine)');

/* ───────── reveal on scroll ───────── */
const revealTargets = document.querySelectorAll<HTMLElement>('[data-reveal]');

// Text comes in when it enters the viewport and goes out again when it leaves, in the
// direction it leaves: upwards past the top edge, downwards past the bottom. The band is a
// little narrower than the viewport, so the exit is still seen (and clears the fixed nav).
const counted = new WeakSet<Element>();
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const el = entry.target;
        if (entry.isIntersecting) {
          el.classList.add('is-in');
          el.classList.remove('is-above');
          if (!counted.has(el)) {
            counted.add(el);
            el.querySelectorAll<HTMLElement>('[data-count]').forEach(countUp);
          }
        } else {
          el.classList.remove('is-in');
          const root = entry.rootBounds;
          el.classList.toggle('is-above', !!root && entry.boundingClientRect.bottom <= root.top);
        }
      }
    },
    { rootMargin: '-10% 0px -8% 0px', threshold: 0 },
  );
  revealTargets.forEach((el) => io.observe(el));
} else {
  revealTargets.forEach((el) => el.classList.add('is-in'));
}

/* ───────── counting numbers ───────── */
function countUp(el: HTMLElement): void {
  const target = Number(el.dataset.count);
  if (!Number.isFinite(target) || reduceMq.matches) return;
  const duration = 1400;
  const start = performance.now();
  el.textContent = '0';
  const step = (now: number) => {
    const p = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = String(Math.round(target * eased));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ───────── scroll-linked updates ───────── */
interface ParallaxItem {
  el: HTMLElement;
  speed: number;
  desktopOnly: boolean;
  offset: number;
}

const parallaxItems: ParallaxItem[] = [];
document.querySelectorAll<HTMLElement>('[data-speed], [data-speed-desktop]').forEach((el) => {
  const desktopOnly = el.dataset.speed === undefined;
  const speed = Number(desktopOnly ? el.dataset.speedDesktop : el.dataset.speed) || 0;
  if (speed !== 0) parallaxItems.push({ el, speed, desktopOnly, offset: 0 });
});

const timeline = document.querySelector<HTMLElement>('[data-timeline]');
const timelineFill = document.querySelector<HTMLElement>('[data-timeline-fill]');
const jobs = Array.from(document.querySelectorAll<HTMLElement>('[data-job]'));

let scheduled = false;

function update(): void {
  scheduled = false;
  const vh = window.innerHeight;
  const still = reduceMq.matches;

  // Parallax: offset proportional to the element's distance from the viewport centre.
  for (const item of parallaxItems) {
    const active = !still && (!item.desktopOnly || desktopMq.matches);
    if (!active) {
      if (item.offset !== 0) {
        item.offset = 0;
        item.el.style.removeProperty('--py');
      }
      continue;
    }
    const rect = item.el.getBoundingClientRect();
    // Measure the untranslated position, so the offset does not feed back into itself.
    const centre = rect.top - item.offset + rect.height / 2;
    if (centre < -vh || centre > vh * 2) continue;
    const offset = (centre - vh / 2) * item.speed;
    item.offset = offset;
    item.el.style.setProperty('--py', `${offset.toFixed(1)}px`);
  }

  // Experience timeline: the line fills up to a reading line at 55% of the viewport.
  if (timeline && timelineFill) {
    const rect = timeline.getBoundingClientRect();
    const readLine = vh * 0.55;
    const fill = Math.min(1, Math.max(0, (readLine - rect.top) / rect.height));
    timelineFill.style.setProperty('--fill', fill.toFixed(4));
    for (const job of jobs) {
      job.classList.toggle('is-active', job.getBoundingClientRect().top + 12 < readLine);
    }
  }
}

function schedule(): void {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(update);
}

window.addEventListener('scroll', schedule, { passive: true });
window.addEventListener('resize', schedule);
reduceMq.addEventListener('change', schedule);
desktopMq.addEventListener('change', schedule);
update();

/* ───────── card tilt and glare ───────── */
document.querySelectorAll<HTMLElement>('[data-tilt]').forEach((card) => {
  card.addEventListener('pointermove', (event) => {
    if (reduceMq.matches || !finePointer.matches) return;
    const rect = card.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    card.classList.add('is-tilting');
    card.style.setProperty('--ry', `${((x - 0.5) * 9).toFixed(2)}deg`);
    card.style.setProperty('--rx', `${((0.5 - y) * 7).toFixed(2)}deg`);
    card.style.setProperty('--gx', `${(x * 100).toFixed(1)}%`);
    card.style.setProperty('--gy', `${(y * 100).toFixed(1)}%`);
  });
  card.addEventListener('pointerleave', () => {
    card.classList.remove('is-tilting');
    card.style.setProperty('--rx', '0deg');
    card.style.setProperty('--ry', '0deg');
  });
});

export {};
