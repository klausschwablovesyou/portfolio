/**
 * Reveals: content comes in once, when it first enters the viewport, and then stays.
 * One IntersectionObserver does it; nothing runs on scroll and nothing reads layout.
 * The chart's bars grow from the same class (see `.chart` in sections.css).
 */

declare global {
  interface Window {
    __motion?: boolean;
  }
}

window.__motion = true;

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

export {};
