// welcome.js — ChatBridge on-install page
// Scroll reveals · count-up · spotlight · nav scroll

(function () {
  'use strict';

  // ── Button wiring ─────────────────────────────────
  const bind = (id, fn) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', fn);
  };

  const openOptions = () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
    }
  };

  bind('btn-go-chat',     () => chrome.tabs.create({ url: 'https://chatgpt.com/' }));
  bind('btn-options',     openOptions);
  bind('btn-options-nav', openOptions);
  bind('btn-dashboard',   openOptions);

  // ── Nav scroll shadow ─────────────────────────────
  const nav = document.querySelector('.nav');
  if (nav) {
    let ticking = false;
    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          nav.classList.toggle('scrolled', window.scrollY > 30);
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });
  }

  // ── Scroll reveal (rv + rv-children) ──────────────
  const reveals = document.querySelectorAll('.rv, .rv-children');
  if ('IntersectionObserver' in window && reveals.length) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            e.target.classList.add('visible');
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: '0px 0px -40px 0px' }
    );
    reveals.forEach(el => io.observe(el));
  }

  // ── Animated counters ─────────────────────────────
  const counters = document.querySelectorAll('.stat-num[data-count]');
  if ('IntersectionObserver' in window && counters.length) {
    const countIO = new IntersectionObserver(
      (entries) => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            animateCount(e.target);
            countIO.unobserve(e.target);
          }
        });
      },
      { threshold: 0.5 }
    );
    counters.forEach(el => countIO.observe(el));
  }

  function animateCount(el) {
    const target = parseInt(el.dataset.count, 10);
    const duration = 1200;
    const start = performance.now();
    const ease = t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // easeInOutQuad

    function tick(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      el.textContent = Math.round(ease(progress) * target);
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // ── Card spotlight (mouse follow glow) ────────────
  document.addEventListener('mousemove', (e) => {
    const cards = document.querySelectorAll('.b-card');
    cards.forEach(card => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      card.style.setProperty('--mx', x + 'px');
      card.style.setProperty('--my', y + 'px');
    });
  }, { passive: true });

})();
