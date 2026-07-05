(function () {
  'use strict';

  var telemetry = document.getElementById('toggle-telemetry');
  var analytics = document.getElementById('toggle-analytics');
  var labelT = document.getElementById('label-telemetry');
  var labelA = document.getElementById('label-analytics');

  function updateLabel(toggle, label) {
    if (label) label.textContent = toggle.checked ? 'On' : 'Off';
  }

  // Load saved prefs from localStorage
  try {
    var saved = JSON.parse(localStorage.getItem('chatbridge_cookie_prefs') || '{}');
    if (telemetry) telemetry.checked = saved.telemetry || false;
    if (analytics) analytics.checked = saved.analytics || false;
  } catch (_) {}

  updateLabel(telemetry, labelT);
  updateLabel(analytics, labelA);

  if (telemetry) telemetry.addEventListener('change', function () { updateLabel(telemetry, labelT); });
  if (analytics) analytics.addEventListener('change', function () { updateLabel(analytics, labelA); });

  var saveBtn = document.getElementById('save-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', function () {
      try {
        localStorage.setItem('chatbridge_cookie_prefs', JSON.stringify({
          telemetry: telemetry ? telemetry.checked : false,
          analytics: analytics ? analytics.checked : false
        }));
      } catch (_) {}
      var msg = document.getElementById('saved-msg');
      if (msg) {
        msg.style.display = 'block';
        setTimeout(function () { msg.style.display = 'none'; }, 3000);
      }
    });
  }
})();
