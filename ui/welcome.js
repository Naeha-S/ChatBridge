(function () {
  "use strict";

  const bind = (id, handler) => {
    const element = document.getElementById(id);
    if (element) {
      element.addEventListener("click", handler);
    }
  };

  const openOptions = () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
      return;
    }

    chrome.tabs.create({ url: chrome.runtime.getURL("ui/options.html") });
  };

  const openLoginPage = () => {
    const loginUrl = chrome.runtime.getURL("ui/login.html");
    if (chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({ url: loginUrl });
      return;
    }

    window.location.href = loginUrl;
  };

  bind("btn-go-chat", () => chrome.tabs.create({ url: "https://chatgpt.com/" }));
  bind("btn-go-chat-footer", () => chrome.tabs.create({ url: "https://chatgpt.com/" }));
  bind("btn-options", openOptions);
  bind("btn-options-nav", openOptions);
  bind("btn-options-footer", openOptions);
  bind("btn-dashboard", openOptions);

  const planStorageKey = "chatbridge_subscription_tier";
  const planModal = document.getElementById("plan-modal");
  const pricingButtons = Array.from(document.querySelectorAll(".pricing-action"));
  let selectedPlan = "pro";

  initHeroShader();
  initCardStack();
  initPricing();
  initAuth();

  const nav = document.querySelector(".nav");
  const navSectionLinks = document.querySelectorAll('.nav-links a[href^="#"]');
  if (nav) {
    let navTicking = false;
    window.addEventListener(
      "scroll",
      () => {
        if (navTicking) {
          return;
        }

        navTicking = true;
        requestAnimationFrame(() => {
          nav.classList.toggle("scrolled", window.scrollY > 20);
          navTicking = false;
        });
      },
      { passive: true }
    );
  }

  const contentSections = Array.from(document.querySelectorAll("main section[id]"));

  if ("IntersectionObserver" in window && navSectionLinks.length && contentSections.length) {
    const sectionToNavId = {
      tools: "#tools",
      workspace: "#workspace",
      agents: "#agents",
      pricing: "#pricing",
      setup: "#setup",
    };

    const setActiveNav = (hash) => {
      navSectionLinks.forEach((link) => {
        link.classList.toggle("is-active", link.getAttribute("href") === hash);
      });
    };

    const navObserver = new IntersectionObserver(
      (entries) => {
        const visibleEntries = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

        if (!visibleEntries.length) {
          return;
        }

        const topSection = visibleEntries[0].target;
        const hash = sectionToNavId[topSection.id] || null;
        if (hash) {
          setActiveNav(hash);
        }
      },
      {
        threshold: [0.2, 0.45, 0.7],
        rootMargin: "-10% 0px -55% 0px",
      }
    );

    contentSections.forEach((section) => navObserver.observe(section));
  }

  const revealTargets = document.querySelectorAll(".rv, .rv-children");
  if ("IntersectionObserver" in window && revealTargets.length) {
    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return;
          }

          entry.target.classList.add("visible");
          revealObserver.unobserve(entry.target);
        });
      },
      {
        threshold: 0.12,
        rootMargin: "0px 0px -36px 0px",
      }
    );

    revealTargets.forEach((target) => revealObserver.observe(target));
  } else {
    revealTargets.forEach((target) => target.classList.add("visible"));
  }

  const counters = document.querySelectorAll(".stat-num[data-count]");
  if ("IntersectionObserver" in window && counters.length) {
    const counterObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return;
          }

          animateCount(entry.target);
          counterObserver.unobserve(entry.target);
        });
      },
      { threshold: 0.5 }
    );

    counters.forEach((counter) => counterObserver.observe(counter));
  }

  function animateCount(element) {
    const targetValue = Number.parseInt(element.dataset.count || "0", 10);
    const duration = 1100;
    const start = performance.now();

    const easeOutCubic = (progress) => 1 - Math.pow(1 - progress, 3);

    const tick = (now) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      element.textContent = String(Math.round(easeOutCubic(progress) * targetValue));

      if (progress < 1) {
        requestAnimationFrame(tick);
      }
    };

    requestAnimationFrame(tick);
  }

  const spotlightCards = document.querySelectorAll(
    ".stage-panel, .rail-card, .workflow-card, .feature-card, .workspace-card, .agent-card, .agent-side, .engine-card, .privacy-item, .config-card, .setup-card, .utility-card"
  );

  initBorderGlow(spotlightCards);

  initSpotlightTracking(spotlightCards);

  const switches = document.querySelectorAll(".stage-switch");
  const panes = document.querySelectorAll(".preview-pane");

  const activatePreview = (previewName) => {
    switches.forEach((button) => {
      const isActive = button.dataset.preview === previewName;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", String(isActive));
    });

    panes.forEach((pane) => {
      pane.classList.toggle("is-active", pane.dataset.pane === previewName);
    });
  };

  switches.forEach((button) => {
    button.addEventListener("click", () => activatePreview(button.dataset.preview));
  });

  function initHeroShader() {
    const container = document.getElementById("hero-shader");
    if (!container) {
      return;
    }

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (prefersReducedMotion.matches) {
      return;
    }

    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl", {
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });

    if (!gl) {
      return;
    }

    container.appendChild(canvas);

    const vertexShaderSource = `
      attribute vec2 position;
      void main() {
        gl_Position = vec4(position, 0.0, 1.0);
      }
    `;

    const fragmentShaderSource = `
      precision highp float;
      uniform vec2 resolution;
      uniform float time;

      float ring(vec2 uv, float radius, float width, float offset) {
        float wave = abs(fract(offset - radius + mod(uv.x + uv.y, 0.2)) - 0.5);
        return width / max(wave, 0.001);
      }

      void main(void) {
        vec2 uv = (gl_FragCoord.xy * 2.0 - resolution.xy) / min(resolution.x, resolution.y);
        float t = time * 0.05;
        float lineWidth = 0.002;

        vec3 color = vec3(0.0);
        for (int j = 0; j < 3; j++) {
          for (int i = 0; i < 5; i++) {
            float offset = fract(t - 0.01 * float(j) + float(i) * 0.01) * 5.0;
            color[j] += lineWidth * float(i * i) / abs(offset - length(uv) + mod(uv.x + uv.y, 0.2));
          }
        }

        // Dynamically blend Aether gradient colors (#4ed8ff, #ff4fa3, #ff8a2a)
        float angle = atan(uv.y, uv.x);
        float normAngle = (angle + 3.14159265) / 6.2831853;
        vec3 c1 = vec3(0.306, 0.847, 1.0);   // #4ed8ff
        vec3 c2 = vec3(1.0, 0.310, 0.639);   // #ff4fa3
        vec3 c3 = vec3(1.0, 0.541, 0.165);   // #ff8a2a
        vec3 mixColor = mix(c1, mix(c2, c3, step(0.5, normAngle)), abs(normAngle - 0.5) * 2.0);

        color = clamp(color * mixColor, 0.0, 1.0);
        float vignette = smoothstep(1.6, 0.2, length(uv));
        gl_FragColor = vec4(color * vignette, 0.9);
      }
    `;

    const createShader = (type, source) => {
      const shader = gl.createShader(type);
      if (!shader) {
        return null;
      }

      gl.shaderSource(shader, source);
      gl.compileShader(shader);

      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        return null;
      }

      return shader;
    };

    const vertexShader = createShader(gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = createShader(gl.FRAGMENT_SHADER, fragmentShaderSource);

    if (!vertexShader || !fragmentShader) {
      return;
    }

    const program = gl.createProgram();
    if (!program) {
      return;
    }

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      return;
    }

    gl.useProgram(program);

    const vertices = new Float32Array([
      -1, -1,
      1, -1,
      -1, 1,
      -1, 1,
      1, -1,
      1, 1,
    ]);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    const positionLocation = gl.getAttribLocation(program, "position");
    const resolutionLocation = gl.getUniformLocation(program, "resolution");
    const timeLocation = gl.getUniformLocation(program, "time");

    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    let startTime = performance.now();
    let renderQueued = false;

    const resize = () => {
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(Math.floor(container.clientWidth * pixelRatio), 1);
      const height = Math.max(Math.floor(container.clientHeight * pixelRatio), 1);

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }

      gl.uniform2f(resolutionLocation, width, height);
    };

    const render = (now = performance.now()) => {
      renderQueued = false;
      resize();
      gl.uniform1f(timeLocation, (now - startTime) * 0.001);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };

    const scheduleRender = () => {
      if (renderQueued) {
        return;
      }

      renderQueued = true;
      requestAnimationFrame(render);
    };

    scheduleRender();
    window.addEventListener("resize", scheduleRender, { passive: true });
    window.addEventListener("load", scheduleRender, { once: true });
    document.addEventListener("visibilitychange", scheduleRender, { passive: true });

    window.addEventListener(
      "beforeunload",
      () => {
        window.removeEventListener("resize", scheduleRender);
        window.removeEventListener("load", scheduleRender);
        document.removeEventListener("visibilitychange", scheduleRender);
        gl.deleteBuffer(buffer);
        gl.deleteProgram(program);
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
      },
      { once: true }
    );
  }

  function initPricing() {
    if (!planModal) {
      return;
    }

    const billingToggle = document.getElementById("billing-cycle-checkbox");
    const monthlyLabel = document.getElementById("toggle-monthly-label");
    const yearlyLabel = document.getElementById("toggle-yearly-label");

    const priceFree = document.getElementById("price-free");
    const pricePro = document.getElementById("price-pro");
    const priceMax = document.getElementById("price-max");

    const periodFree = document.getElementById("period-free");
    const periodPro = document.getElementById("period-pro");
    const periodMax = document.getElementById("period-max");

    const savingsPro = document.getElementById("savings-pro");
    const savingsMax = document.getElementById("savings-max");

    // Modal elements
    const checkoutPlanName = document.getElementById("checkout-plan-name");
    const checkoutPlanDesc = document.getElementById("checkout-plan-desc");
    const checkoutPlanPrice = document.getElementById("checkout-plan-price");
    const checkoutConfirmBtn = document.getElementById("plan-modal-confirm");
    const paymentForm = document.getElementById("payment-form");
    const checkoutFormView = document.getElementById("checkout-form-view");
    const checkoutSuccessView = document.getElementById("checkout-success-view");
    const successDescText = document.getElementById("success-desc-text");

    // Calculator elements
    const calcSlider = document.getElementById("calc-daily-conv");
    const calcConvVal = document.getElementById("calc-conv-val");
    const calcCreditsResult = document.getElementById("calc-credits-result");
    const calcRecommendedPlan = document.getElementById("calc-recommended-plan");
    const btnCalcSelectPlan = document.getElementById("btn-calc-select-plan");

    // --- Billing cycle toggle ---
    const updateBillingCycle = () => {
      if (!billingToggle) return;
      const isYearly = billingToggle.checked;
      
      if (monthlyLabel) monthlyLabel.classList.toggle("active", !isYearly);
      if (yearlyLabel) yearlyLabel.classList.toggle("active", isYearly);

      if (isYearly) {
        if (pricePro) pricePro.textContent = "2,499";
        if (priceMax) priceMax.textContent = "6,999";
        if (periodPro) periodPro.textContent = "/year";
        if (periodMax) periodMax.textContent = "/year";
        if (savingsPro) savingsPro.style.display = "block";
        if (savingsMax) savingsMax.style.display = "block";
      } else {
        if (pricePro) pricePro.textContent = "299";
        if (priceMax) priceMax.textContent = "799";
        if (periodPro) periodPro.textContent = "/month";
        if (periodMax) periodMax.textContent = "/month";
        if (savingsPro) savingsPro.style.display = "none";
        if (savingsMax) savingsMax.style.display = "none";
      }
      
      // Update calculator recommendation
      updateCalculator();
    };

    if (billingToggle) {
      billingToggle.addEventListener("change", updateBillingCycle);
    }

    // --- Calculator ---
    const updateCalculator = () => {
      if (!calcSlider) return;
      const convs = parseInt(calcSlider.value);
      if (calcConvVal) {
        calcConvVal.textContent = `${convs} ${convs === 1 ? 'conversation' : 'conversations'} / day`;
      }

      const intensityEl = document.querySelector('input[name="calc-intensity"]:checked');
      const intensity = intensityEl ? intensityEl.value : "basic";
      
      let multiplier = 1;
      if (intensity === "advanced") multiplier = 5;
      else if (intensity === "agentic") multiplier = 25;

      const monthlyCredits = convs * multiplier * 30;
      if (calcCreditsResult) {
        calcCreditsResult.textContent = monthlyCredits.toLocaleString();
      }

      let recommendation = "free";
      let recText = "Free Plan";
      let ctaText = "Stay Free";

      if (monthlyCredits > 100 && monthlyCredits <= 2000) {
        recommendation = "pro";
        recText = "Pro Plan";
        ctaText = "Upgrade to Pro";
      } else if (monthlyCredits > 2000) {
        recommendation = "max";
        recText = "Max Plan";
        ctaText = "Go Max";
      }

      if (calcRecommendedPlan) {
        calcRecommendedPlan.textContent = recText;
      }
      if (btnCalcSelectPlan) {
        btnCalcSelectPlan.textContent = ctaText;
        btnCalcSelectPlan.dataset.plan = recommendation;
      }
    };

    if (calcSlider) {
      calcSlider.addEventListener("input", updateCalculator);
    }
    document.querySelectorAll('input[name="calc-intensity"]').forEach((radio) => {
      radio.addEventListener("change", updateCalculator);
    });

    if (btnCalcSelectPlan) {
      btnCalcSelectPlan.addEventListener("click", () => {
        const plan = btnCalcSelectPlan.dataset.plan || "pro";
        openPlanModal({ plan });
      });
    }

    // --- Modal actions ---
    const openPlanModal = async ({ plan = "pro" } = {}) => {
      selectedPlan = plan;

      // Check login state first
      const authData = await new Promise(res => chrome.storage.local.get(["chatbridge_logged_in"], res));
      if (!authData || !authData.chatbridge_logged_in) {
        window.alert("Please log in to continue with the free tier or upgrade your subscription.");
        openLoginPage();
        return;
      }
      
      if (plan === "free") {
        if (window.confirm("Do you want to switch back to the Free plan? Your credits will be reset to 100/month.")) {
          persistPlan("free", 100).then(() => {
            window.alert("Successfully downgraded to the Free plan.");
            window.location.reload();
          });
        }
        return;
      }

      const isYearly = billingToggle ? billingToggle.checked : false;
      let planDisplayName = "Pro";
      let planDescription = "2,000 monthly credits + premium features";
      let planPriceText = "₹299";

      if (plan === "pro") {
        planDisplayName = isYearly ? "Pro (Yearly)" : "Pro (Monthly)";
        planPriceText = isYearly ? "₹2,499" : "₹299";
        planDescription = isYearly 
          ? "2,000 monthly credits + premium features (billed annually)"
          : "2,000 monthly credits + premium features";
      } else if (plan === "max") {
        planDisplayName = isYearly ? "Max (Yearly)" : "Max (Monthly)";
        planPriceText = isYearly ? "₹6,999" : "₹799";
        planDescription = isYearly
          ? "10,000 monthly credits + advanced retrieval & agents (billed annually)"
          : "10,000 monthly credits + advanced retrieval & agents";
      }

      if (checkoutPlanName) checkoutPlanName.textContent = planDisplayName;
      if (checkoutPlanDesc) checkoutPlanDesc.textContent = planDescription;
      if (checkoutPlanPrice) checkoutPlanPrice.textContent = planPriceText;
      if (checkoutConfirmBtn) checkoutConfirmBtn.textContent = `Pay ${planPriceText}`;

      // Reset Modal View state
      if (checkoutFormView) checkoutFormView.style.display = "block";
      if (checkoutSuccessView) checkoutSuccessView.style.display = "none";
      if (paymentForm) paymentForm.reset();

      planModal.hidden = false;
      document.body.style.overflow = "hidden";
    };

    const closePlanModal = () => {
      planModal.hidden = true;
      document.body.style.overflow = "";
    };

    const persistPlan = (plan, credits) =>
      new Promise((resolve) => {
        try {
          chrome.storage.local.set({
            [planStorageKey]: plan,
            "chatbridge_credits_balance": credits,
            "chatbridge_credits_last_reset": Date.now()
          }, resolve);
        } catch (_) {
          resolve();
        }
      });

    pricingButtons.forEach((button) => {
      button.addEventListener("click", () => {
        openPlanModal({
          plan: button.dataset.plan || "pro",
        });
      });
    });

    document.querySelectorAll("[data-close-plan-modal='true']").forEach((node) => {
      node.addEventListener("click", closePlanModal);
    });
    bind("plan-modal-close", closePlanModal);
    bind("plan-modal-cancel", closePlanModal);

    // Form submit integration (Stripe Simulation)
    if (paymentForm) {
      paymentForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        
        if (checkoutConfirmBtn) {
          checkoutConfirmBtn.disabled = true;
          checkoutConfirmBtn.textContent = "Processing payment...";
        }

        // Disable all inputs in form during simulation
        const inputs = Array.from(paymentForm.querySelectorAll("input"));
        inputs.forEach(input => input.disabled = true);

        // Simulate network latency (1.5 seconds)
        await new Promise(r => setTimeout(r, 1500));

        // Save subscription details and credits
        const credits = selectedPlan === "max" ? 10000 : 2000;
        await persistPlan(selectedPlan, credits);

        // Transition to success screen
        if (checkoutFormView) checkoutFormView.style.display = "none";
        if (checkoutSuccessView) checkoutSuccessView.style.display = "block";
        if (successDescText) {
          successDescText.textContent = `Your ${selectedPlan === 'max' ? 'Max' : 'Pro'} subscription has been activated successfully, and ${credits.toLocaleString()} credits have been added to your balance.`;
        }

        // Close modal after 2.5 seconds success viewing
        await new Promise(r => setTimeout(r, 2500));
        
        inputs.forEach(input => input.disabled = false);
        if (checkoutConfirmBtn) checkoutConfirmBtn.disabled = false;
        
        closePlanModal();
        
        // Dispatch custom storage change event for immediate UI update in options page
        try {
          window.dispatchEvent(new Event("storage"));
        } catch (_) {}
        
        // Reload welcome page or notify
        window.alert(`Subscription activated successfully!`);
        window.location.reload();
      });
    }

    // --- Query params parsing (onboarding check) ---
    try {
      const params = new URLSearchParams(window.location.search);
      const shouldUpgrade = params.get("upgrade") === "1";
      const plan = params.get("plan") || "pro";

      if (shouldUpgrade) {
        const pricingSection = document.getElementById("pricing");
        if (pricingSection) {
          pricingSection.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        window.setTimeout(() => openPlanModal({ plan }), 220);
      }
    } catch (_) {
      // Ignore malformed query params.
    }

    // Init values
    updateBillingCycle();
    updateCalculator();
  }

  function initSpotlightTracking(cards) {
    if (!cards.length) {
      return;
    }

    let activeCard = null;
    let pointer = null;
    let frameId = 0;

    const resetCard = (card) => {
      card.style.setProperty("--edge-proximity", "0");
      card.style.setProperty("--mx", "50%");
      card.style.setProperty("--my", "50%");
    };

    const flush = () => {
      frameId = 0;
      if (!activeCard || !pointer) {
        return;
      }

      const rect = activeCard.getBoundingClientRect();
      const x = pointer.x - rect.left;
      const y = pointer.y - rect.top;
      const minEdgeDistance = Math.min(x, y, rect.width - x, rect.height - y);
      const edgeRange = Math.min(90, Math.max(rect.width, rect.height) * 0.24);
      const edgeProximity = Math.max(0, Math.min(100, (1 - minEdgeDistance / edgeRange) * 100));
      const angle = (Math.atan2(y - rect.height / 2, x - rect.width / 2) * 180) / Math.PI + 90;

      activeCard.style.setProperty("--mx", `${x}px`);
      activeCard.style.setProperty("--my", `${y}px`);
      activeCard.style.setProperty("--edge-proximity", edgeProximity.toFixed(2));
      activeCard.style.setProperty("--cursor-angle", `${angle.toFixed(2)}deg`);
    };

    const queueFlush = () => {
      if (!frameId) {
        frameId = requestAnimationFrame(flush);
      }
    };

    cards.forEach((card) => {
      card.addEventListener("pointerenter", (event) => {
        activeCard = card;
        pointer = { x: event.clientX, y: event.clientY };
        queueFlush();
      });

      card.addEventListener("pointermove", (event) => {
        if (activeCard !== card) {
          activeCard = card;
        }
        pointer = { x: event.clientX, y: event.clientY };
        queueFlush();
      });

      card.addEventListener("pointerleave", () => {
        if (activeCard === card) {
          activeCard = null;
          pointer = null;
        }
        resetCard(card);
      });
    });
  }

  function initBorderGlow(cards) {
    cards.forEach((card) => {
      card.classList.add("border-glow-card");

      if (!card.querySelector(":scope > .edge-light")) {
        const edgeLight = document.createElement("span");
        edgeLight.className = "edge-light";
        edgeLight.setAttribute("aria-hidden", "true");
        card.appendChild(edgeLight);
      }
    });
  }

  function initCardStack() {
    const stage = document.getElementById("card-stack-stage");
    const animateButton = document.getElementById("btn-stack-animate");
    const motionSection = document.getElementById("motion");

    if (!stage) {
      return;
    }

    const cardData = [
      {
        title: "Sidebar Scan",
        description: "Capture and clean chat sessions in your tab",
        image: "../screenshots/Screenshot 2026-07-06 174220.png",
        width: 598,
        height: 958,
      },
      {
        title: "Agent Utilities",
        description: "Six active intelligence agents cross-checking facts",
        image: "../screenshots/Screenshot 2026-07-06 174234.png",
        width: 601,
        height: 967,
      },
      {
        title: "Smart Workspace",
        description: "Side-by-side model comparison and thread merging",
        image: "../screenshots/Screenshot 2026-07-06 174246.png",
        width: 591,
        height: 967,
      },
      {
        title: "Action Toolkit",
        description: "Convert chats to checklists, podcasts, or sandboxes",
        image: "../screenshots/Screenshot 2026-07-06 174258.png",
        width: 589,
        height: 961,
      },
    ];

    let cards = [0, 1, 2];
    let nextIndex = 3;
    let isAnimating = false;
    let autoRotate = false;
    let rotateTimer = 0;

    const positions = [
      { y: 12, scale: 1, opacity: 1 },
      { y: -18, scale: 0.95, opacity: 0.92 },
      { y: -48, scale: 0.9, opacity: 0.78 },
    ];

    const createActionIcon = () =>
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square"><path d="M9.5 18L15.5 12L9.5 6"/></svg>';

    const renderStack = () => {
      stage.innerHTML = "";

      cards.forEach((cardIndex, index) => {
        const card = cardData[cardIndex % cardData.length];
        const position = positions[index] || positions[2];
        const cardElement = document.createElement("article");
        cardElement.className = `stack-card${index === 0 ? " is-top" : ""}`;
        cardElement.style.transform = `translateX(-50%) translateY(${position.y}px) scale(${position.scale})`;
        cardElement.style.opacity = String(position.opacity);
        cardElement.style.zIndex = String(30 - index);
        cardElement.innerHTML = `
          <div class="stack-card-media">
            <img src="${card.image}" alt="${card.title}" width="${card.width}" height="${card.height}" decoding="async">
          </div>
          <div class="stack-card-body">
            <div class="stack-card-copy">
              <strong>${card.title}</strong>
              <span>${card.description}</span>
            </div>
            <div class="stack-card-action">
              <span>Read</span>
              ${createActionIcon()}
            </div>
          </div>
        `;
        stage.appendChild(cardElement);
      });
    };

    const animateStack = () => {
      if (isAnimating) {
        return;
      }

      const cardElements = stage.querySelectorAll(".stack-card");
      if (cardElements.length < 3) {
        renderStack();
        return;
      }

      isAnimating = true;

      const topCard = cardElements[0];
      const middleCard = cardElements[1];
      const backCard = cardElements[2];

      topCard.classList.add("is-exit");
      topCard.style.transform = "translateX(-50%) translateY(320px) scale(1)";
      topCard.style.opacity = "0";

      middleCard.style.transform = "translateX(-50%) translateY(12px) scale(1)";
      middleCard.style.opacity = "1";
      middleCard.style.zIndex = "30";

      backCard.style.transform = "translateX(-50%) translateY(-18px) scale(0.95)";
      backCard.style.opacity = "0.92";
      backCard.style.zIndex = "29";

      window.setTimeout(() => {
        cards = [cards[1], cards[2], nextIndex % cardData.length];
        nextIndex += 1;
        renderStack();
        isAnimating = false;
      }, 920);
    };

    const startAutoRotate = () => {
      if (rotateTimer || !autoRotate) {
        return;
      }

      rotateTimer = window.setInterval(() => {
        animateStack();
      }, 2600);
    };

    const stopAutoRotate = () => {
      if (rotateTimer) {
        window.clearInterval(rotateTimer);
        rotateTimer = 0;
      }
    };

    renderStack();

    if (animateButton) {
      animateButton.addEventListener("click", animateStack);
    }

    if ("IntersectionObserver" in window && motionSection) {
      const stackObserver = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          autoRotate = entry.isIntersecting && !prefersReducedMotion.matches;

          if (autoRotate) {
            startAutoRotate();
          } else {
            stopAutoRotate();
          }
        },
        {
          threshold: 0.35,
        }
      );

      stackObserver.observe(motionSection);
    } else {
      autoRotate = true;
      startAutoRotate();
    }
  }

  function initAuth() {
    const loginModal = document.getElementById("login-modal");
    const btnNavLogin = document.getElementById("btn-nav-login");
    const navUserProfile = document.getElementById("nav-user-profile");
    const navUserEmail = document.getElementById("nav-user-email");
    const btnNavLogout = document.getElementById("btn-nav-logout");
    const btnFreeAction = document.getElementById("btn-free-action");

    const loginForm = document.getElementById("login-form");
    const btnOauthGoogle = document.getElementById("btn-oauth-google");
    const btnOauthGithub = document.getElementById("btn-oauth-github");
    const loginFormView = document.getElementById("login-form-view");
    const loginSuccessView = document.getElementById("login-success-view");
    const loginEmailInput = document.getElementById("login-email");
    const loginConfirmBtn = document.getElementById("login-modal-confirm");

    if (!loginModal) return;

    const authKeys = {
      loggedIn: "chatbridge_logged_in",
      userEmail: "chatbridge_user_email",
      tier: "chatbridge_subscription_tier",
      balance: "chatbridge_credits_balance",
      lastReset: "chatbridge_credits_last_reset"
    };

    const getAuthLocal = (keys) =>
      new Promise((resolve) => {
        try {
          chrome.storage.local.get(keys, resolve);
        } catch (_) {
          resolve({});
        }
      });

    const setAuthLocal = (items) =>
      new Promise((resolve) => {
        try {
          chrome.storage.local.set(items, resolve);
        } catch (_) {
          resolve();
        }
      });

    // Check auth state on load
    const updateAuthStateUI = async () => {
      const data = await getAuthLocal([authKeys.loggedIn, authKeys.userEmail, authKeys.tier]);
      const isLoggedIn = !!data[authKeys.loggedIn];
      const email = data[authKeys.userEmail] || "";
      const tier = String(data[authKeys.tier] || "free").toLowerCase();

      if (isLoggedIn) {
        if (btnNavLogin) btnNavLogin.style.display = "none";
        if (navUserProfile) navUserProfile.style.display = "inline-flex";
        if (navUserEmail) navUserEmail.textContent = email;

        // Update pricing cards button text based on plan tier
        if (btnFreeAction) {
          if (tier === "free") {
            btnFreeAction.textContent = "Current Plan (Free Tier)";
            btnFreeAction.disabled = true;
            btnFreeAction.className = "btn-pricing-action secondary";
          } else {
            btnFreeAction.textContent = "Switch to Free Tier";
            btnFreeAction.disabled = false;
            btnFreeAction.className = "btn-pricing-action secondary pricing-action";
          }
        }

        const btnProAction = document.querySelector('.pricing-card-redesign[id="card-pro"] .pricing-action');
        if (btnProAction) {
          if (tier === "pro") {
            btnProAction.textContent = "Current Plan (Pro)";
            btnProAction.disabled = true;
            btnProAction.className = "btn-pricing-action primary";
          } else if (tier === "max") {
            btnProAction.textContent = "Downgrade to Pro";
            btnProAction.disabled = false;
            btnProAction.className = "btn-pricing-action secondary pricing-action";
          } else {
            btnProAction.textContent = "Upgrade to Pro";
            btnProAction.disabled = false;
            btnProAction.className = "btn-pricing-action primary pricing-action";
          }
        }

        const btnMaxAction = document.querySelector('.pricing-card-redesign[id="card-max"] .pricing-action');
        if (btnMaxAction) {
          if (tier === "max") {
            btnMaxAction.textContent = "Current Plan (Max)";
            btnMaxAction.disabled = true;
            btnMaxAction.className = "btn-pricing-action primary";
          } else {
            btnMaxAction.textContent = "Upgrade to Max";
            btnMaxAction.disabled = false;
            btnMaxAction.className = "btn-pricing-action primary pricing-action";
          }
        }
      } else {
        if (btnNavLogin) btnNavLogin.style.display = "inline-block";
        if (navUserProfile) navUserProfile.style.display = "none";

        if (btnFreeAction) {
          btnFreeAction.textContent = "Continue with Free Tier";
          btnFreeAction.disabled = false;
          btnFreeAction.className = "btn-pricing-action secondary";
        }
      }
    };

    updateAuthStateUI();

    const openLoginPageFromWelcome = () => {
      openLoginPage();
    };

    const closeLoginModal = () => {
      loginModal.hidden = true;
      document.body.style.overflow = "";
    };

    // Binding open/close handlers
    if (btnNavLogin) btnNavLogin.addEventListener("click", openLoginPageFromWelcome);
    bind("login-modal-close", closeLoginModal);
    bind("login-modal-cancel", closeLoginModal);
    const loginBackdrop = document.getElementById("login-modal-backdrop");
    if (loginBackdrop) {
      loginBackdrop.addEventListener("click", closeLoginModal);
    }

    // Logout handler
    if (btnNavLogout) {
      btnNavLogout.addEventListener("click", async () => {
        if (window.confirm("Are you sure you want to log out? Your subscription status will revert to Free.")) {
          await setAuthLocal({
            [authKeys.loggedIn]: false,
            [authKeys.userEmail]: "",
            [authKeys.tier]: "free",
            [authKeys.balance]: 100,
            [authKeys.lastReset]: Date.now()
          });
          window.alert("Successfully logged out.");
          window.location.reload();
        }
      });
    }

    // Submit handler (Simulated Cloud Auth Login)
    const handleLoginSuccess = async (email) => {
      if (loginConfirmBtn) {
        loginConfirmBtn.disabled = true;
        loginConfirmBtn.textContent = "Authenticating...";
      }
      
      const oauthBtns = [btnOauthGoogle, btnOauthGithub];
      oauthBtns.forEach(btn => { if (btn) btn.disabled = true; });
      if (loginEmailInput) loginEmailInput.disabled = true;

      // Simulate network latency (1.2s)
      await new Promise(r => setTimeout(r, 1200));

      // Get current tier to see if they already have one, otherwise set free with 100 credits
      const currentData = await getAuthLocal([authKeys.tier]);
      const currentTier = currentData[authKeys.tier] || "free";
      const initialCredits = currentTier === "max" ? 10000 : (currentTier === "pro" ? 2000 : 100);

      await setAuthLocal({
        [authKeys.loggedIn]: true,
        [authKeys.userEmail]: email,
        [authKeys.tier]: currentTier,
        [authKeys.balance]: initialCredits,
        [authKeys.lastReset]: Date.now()
      });

      if (loginFormView) loginFormView.style.display = "none";
      if (loginSuccessView) loginSuccessView.style.display = "block";

      const successText = document.getElementById("login-success-desc-text");
      if (successText) {
        successText.textContent = `Welcome back! ${initialCredits.toLocaleString()} monthly credits loaded successfully.`;
      }

      await new Promise(r => setTimeout(r, 2000));

      if (loginConfirmBtn) loginConfirmBtn.disabled = false;
      oauthBtns.forEach(btn => { if (btn) btn.disabled = false; });
      if (loginEmailInput) loginEmailInput.disabled = false;

      closeLoginModal();
      window.alert("Login successful!");
      window.location.reload();
    };

    if (loginForm) {
      loginForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const email = loginEmailInput ? loginEmailInput.value : "naeha@chatbridge.dev";
        handleLoginSuccess(email);
      });
    }

    if (btnOauthGoogle) {
      btnOauthGoogle.addEventListener("click", () => handleLoginSuccess("google.user@chatbridge.dev"));
    }
    if (btnOauthGithub) {
      btnOauthGithub.addEventListener("click", () => handleLoginSuccess("github.user@chatbridge.dev"));
    }

  }
})();
