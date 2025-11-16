const DOMUtils = (() => {
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, Number(ms) || 0));
  }

  async function waitFor(predicate, opts = {}) {
    const timeout = opts.timeoutMs || 8000;
    const interval = opts.intervalMs || 100;
    const started = Date.now();
    
    while ((Date.now() - started) < timeout) {
      try {
        const result = typeof predicate === 'function' ? await predicate() : null;
        if (result) return result;
      } catch (e) {}
      await sleep(interval);
    }
    return null;
  }

  function qs(selector, root = document) {
    try {
      return root.querySelector(selector);
    } catch (e) {
      return null;
    }
  }

  function qsa(selector, root = document) {
    try {
      return Array.from(root.querySelectorAll(selector));
    } catch (e) {
      return [];
    }
  }

  function isVisible(element) {
    if (!element) return false;
    try {
      const style = window.getComputedStyle(element);
      return style.display !== 'none' && 
             style.visibility !== 'hidden' && 
             style.opacity !== '0' &&
             element.offsetHeight > 0;
    } catch (e) {
      return false;
    }
  }

  async function waitForElement(selector, opts = {}) {
    const root = opts.root || document;
    const timeout = opts.timeoutMs || 5000;
    
    return waitFor(() => {
      const el = qs(selector, root);
      return (el && isVisible(el)) ? el : null;
    }, { timeoutMs: timeout, intervalMs: opts.intervalMs || 100 });
  }

  function scrollToElement(element, options = {}) {
    if (!element) return;
    try {
      element.scrollIntoView({
        behavior: options.smooth !== false ? 'smooth' : 'auto',
        block: options.block || 'nearest',
        inline: options.inline || 'nearest'
      });
    } catch (e) {}
  }

  async function waitForStability(container, stableMs = 150, timeoutMs = 2000) {
    let lastHeight = -1;
    let stableCount = 0;
    const requiredStable = Math.ceil(stableMs / 50);
    const started = Date.now();

    while ((Date.now() - started) < timeoutMs) {
      const currentHeight = container ? container.scrollHeight : document.body.scrollHeight;
      
      if (currentHeight === lastHeight) {
        stableCount++;
        if (stableCount >= requiredStable) return true;
      } else {
        stableCount = 0;
        lastHeight = currentHeight;
      }
      
      await sleep(50);
    }
    return false;
  }

  function getScrollableParent(element) {
    if (!element) return null;
    
    let parent = element.parentElement;
    while (parent) {
      try {
        const style = window.getComputedStyle(parent);
        const overflow = style.overflow + style.overflowY;
        if (/(auto|scroll)/.test(overflow) && parent.scrollHeight > parent.clientHeight) {
          return parent;
        }
      } catch (e) {}
      parent = parent.parentElement;
    }
    return document.documentElement;
  }

  function debounce(func, delay = 300) {
    let timeoutId;
    return function debounced(...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
  }

  function createElementFromHTML(html) {
    const template = document.createElement('template');
    template.innerHTML = html.trim();
    return template.content.firstChild;
  }

  function removeClass(element, className) {
    if (element && element.classList) {
      element.classList.remove(className);
    }
  }

  function addClass(element, className) {
    if (element && element.classList) {
      element.classList.add(className);
    }
  }

  function toggleClass(element, className) {
    if (element && element.classList) {
      element.classList.toggle(className);
    }
  }

  return {
    sleep,
    waitFor,
    qs,
    qsa,
    isVisible,
    waitForElement,
    scrollToElement,
    waitForStability,
    getScrollableParent,
    debounce,
    createElementFromHTML,
    removeClass,
    addClass,
    toggleClass
  };
})();

if (typeof window !== 'undefined') {
  window.DOMUtils = DOMUtils;
}
