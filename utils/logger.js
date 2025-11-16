const Logger = (() => {
  const PREFIX = '[ChatBridge]';
  let debugEnabled = false;

  function init(config = {}) {
    debugEnabled = config.debug || false;
  }

  function log(level, ...args) {
    try {
      console[level](PREFIX, ...args);
    } catch (e) {}
  }

  return {
    init,
    debug: (...args) => debugEnabled && log('debug', ...args),
    info: (...args) => log('log', ...args),
    warn: (...args) => log('warn', ...args),
    error: (...args) => log('error', ...args),
    setDebug: (enabled) => { debugEnabled = enabled; }
  };
})();

if (typeof window !== 'undefined') {
  window.Logger = Logger;
}
