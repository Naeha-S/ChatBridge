"use strict";

const btnUpgradeYes = document.getElementById("btn-upgrade-yes");
const btnUpgradeNo = document.getElementById("btn-upgrade-no");

if (btnUpgradeYes) {
  btnUpgradeYes.addEventListener("click", () => {
    // Dummy checkout URL as requested
    window.location.href = "https://dummy.chatbridge.dev/checkout";
  });
}

if (btnUpgradeNo) {
  btnUpgradeNo.addEventListener("click", () => {
    // If they say no, take to the first install page (welcome)
    window.location.href = chrome.runtime.getURL("welcome.html");
  });
}
