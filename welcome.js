// welcome.js — ChatBridge on-install page

(function () {
  'use strict';

  // ── CTA buttons ───────────────────────────────────
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

  // ── Reveal-on-scroll ──────────────────────────────
  const reveals = document.querySelectorAll('.section-inner, .hero-inner');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); } }),
      { threshold: 0.08 }
    );
    reveals.forEach(el => { el.classList.add('reveal'); io.observe(el); });
  }
})();
