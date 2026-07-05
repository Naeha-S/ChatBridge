(function () {
  'use strict';

  // 1. Initialize Vanta.js Topology background
  if (window.VANTA && window.VANTA.TOPOLOGY) {
    VANTA.TOPOLOGY({
      el: "#vanta-bg",
      mouseControls: true,
      touchControls: true,
      gyroControls: false,
      minHeight: 200.00,
      minWidth: 200.00,
      scale: 1.00,
      scaleMobile: 1.00,
      color: 0x5e8cf5, // Accent color
      backgroundColor: 0x030508 // matches var(--bg)
    });
  }

  // 2. Initialize GSAP Animations
  if (window.gsap) {
    // Fade in the main card
    gsap.to(".goodbye-card", {
      opacity: 1,
      y: 0,
      duration: 1.2,
      ease: "power3.out"
    });

    // Stagger reveal the contents
    gsap.fromTo(".gs-reveal", 
      { opacity: 0, y: 15 },
      { 
        opacity: 1, 
        y: 0, 
        duration: 0.8, 
        stagger: 0.1, 
        ease: "power2.out",
        delay: 0.2
      }
    );
  } else {
    // Fallback if GSAP fails to load
    document.querySelector('.goodbye-card').style.opacity = 1;
    document.querySelector('.goodbye-card').style.transform = 'none';
    document.querySelectorAll('.gs-reveal').forEach(el => {
      el.style.opacity = 1;
      el.style.transform = 'none';
    });
  }

  // 3. Button Interactivity
  const feedbackBtn = document.getElementById('btn-share-feedback');
  if (feedbackBtn) {
    feedbackBtn.addEventListener('click', () => {
      window.open('https://github.com/Naeha-S/ChatBridge/issues/new', '_blank', 'noopener');
    });
  }
})();
