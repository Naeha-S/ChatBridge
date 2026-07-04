(function () {
  'use strict';

  const feedbackBtn = document.getElementById('btn-share-feedback');
  if (feedbackBtn) {
    feedbackBtn.addEventListener('click', () => {
      window.open('https://github.com/Naeha-S/ChatBridge/issues/new', '_blank', 'noopener');
    });
  }
})();
