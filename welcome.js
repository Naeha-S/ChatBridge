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

    chrome.tabs.create({ url: chrome.runtime.getURL("options.html") });
  };

  bind("btn-go-chat", () => chrome.tabs.create({ url: "https://chatgpt.com/" }));
  bind("btn-options", openOptions);
  bind("btn-options-nav", openOptions);
  bind("btn-dashboard", openOptions);

  const planStorageKey = "chatbridge_subscription_tier";
  const planModal = document.getElementById("plan-modal");
  const planModalKicker = document.getElementById("plan-modal-kicker");
  const planModalTitle = document.getElementById("plan-modal-title");
  const planModalCopy = document.getElementById("plan-modal-copy");
  const planModalPlan = document.getElementById("plan-modal-plan");
  const planModalGateway = document.getElementById("plan-modal-gateway");
  const planModalNote = document.getElementById("plan-modal-note");
  const planGatewayChoices = Array.from(document.querySelectorAll("[data-gateway-choice]"));
  const pricingButtons = Array.from(document.querySelectorAll(".pricing-action"));
  const planMeta = {
    free: { label: "Free", cta: "Free plan activated", title: "Stay on Free" },
    pro: { label: "Pro", cta: "Pro demo activated", title: "Upgrade to Pro" },
    max: { label: "Max", cta: "Max demo activated", title: "Go Max" },
  };
  let selectedPlan = "pro";
  let selectedGateway = "sandbox";

  initHeroShader();
  initCardStack();
  initPricing();

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

        color = clamp(color * vec3(0.54, 0.7, 1.0), 0.0, 1.0);
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

    let animationFrameId = 0;
    let startTime = performance.now();

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

    const render = (now) => {
      animationFrameId = requestAnimationFrame(render);
      resize();
      gl.uniform1f(timeLocation, (now - startTime) * 0.001);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };

    resize();
    animationFrameId = requestAnimationFrame(render);
    window.addEventListener("resize", resize, { passive: true });

    window.addEventListener(
      "beforeunload",
      () => {
        cancelAnimationFrame(animationFrameId);
        window.removeEventListener("resize", resize);
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

    const updateGatewayChoice = (gateway) => {
      selectedGateway = gateway;
      planGatewayChoices.forEach((button) => {
        button.classList.toggle("is-active", button.dataset.gatewayChoice === gateway);
      });
      planModalGateway.textContent =
        gateway === "sandbox" ? "Sandbox checkout" : gateway.charAt(0).toUpperCase() + gateway.slice(1);
      if (planModalNote) {
        planModalNote.textContent =
          gateway === "sandbox"
            ? "This is a placeholder payment flow. When you move to production, wire this state into Razorpay or your chosen gateway."
            : `Selected gateway: ${gateway}. This remains a dummy flow until you connect a live processor.`;
      }
    };

    const openPlanModal = ({ plan = "pro", gateway = "sandbox", feature = "" } = {}) => {
      selectedPlan = planMeta[plan] ? plan : "pro";
      updateGatewayChoice(gateway);
      planModal.hidden = false;
      document.body.style.overflow = "hidden";
      planModalKicker.textContent = feature ? "Upgrade required" : "Dummy checkout";
      planModalTitle.textContent = planMeta[selectedPlan].title;
      planModalPlan.textContent = planMeta[selectedPlan].label;
      planModalCopy.textContent = feature
        ? `${feature} is outside your current plan. Upgrade here and use the dummy payment flow for now.`
        : "Select a plan and test the upgrade flow.";
    };

    const closePlanModal = () => {
      planModal.hidden = true;
      document.body.style.overflow = "";
    };

    const persistPlan = (plan) =>
      new Promise((resolve) => {
        try {
          chrome.storage.local.set({ [planStorageKey]: plan }, resolve);
        } catch (_) {
          resolve();
        }
      });

    pricingButtons.forEach((button) => {
      button.addEventListener("click", () => {
        openPlanModal({
          plan: button.dataset.plan || "pro",
          gateway: button.dataset.gateway || "sandbox",
        });
      });
    });

    planGatewayChoices.forEach((button) => {
      button.addEventListener("click", () => updateGatewayChoice(button.dataset.gatewayChoice || "sandbox"));
    });

    document.querySelectorAll("[data-close-plan-modal='true']").forEach((node) => {
      node.addEventListener("click", closePlanModal);
    });
    bind("plan-modal-close", closePlanModal);
    bind("plan-modal-cancel", closePlanModal);
    bind("plan-modal-confirm", async () => {
      await persistPlan(selectedPlan);
      closePlanModal();
      window.alert(`${planMeta[selectedPlan].cta}. Gateway: ${selectedGateway}.`);
    });

    try {
      const params = new URLSearchParams(window.location.search);
      const shouldUpgrade = params.get("upgrade") === "1";
      const feature = params.get("feature") || "";
      const plan = params.get("plan") || "pro";
      const gateway = params.get("gateway") || "sandbox";

      if (shouldUpgrade) {
        const pricingSection = document.getElementById("pricing");
        if (pricingSection) {
          pricingSection.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        window.setTimeout(() => openPlanModal({ plan, gateway, feature }), 220);
      }
    } catch (_) {
      // Ignore malformed query params.
    }
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
        title: "Shadway",
        description: "SHADCN website collection",
        image: "https://shadway.online/og-image.png",
      },
      {
        title: "Rizz Ai",
        description: "Dating AI wingman",
        image: "https://wrizzai.online/og.png",
      },
      {
        title: "21st.dev",
        description: "Vibe crafting platform",
        image: "https://21st.dev/opengraph-image.png",
      },
      {
        title: "ChatBridge",
        description: "Cross-platform AI workflow layer",
        image: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=80",
      },
      {
        title: "Research Mode",
        description: "Structured memory and retrieval surfaces",
        image: "https://images.unsplash.com/photo-1526379095098-d400fd0bf935?auto=format&fit=crop&w=1200&q=80",
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
            <img src="${card.image}" alt="${card.title}">
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
          autoRotate = entry.isIntersecting;

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
})();
