/* =========================================
   CLASSEN PURPLE — ANIMATIONS CONTROLLER
   Decorations, ripples, confetti, observer.
   Lightweight, pauses when hidden.
========================================= */
(function () {
  if (window.__cpAnimationsInit) return;
  window.__cpAnimationsInit = true;

  const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let decorLayer = null;
  let decorTimer = null;
  let currentType = null;

  const DECOR = {
    hearts:     { chars: ["❤","♥","♡","💕"], cls: "cp-decor-heart" },
    sparkles:   { chars: ["✦","✧","⋆","✶","✨"], cls: "cp-decor-sparkle" },
    butterflies:{ chars: ["🦋","🦋","✿"], cls: "cp-decor-butterfly" },
    stars:      { chars: ["★","✦","⋆","✧","☆"], cls: "cp-decor-star" },
    bubbles:    { chars: ["○","◌","◯","∘"], cls: "cp-decor-bubble" },
    clouds:     { chars: ["☁","☁"], cls: "cp-decor-cloud" },
    ribbons:    { chars: ["🎀","♡","✦","❀"], cls: "cp-decor-ribbon" },
    petals:     { chars: ["🌸","❀","✿","❁"], cls: "cp-decor-petal" },
    flowers:    { chars: ["✿","❀","🌼","✾"], cls: "cp-decor-flower" },
    leaves:     { chars: ["🍃","❧","✿","🌿"], cls: "cp-decor-leaf" }
  };

  function ensureLayer() {
    if (decorLayer && decorLayer.isConnected) return decorLayer;
    const host = document.querySelector(".phone-screen") || document.body;
    decorLayer = document.createElement("div");
    decorLayer.className = "cp-decor-layer";
    decorLayer.setAttribute("aria-hidden", "true");
    host.prepend(decorLayer);
    return decorLayer;
  }

  function clearDecor() {
    if (decorTimer) { clearInterval(decorTimer); decorTimer = null; }
    if (decorLayer) decorLayer.innerHTML = "";
  }

  function spawnDecor() {
    if (reduced() || document.hidden) return;
    const layer = ensureLayer();
    if (layer.childElementCount > 14) return;
    const type = currentType || document.documentElement.dataset.decor || "hearts";
    const cfg = DECOR[type] || DECOR.hearts;
    const el = document.createElement("span");
    el.className = `cp-decor ${cfg.cls}`;
    el.textContent = cfg.chars[Math.floor(Math.random() * cfg.chars.length)];
    const size = 10 + Math.random() * 14;
    const left = Math.random() * 100;
    const dur = 8 + Math.random() * 8;
    const drift = (Math.random() - 0.5) * 60;
    el.style.cssText = `left:${left}%;font-size:${size}px;--drift:${drift}px;animation-duration:${dur}s;opacity:${0.25 + Math.random() * 0.35}`;
    layer.appendChild(el);
    el.addEventListener("animationend", () => el.remove(), { once: true });
  }

  function startDecor(type) {
    currentType = type || "hearts";
    clearDecor();
    if (reduced()) return;
    for (let i = 0; i < 5; i++) setTimeout(spawnDecor, i * 600);
    decorTimer = setInterval(spawnDecor, 1800);
  }

  // Ripple on click
  document.addEventListener("click", (e) => {
    if (reduced()) return;
    const btn = e.target.closest("button, .btn, .game-btn, .home-card, .game-card, .nav-link, .bottom-link");
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const r = document.createElement("span");
    r.className = "cp-ripple";
    const size = Math.max(rect.width, rect.height);
    r.style.width = r.style.height = size + "px";
    r.style.left = (e.clientX - rect.left - size / 2) + "px";
    r.style.top = (e.clientY - rect.top - size / 2) + "px";
    btn.style.position = getComputedStyle(btn).position === "static" ? "relative" : "";
    btn.style.overflow = "hidden";
    btn.appendChild(r);
    r.addEventListener("animationend", () => r.remove(), { once: true });
  }, { passive: true });

  // Confetti
  window.cpConfetti = function (count = 40) {
    if (reduced()) return;
    const colors = ["var(--primary)", "var(--accent)", "var(--primary-light)", "#FFD700", "#FF8FB1", "#FFFFFF"];
    for (let i = 0; i < count; i++) {
      const p = document.createElement("span");
      p.className = "cp-confetti-piece";
      const size = 6 + Math.random() * 8;
      p.style.cssText = `left:${Math.random()*100}vw;width:${size}px;height:${size*0.6}px;background:${colors[i%colors.length]};animation-duration:${2.2+Math.random()*1.8}s;animation-delay:${Math.random()*0.4}s;transform:rotate(${Math.random()*360}deg)`;
      document.body.appendChild(p);
      p.addEventListener("animationend", () => p.remove(), { once: true });
    }
  };

  // Theme transition flash
  window.cpThemeTransition = function () {
    if (reduced()) return;
    let el = document.querySelector(".cp-theme-transition");
    if (!el) { el = document.createElement("div"); el.className = "cp-theme-transition"; document.body.appendChild(el); }
    el.classList.add("active");
    setTimeout(() => el.classList.remove("active"), 350);
  };

  // Respond to theme changes
  function onTheme(e) {
    const type = e?.detail?.theme?.decoration || document.documentElement.dataset.decor || "hearts";
    startDecor(type);
  }
  window.addEventListener("classen-theme-changed", onTheme);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { if (decorTimer) { clearInterval(decorTimer); decorTimer = null; } }
    else startDecor(currentType);
  });

  // Init
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => startDecor(document.documentElement.dataset.decor || "hearts"));
  else startDecor(document.documentElement.dataset.decor || "hearts");
})();
