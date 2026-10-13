/* Movimento do design V2: revelação escalonada, ondas nos botões, contador animado, confete e toast de pontos. */
(function () {
  const reduz = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // 1) Quando uma tela fica ativa, os blocos dela "sobem" um depois do outro
  function revelar(tela) {
    if (reduz || !tela) return;
    const alvo = tela.querySelector(".scroll") || tela;
    const blocos = Array.from(alvo.children).filter(el => el.offsetParent !== null || el.style.display !== "none");
    blocos.forEach((el, i) => {
      el.classList.remove("rv-on");
      el.classList.add("rv");
      el.style.setProperty("--i", Math.min(i, 14));
    });
    requestAnimationFrame(() => requestAnimationFrame(() => blocos.forEach(el => el.classList.add("rv-on"))));
  }
  const obs = new MutationObserver(muts => {
    for (const m of muts) {
      const t = m.target;
      if (t.classList && t.classList.contains("screen") && t.classList.contains("active")) revelar(t);
    }
  });
  function iniciar() {
    document.querySelectorAll(".screen").forEach(s => obs.observe(s, { attributes: true, attributeFilter: ["class"] }));
    const ativa = document.querySelector(".screen.active");
    if (ativa) revelar(ativa);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();

  // 2) Onda (ripple) ao tocar em botões e atalhos
  document.addEventListener("pointerdown", e => {
    const b = e.target.closest(".btn, .quicklink, .navitem");
    if (!b || reduz) return;
    const r = b.getBoundingClientRect();
    const d = Math.max(r.width, r.height);
    const s = document.createElement("span");
    s.className = "ripple-onda";
    s.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px;`;
    if (getComputedStyle(b).position === "static") b.style.position = "relative";
    b.style.overflow = "hidden";
    b.appendChild(s);
    setTimeout(() => s.remove(), 700);
  }, { passive: true });

  // 3) Contador animado: window.animarNumero(elemento, valorFinal)
  window.animarNumero = function (el, fim, dur = 900) {
    if (!el) return;
    if (reduz) { el.textContent = fim; return; }
    const ini = 0, t0 = performance.now();
    (function passo(t) {
      const p = Math.min(1, (t - t0) / dur);
      el.textContent = Math.round(ini + (fim - ini) * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(passo);
    })(t0);
  };

  // 4) Confete: window.confete()
  window.confete = function (qtd = 70) {
    if (reduz) return;
    const cores = ["#FFB23E", "#15C08A", "#8B5CF6", "#FF6A5C", getComputedStyle(document.documentElement).getPropertyValue("--brand").trim() || "#3D5AFE"];
    for (let i = 0; i < qtd; i++) {
      const p = document.createElement("i");
      p.className = "confete-peca";
      p.style.left = Math.random() * 100 + "vw";
      p.style.background = cores[i % cores.length];
      p.style.setProperty("--dx", (Math.random() * 160 - 80) + "px");
      p.style.setProperty("--rot", (Math.random() * 900 - 450) + "deg");
      p.style.animationDuration = (1.8 + Math.random() * 1.6) + "s";
      p.style.animationDelay = Math.random() * 0.4 + "s";
      document.body.appendChild(p);
      setTimeout(() => p.remove(), 4200);
    }
  };

  // 5) Toast "+15 pts" com confete: window.toastPontos(15)
  window.toastPontos = function (pts) {
    const t = document.createElement("div");
    t.className = "toast-pontos";
    t.textContent = `🎉 +${pts} pontos!`;
    document.body.appendChild(t);
    window.confete(50);
    setTimeout(() => t.remove(), 2700);
  };
})();
