/* V7: nav líquida, texto que acende ao rolar, rodapé de direitos (DDS Inovação). */
(function () {
  const reduz = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* 1) Nav líquida: um "vidro" que desliza até o item ativo */
  function posicionar(nav) {
    const blob = nav.querySelector(".nav-blob");
    const on = nav.querySelector(".navitem.on:not(.nav-fab)");
    if (!blob) return;
    if (!on || !on.offsetWidth) { blob.style.opacity = 0; return; }
    const w = Math.min(70, on.offsetWidth - 6);
    blob.style.width = w + "px";
    blob.style.opacity = 1;
    blob.style.transform = `translateX(${on.offsetLeft + (on.offsetWidth - w) / 2}px)`;
  }
  function iniciarNav() {
    $$(".bottomnav").forEach(nav => {
      if (!nav.querySelector(".nav-blob")) { const b = document.createElement("span"); b.className = "nav-blob"; nav.prepend(b); }
      posicionar(nav);
      new MutationObserver(() => posicionar(nav)).observe(nav, { subtree: true, attributes: true, attributeFilter: ["class", "style"] });
    });
  }
  window.addEventListener("resize", () => $$(".bottomnav").forEach(posicionar));
  setTimeout(() => $$(".bottomnav").forEach(posicionar), 600);

  /* 2) Versículo do dia: palavras acendem conforme a rolagem */
  const VERSOS = [
    ["Tudo posso naquele que me fortalece.", "Filipenses 4:13"],
    ["O Senhor é o meu pastor; nada me faltará.", "Salmo 23:1"],
    ["Entrega o teu caminho ao Senhor; confia nele, e ele tudo fará.", "Salmo 37:5"],
    ["Sede fortes e corajosos; o Senhor vosso Deus está convosco.", "Josué 1:9"],
    ["Lancem sobre ele toda a sua ansiedade, porque ele cuida de vocês.", "1 Pedro 5:7"],
    ["A tua palavra é lâmpada para os meus pés e luz para o meu caminho.", "Salmo 119:105"],
  ];
  function montarVerso() {
    const alvo = document.getElementById("home-avisos");
    if (!alvo || document.getElementById("verso-dia")) return;
    const dia = Math.floor(Date.now() / 86400000);
    const v = VERSOS[dia % VERSOS.length];
    const sec = document.createElement("div");
    sec.id = "verso-dia"; sec.className = "verso-dia";
    sec.innerHTML = `<div class="vd-eyebrow">Palavra do dia</div><p class="vd-texto">${v[0].split(" ").map(w => `<span>${w}</span>`).join(" ")}</p><div class="vd-ref">${v[1]}</div>`;
    alvo.parentElement.insertBefore(sec, alvo.previousElementSibling || alvo);
    const sc = sec.closest(".scroll");
    const palavras = $$(".vd-texto span", sec);
    function atualiza() {
      const r = sec.getBoundingClientRect(), h = (sc ? sc.getBoundingClientRect().height : innerHeight);
      const p = Math.max(0, Math.min(1, (h * .92 - r.top) / (h * .62)));
      const n = Math.round(p * palavras.length);
      palavras.forEach((w, i) => w.classList.toggle("on", i < n));
    }
    if (reduz) palavras.forEach(w => w.classList.add("on")); else { (sc || window).addEventListener("scroll", atualiza, { passive: true }); atualiza(); setTimeout(atualiza, 400); }
  }

  /* 3) Rodapé de direitos com link da DDS Inovação */
  function rodape() {
    ["tela-membro-home", "tela-visitante", "tela-login"].forEach(id => {
      const sc = document.querySelector(`#${id} .scroll`);
      if (!sc || sc.querySelector(".dds-copy")) return;
      const f = document.createElement("footer");
      f.className = "dds-copy";
      f.innerHTML = `© 2026 · <a href="https://ddsinovacao.com.br" target="_blank" rel="noopener">DDS Inovação</a><small>Todos os direitos reservados</small>`;
      sc.appendChild(f);
    });
  }

  function iniciar() { iniciarNav(); rodape(); } /* a palavra do dia agora é a do v11 */
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
})();
