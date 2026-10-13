/* V9: tema claro/escuro e ícones de linha no lugar de emojis. */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const html = document.documentElement;

  /* ---------- tema ---------- */
  function rotulo() {
    const claro = html.classList.contains("claro");
    const r = $("#tema-rotulo"); if (r) r.textContent = claro ? "Claro" : "Escuro";
    const u = document.querySelector(".dt-ic use"); if (u) u.setAttribute("href", claro ? "#k-sun" : "#k-moon");
    const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = claro ? "#f5f0e6" : "#08090C";
  }
  function alternar() {
    html.classList.toggle("claro");
    try { localStorage.setItem("igr_tema", html.classList.contains("claro") ? "claro" : "escuro"); } catch (e) {}
    rotulo();
  }
  document.addEventListener("click", e => { if (e.target.closest && e.target.closest("#btn-tema")) alternar(); });
  rotulo();

  /* ---------- emojis → ícones ---------- */
  const MAPA = { "📤": "k-share2", "🎮": "k-trophy", "🏅": "k-medal", "📍": "k-pin", "❓": "k-help", "📥": "k-download", "📢": "k-megaphone", "📝": "k-note", "🎨": "k-palette", "🔑": "k-lock", "➕": "k-plus", "✨": "k-sparkle2", "✏️": "k-note" };
  const RE = new RegExp("(" + Object.keys(MAPA).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")\\uFE0F?", "g");
  const PULAR = "script,style,textarea,input,svg,#palavra,.moods,.reacao-btn,.reacao-row,.mood,.explorar-busca,[data-sem-ic]";
  function trocar(raiz) {
    if (!raiz || raiz.nodeType !== 1 && raiz.nodeType !== 3) return;
    const base = raiz.nodeType === 3 ? raiz.parentElement : raiz;
    if (!base || base.closest && base.closest(PULAR)) return;
    const nos = [];
    if (raiz.nodeType === 3) nos.push(raiz);
    else { const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT, { acceptNode: n => RE.test(n.nodeValue) && !(n.parentElement && n.parentElement.closest(PULAR)) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT }); RE.lastIndex = 0; let n; while ((n = w.nextNode())) nos.push(n); }
    nos.forEach(n => {
      RE.lastIndex = 0; if (!RE.test(n.nodeValue)) return; RE.lastIndex = 0;
      const frag = document.createDocumentFragment(); let ult = 0, m; const t = n.nodeValue;
      while ((m = RE.exec(t))) {
        frag.appendChild(document.createTextNode(t.slice(ult, m.index)));
        const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("class", "ic8"); s.setAttribute("viewBox", "0 0 24 24");
        const u = document.createElementNS("http://www.w3.org/2000/svg", "use"); u.setAttribute("href", "#" + MAPA[m[1]]); s.appendChild(u); frag.appendChild(s);
        ult = m.index + m[0].length;
      }
      frag.appendChild(document.createTextNode(t.slice(ult)));
      n.parentNode.replaceChild(frag, n);
    });
  }
  let agendado = false; const fila = new Set();
  function processar() { agendado = false; fila.forEach(n => { if (n.isConnected) trocar(n); }); fila.clear(); }
  const obs = new MutationObserver(ms => {
    ms.forEach(m => { m.addedNodes.forEach(n => fila.add(n)); if (m.type === "characterData") fila.add(m.target); });
    if (!agendado) { agendado = true; setTimeout(processar, 30); }
  });
  function iniciar() { trocar(document.body); obs.observe(document.body, { childList: true, subtree: true, characterData: true }); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
})();
