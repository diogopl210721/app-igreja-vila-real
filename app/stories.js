/* Experiência de entrada: abertura cinematográfica, menu Explorar, stories e carrossel de destaques. */
(function () {
  const reduz = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const vibrar = (ms = 10) => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} };

  /* ============ 1) ABERTURA ============ */
  const VERSOS = [
    ["Tudo posso naquele que me fortalece.", "Filipenses 4:13"],
    ["O Senhor é o meu pastor; nada me faltará.", "Salmo 23:1"],
    ["Porque Deus amou o mundo de tal maneira…", "João 3:16"],
    ["Entrega o teu caminho ao Senhor; confia nele.", "Salmo 37:5"],
    ["Sede fortes e corajosos; o Senhor está convosco.", "Josué 1:9"],
  ];
  function abertura() {
    const ov = $("#intro-overlay");
    if (!ov) return;
    let jaViu = false;
    try { jaViu = sessionStorage.getItem("igr_intro") === "1"; } catch (e) {}
    if (jaViu || reduz) { ov.remove(); return; }
    let marca = {};
    try { marca = JSON.parse(localStorage.getItem("igr_marca") || "{}"); } catch (e) {}
    if (marca.cor) document.documentElement.style.setProperty("--brand", marca.cor);
    if (marca.cor2) document.documentElement.style.setProperty("--coral", marca.cor2);
    const vila = !marca.nome || /vila\s*real/i.test(marca.nome);
    const nome = vila ? "IEQ Vila Real" : marca.nome;
    if (vila) {
      ov.classList.add("modo-logo");
      $(".intro-logo img", ov).src = "assets/igreja-arte.png";
      $("#intro-sub").textContent = "Ministério Pr. José e Pra. Laura";
    } else {
      if (marca.logo) $(".intro-logo img", ov).src = marca.logo;
      else $(".intro-logo", ov).style.display = "none";
      $("#intro-sub").remove();
    }
    const pal = nome.trim().split(/\s+/);
    let k = 0;
    $("#intro-nome").innerHTML = pal.map((p, i) => `<span class="pal ${i === 0 ? "n1" : "n2"}">${p.split("").map(l => `<span class="l" style="--k:${k++}">${l}</span>`).join("")}</span>`).join(" ");

    // partículas douradas
    const cv = $("#intro-canvas"), cx = cv.getContext("2d");
    let W = 0, H = 0, dpr = Math.min(2, window.devicePixelRatio || 1), pts = [], vivo = true, prog = 0;
    function dim() { W = cv.clientWidth; H = cv.clientHeight; cv.width = W * dpr; cv.height = H * dpr; cx.setTransform(dpr, 0, 0, dpr, 0, 0); }
    dim(); window.addEventListener("resize", dim);
    for (let i = 0; i < 70; i++) pts.push({ x: Math.random(), y: Math.random(), r: .6 + Math.random() * 2.2, v: .02 + Math.random() * .06, d: Math.random() * 6.28, z: .3 + Math.random() });
    (function quadro() {
      if (!vivo) return;
      cx.clearRect(0, 0, W, H);
      const ouro = getComputedStyle(document.documentElement).getPropertyValue("--coral").trim() || "#F9BD00";
      pts.forEach(p => {
        p.y -= p.v * .004 * (1 + prog * 10) * p.z; p.d += .012;
        if (p.y < -.05) { p.y = 1.05; p.x = Math.random(); }
        const x = (p.x + Math.sin(p.d) * .015) * W, y = p.y * H;
        cx.globalAlpha = (.25 + .5 * Math.abs(Math.sin(p.d * 1.7))) * p.z;
        cx.fillStyle = ouro; cx.shadowColor = ouro; cx.shadowBlur = 10 * p.z;
        cx.beginPath(); cx.arc(x, y, p.r * p.z, 0, 6.28); cx.fill();
      });
      requestAnimationFrame(quadro);
    })();

    // gesto: arrastar para cima abre o app
    let saiu = false, y0 = null, dyAtual = 0, t0 = 0;
    function progresso(p) { prog = p; ov.style.setProperty("--p", p.toFixed(3)); }
    function sair() {
      if (saiu) return; saiu = true;
      try { sessionStorage.setItem("igr_intro", "1"); } catch (e) {}
      ov.classList.remove("arrastando");
      ov.style.transform = "";
      ov.classList.add("sai");
      vibrar(14);
      setTimeout(() => { vivo = false; ov.remove(); }, 1000);
    }
    function inclinar(e) {
      const r = ov.getBoundingClientRect();
      ov.style.setProperty("--ry", (((e.clientX - r.left) / r.width - .5) * 14).toFixed(1) + "deg");
      ov.style.setProperty("--rx", ((.5 - (e.clientY - r.top) / r.height) * 10).toFixed(1) + "deg");
    }
    ov.addEventListener("pointerdown", e => {
      if (e.target.closest(".intro-copy")) return;
      y0 = e.clientY; t0 = performance.now(); dyAtual = 0;
      ov.classList.add("arrastando");
      try { ov.setPointerCapture(e.pointerId); } catch (x) {}
    });
    ov.addEventListener("pointermove", e => {
      inclinar(e);
      if (y0 === null) return;
      dyAtual = Math.min(0, e.clientY - y0);
      ov.style.transform = `translateY(${dyAtual}px)`;
      progresso(Math.min(1, -dyAtual / (innerHeight * .45)));
    });
    function soltar() {
      if (y0 === null) return;
      const v = -dyAtual / Math.max(1, performance.now() - t0);
      const deslizou = dyAtual < -90 || v > .6 && dyAtual < -30;
      y0 = null;
      if (deslizou) { sair(); return; }
      ov.classList.remove("arrastando");
      ov.style.transform = "";
      progresso(0);
      if (dyAtual > -8) { const d = $(".intro-dica", ov); d.classList.remove("nudge"); void d.offsetWidth; d.classList.add("nudge"); }
    }
    ov.addEventListener("pointerup", soltar);
    ov.addEventListener("pointercancel", soltar);
    ov.addEventListener("wheel", e => { if (e.deltaY > 20) sair(); }, { passive: true });
    document.addEventListener("keydown", e => { if (!saiu && (e.key === "Enter" || e.key === "ArrowUp" || e.key === " ")) sair(); });
  }
  abertura();

  /* ============ 2) EXPLORAR ============ */
  const ex = $("#menu-explorar");
  function abrirExplorar() {
    if (!ex) return;
    $$(".quicklink", ex).forEach((q, i) => q.style.setProperty("--n", i));
    ex.classList.add("aberto"); ex.setAttribute("aria-hidden", "false");
    const b = $("#explorar-busca"); if (b) b.value = "";
    filtrarExplorar("");
    vibrar(10);
  }
  function fecharExplorar() { if (ex) { ex.classList.remove("aberto"); ex.setAttribute("aria-hidden", "true"); } }
  function filtrarExplorar(t) {
    const q = t.trim().toLowerCase();
    $$(".quicklink", ex).forEach(el => {
      const txt = el.textContent.toLowerCase();
      el.classList.toggle("oculto", !!q && !txt.includes(q));
    });
    $$(".explorar-grupo", ex).forEach(g => {
      const grid = g.nextElementSibling;
      const algum = $$(".quicklink", grid).some(e => !e.classList.contains("oculto") && e.style.display !== "none");
      g.classList.toggle("oculto", !!q && !algum);
      grid.style.display = (!!q && !algum) ? "none" : "";
    });
  }
  document.addEventListener("click", e => {
    if (e.target.closest("[data-abrir-explorar]")) { e.preventDefault(); abrirExplorar(); }
    else if (e.target.closest("[data-fechar-explorar]")) fecharExplorar();
    else if (ex && ex.classList.contains("aberto") && e.target.closest("#menu-explorar .quicklink")) setTimeout(fecharExplorar, 30);
  });
  const bx = $("#explorar-busca");
  if (bx) bx.addEventListener("input", () => filtrarExplorar(bx.value));
  // qualquer troca de tela fecha o menu
  const mo = new MutationObserver(() => fecharExplorar());
  $$(".screen").forEach(s => mo.observe(s, { attributes: true, attributeFilter: ["class"] }));

  /* ============ 3) CARROSSEL DE DESTAQUES ============ */
  const car = $("#hero-carousel");
  function atualizarCarrossel() {
    if (!car) return;
    const slides = $$(".slide", car).filter(s => s.offsetParent !== null);
    const cx = car.scrollLeft + car.clientWidth / 2;
    let ativo = 0, melhor = 1e9;
    slides.forEach((s, i) => {
      const c = s.offsetLeft + s.offsetWidth / 2;
      const d = Math.min(1, Math.abs(cx - c) / (s.offsetWidth * 0.9));
      s.style.setProperty("--d", d.toFixed(3));
      if (Math.abs(cx - c) < melhor) { melhor = Math.abs(cx - c); ativo = i; }
    });
    const dots = $("#hero-dots");
    if (dots) {
      if (dots.children.length !== slides.length) dots.innerHTML = slides.map(() => "<i></i>").join("");
      Array.from(dots.children).forEach((d, i) => d.classList.toggle("on", i === ativo));
    }
  }
  if (car) {
    car.addEventListener("scroll", () => requestAnimationFrame(atualizarCarrossel), { passive: true });
    new MutationObserver(() => requestAnimationFrame(atualizarCarrossel)).observe(car, { childList: true, subtree: true });
    window.addEventListener("resize", atualizarCarrossel);
    setTimeout(atualizarCarrossel, 400);
  }

  /* ============ 4) STORIES ============ */
  const vistos = (() => { try { return JSON.parse(localStorage.getItem("igr_stories_vistos") || "{}"); } catch (e) { return {}; } })();
  const marcarVisto = id => { vistos[id] = Date.now(); try { localStorage.setItem("igr_stories_vistos", JSON.stringify(vistos)); } catch (e) {} };
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const clicar = nav => () => { const el = document.querySelector(`[data-nav="${nav}"]`); if (el) el.click(); };

  function montarGrupos() {
    const grupos = [];
    // Culto
    const hero = $("#home-proximo-culto .culto-hero");
    if (hero) {
      const bg = (hero.style.backgroundImage || "").match(/url\(["']?(.*?)["']?\)/);
      grupos.push({
        id: "culto", rotulo: "Culto", icone: "k-church", capa: bg ? bg[1] : null,
        itens: [{
          selo: ($(".culto-quando", hero) || {}).textContent || "Próximo culto",
          titulo: ($("h3", hero) || {}).textContent || "Próximo culto",
          texto: ($(".culto-local", hero) || {}).textContent || "", imagem: bg ? bg[1] : null, acao: ["Ver cultos", clicar("tela-sobre-igreja")],
        }],
      });
    }
    // Devocional
    const dt = $("#home-devo-titulo");
    if (dt && dt.textContent && !/carregando/i.test(dt.textContent)) {
      grupos.push({
        id: "devo", rotulo: "Devocional", icone: "i-sparkle",
        itens: [{ selo: "Devocional de hoje", titulo: dt.textContent, texto: ($("#home-devo-resumo") || {}).textContent || "", cor: ["#3B4DFF", "#7A3CFF"], acao: ["Ler agora", () => { const b = $("#btn-ler-devocional"); if (b) b.click(); }] }],
      });
    }
    // Avisos
    const av = (typeof state !== "undefined" && state.avisosHomeCache) || [];
    if (av.length) {
      grupos.push({
        id: "avisos", rotulo: "Avisos", icone: "i-bell", capa: (av.find(a => a.imagem_url) || {}).imagem_url,
        itens: av.map(a => ({
          selo: a.link_destino ? "Em destaque" : "Aviso", titulo: a.titulo, texto: a.texto || "", imagem: a.imagem_url || null,
          cor: ["#0f1a4d", "#5a1d62"],
          acao: a.link_destino ? ["Assistir agora", clicar(a.link_destino)] : null,
        })),
        versao: av.map(a => a.id).join(","),
      });
    }
    // Jerusalém
    grupos.push({
      id: "jerusalem", rotulo: "Ao vivo", icone: "k-live",
      itens: [{ selo: "Ao vivo agora", titulo: "Jerusalém", texto: "Veja o Muro das Lamentações em tempo real.", cor: ["#FF5C7A", "#5a1230"], acao: ["Assistir", clicar("tela-camera-jerusalem")] }],
    });
    return grupos;
  }

  let GRUPOS = [];
  function renderAneis() {
    const row = $("#home-stories");
    if (!row) return;
    GRUPOS = montarGrupos();
    row.innerHTML = GRUPOS.map((g, i) => {
      const visto = vistos[g.id + (g.versao || "")];
      const miolo = g.capa
        ? `<div class="miolo" style="background-image:url(&quot;${esc(g.capa)}&quot;)"></div>`
        : `<div class="miolo"><svg class="icon"><use href="#${g.icone}"/></svg></div>`;
      return `<button class="story-ring ${visto ? "visto" : ""}" data-story="${i}"><span class="aro">${miolo}</span><small>${esc(g.rotulo)}</small></button>`;
    }).join("");
  }
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-story]");
    if (b) abrirStory(parseInt(b.dataset.story, 10));
  });
  // reconstrói quando a Home fica ativa ou quando os dados chegam
  document.addEventListener("avisos-prontos", () => setTimeout(renderAneis, 50));
  const home = $("#tela-membro-home");
  if (home) new MutationObserver(() => { if (home.classList.contains("active")) setTimeout(renderAneis, 600); }).observe(home, { attributes: true, attributeFilter: ["class"] });
  setTimeout(renderAneis, 2500); setTimeout(renderAneis, 6000);

  // visualizador
  let viewer = null, gi = 0, ii = 0, timer = null;
  const DUR = 6000;
  function criarViewer() {
    if (viewer) return viewer;
    viewer = document.createElement("div");
    viewer.id = "story-viewer";
    viewer.innerHTML = `<div class="sv-bg"></div><div class="sv-img" style="display:none"></div><div class="sv-barras"></div>
      <div class="sv-topo"><b></b><button class="sv-x" aria-label="Fechar"><svg class="icon"><use href="#k-close"/></svg></button></div>
      <div class="sv-zona esq"></div><div class="sv-zona dir"></div>
      <div class="sv-texto"><span class="sv-sel"></span><h3></h3><p></p><button class="sv-cta" style="display:none"></button></div>`;
    document.body.appendChild(viewer);
    $(".sv-x", viewer).addEventListener("click", fechar);
    $(".sv-zona.esq", viewer).addEventListener("click", anterior);
    $(".sv-zona.dir", viewer).addEventListener("click", proximo);
    // segurar pausa
    const pausa = v => viewer.classList.toggle("pausado", v);
    ["pointerdown"].forEach(ev => viewer.addEventListener(ev, e => { if (!e.target.closest("button")) { pausa(true); clearTimeout(timer); } }));
    ["pointerup", "pointercancel"].forEach(ev => viewer.addEventListener(ev, () => { if (viewer.classList.contains("pausado")) { pausa(false); agendar(restante); } }));
    // arrastar pra baixo fecha
    let y0 = null;
    viewer.addEventListener("touchstart", e => { y0 = e.touches[0].clientY; }, { passive: true });
    viewer.addEventListener("touchend", e => { if (y0 != null && e.changedTouches[0].clientY - y0 > 110) fechar(); y0 = null; }, { passive: true });
    return viewer;
  }
  let inicioItem = 0, restante = DUR;
  function agendar(ms) { clearTimeout(timer); restante = ms; inicioItem = Date.now(); timer = setTimeout(proximo, ms); }
  function mostrar() {
    const g = GRUPOS[gi]; if (!g) return fechar();
    const it = g.itens[ii]; if (!it) return proximo();
    const v = viewer;
    $(".sv-barras", v).innerHTML = g.itens.map((_, k) => `<i class="${k < ii ? "feito" : k === ii ? "ativo" : ""}"><b></b></i>`).join("");
    $(".sv-barras", v).style.setProperty("--dur", DUR + "ms");
    $$(".sv-barras i.ativo", v).forEach(el => el.style.setProperty("--dur", DUR + "ms"));
    $(".sv-topo b", v).textContent = g.rotulo;
    const bg = $(".sv-bg", v), img = $(".sv-img", v);
    if (it.imagem) {
      bg.className = "sv-bg"; bg.style.background = ""; bg.style.backgroundImage = `url("${it.imagem}")`;
      img.style.display = "block"; img.style.backgroundImage = `url("${it.imagem}")`;
      img.style.animation = "none"; void img.offsetWidth; img.style.animation = "";
    } else {
      const c = it.cor || ["#1b2260", "#3a1230"];
      bg.className = "sv-bg grad"; bg.style.backgroundImage = "";
      bg.style.background = `radial-gradient(90% 60% at 80% 10%, ${c[0]}, transparent 70%), radial-gradient(80% 60% at 10% 90%, ${c[1]}, transparent 70%), #07080d`;
      img.style.display = "none";
    }
    $(".sv-sel", v).textContent = it.selo || "";
    $("h3", $(".sv-texto", v)).textContent = it.titulo || "";
    $("p", $(".sv-texto", v)).textContent = it.texto || "";
    const t = $(".sv-texto", v); t.style.animation = "none"; void t.offsetWidth; t.style.animation = "";
    const cta = $(".sv-cta", v);
    if (it.acao) { cta.style.display = "inline-flex"; cta.textContent = it.acao[0] + "  →"; cta.onclick = () => { fechar(); it.acao[1](); }; }
    else cta.style.display = "none";
    v.classList.remove("pausado");
    agendar(DUR);
  }
  function abrirStory(i) {
    GRUPOS = GRUPOS.length ? GRUPOS : montarGrupos();
    if (!GRUPOS[i]) return;
    criarViewer(); gi = i; ii = 0;
    viewer.classList.add("aberto");
    document.body.style.overflow = "hidden";
    vibrar(8);
    mostrar();
  }
  function fechar() {
    clearTimeout(timer);
    if (viewer) viewer.classList.remove("aberto");
    document.body.style.overflow = "";
    const g = GRUPOS[gi]; if (g) marcarVisto(g.id + (g.versao || ""));
    renderAneis();
  }
  function proximo() {
    const g = GRUPOS[gi];
    if (g && ii < g.itens.length - 1) { ii++; return mostrar(); }
    if (g) marcarVisto(g.id + (g.versao || ""));
    if (gi < GRUPOS.length - 1) { gi++; ii = 0; return mostrar(); }
    fechar();
  }
  function anterior() {
    if (ii > 0) { ii--; return mostrar(); }
    if (gi > 0) { gi--; ii = 0; return mostrar(); }
    mostrar();
  }
})();
