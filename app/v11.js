/* V11: palavra do dia, aniversariantes de hoje. */
(function () {
  const REFS = ["Salmos 23:1", "Salmos 23:4", "Salmos 27:1", "Salmos 27:14", "Salmos 34:8", "Salmos 34:18", "Salmos 37:4", "Salmos 37:5", "Salmos 46:1", "Salmos 46:10", "Salmos 55:22", "Salmos 56:3", "Salmos 62:1", "Salmos 91:1", "Salmos 91:2", "Salmos 91:11", "Salmos 100:4", "Salmos 103:1", "Salmos 103:2", "Salmos 103:8", "Salmos 118:24", "Salmos 119:105", "Salmos 121:1", "Salmos 121:2", "Salmos 121:7", "Salmos 139:14", "Salmos 145:18", "Salmos 147:3", "Salmos 1:1", "Salmos 4:8", "Salmos 5:3", "Salmos 9:10", "Salmos 16:8", "Salmos 18:2", "Salmos 19:14", "Salmos 25:4", "Salmos 28:7", "Salmos 30:5", "Salmos 31:24", "Salmos 32:8", "Salmos 33:4", "Salmos 36:5", "Salmos 40:1", "Salmos 42:11", "Salmos 51:10", "Salmos 63:1", "Salmos 68:19", "Salmos 73:26", "Salmos 84:11", "Salmos 86:5", "Salmos 90:12", "Salmos 94:19", "Salmos 107:1", "Salmos 112:7", "Salmos 116:1", "Salmos 118:1", "Salmos 119:11", "Salmos 126:5", "Salmos 127:1", "Salmos 138:8", "Salmos 143:8", "Salmos 150:6", "Provérbios 3:5", "Provérbios 3:6", "Provérbios 4:23", "Provérbios 11:25", "Provérbios 12:25", "Provérbios 15:1", "Provérbios 16:3", "Provérbios 16:9", "Provérbios 17:17", "Provérbios 18:10", "Provérbios 18:24", "Provérbios 19:21", "Provérbios 22:6", "Provérbios 27:17", "Provérbios 31:25", "Provérbios 1:7", "Provérbios 2:6", "Provérbios 3:9", "Provérbios 10:12", "Provérbios 14:26", "Provérbios 16:24", "Provérbios 21:2", "Provérbios 24:16", "Provérbios 28:13", "Provérbios 29:25", "Isaías 40:31", "Isaías 41:10", "Isaías 41:13", "Isaías 43:1", "Isaías 43:2", "Isaías 26:3", "Isaías 30:15", "Isaías 53:5", "Isaías 54:10", "Isaías 55:8", "Isaías 58:11", "Isaías 9:6", "Isaías 12:2", "Isaías 40:8", "Isaías 40:29", "Isaías 49:15", "Isaías 55:11", "Isaías 60:1", "Jeremias 29:11", "Jeremias 29:13", "Jeremias 17:7", "Jeremias 31:3", "Jeremias 33:3", "Jeremias 1:5", "Lamentações 3:22", "Lamentações 3:23", "Ezequiel 36:26", "Daniel 12:3", "Miqueias 6:8", "Naum 1:7", "Habacuque 3:19", "Sofonias 3:17", "Josué 1:9", "Josué 24:15", "Deuteronômio 31:6", "Deuteronômio 31:8", "Deuteronômio 6:5", "Deuteronômio 33:27", "Êxodo 14:14", "Êxodo 15:2", "Êxodo 33:14", "Números 6:24", "Números 6:25", "Números 6:26", "Gênesis 1:1", "Gênesis 28:15", "Gênesis 50:20", "1 Samuel 16:7", "2 Crônicas 7:14", "1 Crônicas 16:34", "Neemias 8:10", "Jó 19:25", "Eclesiastes 3:1", "Eclesiastes 4:9", "Eclesiastes 3:11", "Cantares 2:4", "Joel 2:25", "Ageu 2:9", "Zacarias 4:6", "Malaquias 3:10", "Rute 1:16", "Juízes 6:12", "1 Reis 8:56", "2 Reis 6:16", "Mateus 5:3", "Mateus 5:9", "Mateus 5:14", "Mateus 5:16", "Mateus 6:9", "Mateus 6:21", "Mateus 6:33", "Mateus 6:34", "Mateus 7:7", "Mateus 7:12", "Mateus 11:28", "Mateus 11:29", "Mateus 17:20", "Mateus 19:26", "Mateus 22:37", "Mateus 28:19", "Mateus 28:20", "Mateus 5:44", "Mateus 6:14", "Mateus 18:20", "Mateus 5:8", "Mateus 6:25", "Marcos 9:23", "Marcos 10:27", "Marcos 11:24", "Marcos 12:30", "Marcos 16:15", "Marcos 5:36", "Marcos 10:45", "Marcos 1:35", "Lucas 1:37", "Lucas 1:45", "Lucas 6:31", "Lucas 6:36", "Lucas 11:9", "Lucas 12:7", "Lucas 12:34", "Lucas 18:27", "Lucas 2:10", "Lucas 2:11", "Lucas 10:27", "Lucas 15:20", "João 1:1", "João 1:12", "João 3:16", "João 3:17", "João 8:12", "João 8:32", "João 10:10", "João 10:11", "João 11:25", "João 13:34", "João 14:1", "João 14:6", "João 14:15", "João 14:27", "João 15:5", "João 15:7", "João 15:9", "João 15:12", "João 15:13", "João 16:33", "João 17:3", "João 20:29", "Atos 1:8", "Atos 2:38", "Atos 4:12", "Atos 16:31", "Atos 20:35", "Atos 17:28", "Atos 3:19", "Romanos 1:16", "Romanos 5:1", "Romanos 5:8", "Romanos 6:23", "Romanos 8:1", "Romanos 8:18", "Romanos 8:26", "Romanos 8:28", "Romanos 8:31", "Romanos 8:37", "Romanos 8:38", "Romanos 10:9", "Romanos 10:17", "Romanos 12:1", "Romanos 12:2", "Romanos 12:12", "Romanos 12:21", "Romanos 15:13", "Romanos 12:10", "Romanos 14:8", "1 Coríntios 10:13", "1 Coríntios 13:4", "1 Coríntios 13:13", "1 Coríntios 15:58", "1 Coríntios 16:13", "1 Coríntios 16:14", "1 Coríntios 2:9", "1 Coríntios 6:19", "2 Coríntios 4:17", "2 Coríntios 4:18", "2 Coríntios 5:7", "2 Coríntios 5:17", "2 Coríntios 9:7", "2 Coríntios 12:9", "2 Coríntios 3:17", "Gálatas 2:20", "Gálatas 5:22", "Gálatas 5:1", "Gálatas 6:9", "Gálatas 6:2", "Efésios 2:8", "Efésios 2:10", "Efésios 3:20", "Efésios 4:2", "Efésios 4:32", "Efésios 6:10", "Efésios 6:11", "Efésios 1:3", "Efésios 3:17", "Efésios 5:2", "Filipenses 1:6", "Filipenses 2:3", "Filipenses 3:13", "Filipenses 3:14", "Filipenses 4:4", "Filipenses 4:6", "Filipenses 4:7", "Filipenses 4:8", "Filipenses 4:11", "Filipenses 4:13", "Filipenses 4:19", "Colossenses 3:2", "Colossenses 3:12", "Colossenses 3:14", "Colossenses 3:15", "Colossenses 3:23", "Colossenses 4:2", "1 Tessalonicenses 5:16", "1 Tessalonicenses 5:17", "1 Tessalonicenses 5:18", "1 Tessalonicenses 5:11", "2 Tessalonicenses 3:3", "1 Timóteo 4:12", "1 Timóteo 6:6", "2 Timóteo 1:7", "2 Timóteo 3:16", "2 Timóteo 4:7", "Tito 2:11", "Hebreus 4:12", "Hebreus 4:16", "Hebreus 10:23", "Hebreus 11:1", "Hebreus 11:6", "Hebreus 12:1", "Hebreus 12:2", "Hebreus 13:5", "Hebreus 13:8", "Tiago 1:2", "Tiago 1:5", "Tiago 1:12", "Tiago 1:17", "Tiago 1:22", "Tiago 4:7", "Tiago 4:8", "Tiago 5:16", "1 Pedro 2:9", "1 Pedro 3:15", "1 Pedro 4:8", "1 Pedro 5:7", "1 Pedro 5:10", "2 Pedro 3:9", "1 João 1:9", "1 João 3:1", "1 João 3:18", "1 João 4:8", "1 João 4:18", "1 João 4:19", "1 João 5:14", "Judas 1:24", "Apocalipse 3:20", "Apocalipse 21:4", "Apocalipse 22:13", "Apocalipse 1:8", "Apocalipse 3:8", "Apocalipse 21:5", "Salmos 8:3", "Salmos 13:5", "Salmos 20:4", "Salmos 23:6", "Salmos 29:11", "Salmos 33:18", "Salmos 34:4", "Salmos 37:23", "Salmos 37:7", "Salmos 46:2", "Salmos 57:1", "Salmos 61:2", "Salmos 66:20", "Salmos 71:5", "Salmos 85:10", "Salmos 92:1", "Salmos 95:6", "Salmos 96:1", "Salmos 98:1", "Salmos 111:10", "Salmos 113:3", "Salmos 119:50", "Salmos 130:5", "Salmos 133:1", "Salmos 136:1", "Salmos 139:23", "Salmos 141:3", "Salmos 146:5", "Salmos 149:4"];
  const $ = id => document.getElementById(id);
  const SB = () => (typeof sb !== "undefined" ? sb : null);
  const ST = () => (typeof state !== "undefined" ? state : null);
  const MESES = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  const pad = n => String(n).padStart(2, "0");
  const agora = () => new Date();
  const chaveHoje = () => { const d = agora(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
  function diaDoAno() { const d = agora(); return Math.floor((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(d.getFullYear(), 0, 0)) / 864e5); }
  // 89 e 366 não têm divisor comum: percorre a lista toda, sem repetir, e sem ficar só em Salmos em sequência
  const refDoDia = () => REFS[(diaDoAno() * 89) % REFS.length];
  let palavra = null;

  async function carregarPalavra() {
    const ref = refDoDia(); const ch = "igr_pdd_" + chaveHoje();
    let texto = null;
    try { const c = JSON.parse(localStorage.getItem(ch) || "null"); if (c && c.ref === ref && c.texto) texto = c.texto; } catch (e) {}
    if (!texto && SB()) {
      try {
        const { data, error } = await SB().functions.invoke("igr-biblia-texto", { body: { referencia: ref } });
        if (!error && data && data.texto) texto = String(data.texto).replace(/\s+/g, " ").trim();
      } catch (e) {}
      if (texto) { try { localStorage.setItem(ch, JSON.stringify({ ref, texto })); } catch (e) {} }
    }
    palavra = { ref, texto };
    return palavra;
  }

  function pintarPalavra() {
    const box = $("palavra-dia"); if (!box || !palavra) return;
    const d = agora();
    $("pdd-data").textContent = d.getDate() + " de " + MESES[d.getMonth()];
    $("pdd-texto").textContent = palavra.texto ? "“" + palavra.texto + "”" : "Toque em compartilhar ou abra a Bíblia para ler este versículo.";
    $("pdd-ref").textContent = palavra.ref;
    box.hidden = false;
  }

  /* ---------- imagem para compartilhar ---------- */
  function quebrar(ctx, txt, larg) {
    const ps = txt.split(" "), ls = []; let l = "";
    ps.forEach(p => { const t = l ? l + " " + p : p; if (ctx.measureText(t).width > larg && l) { ls.push(l); l = p; } else l = t; });
    if (l) ls.push(l); return ls;
  }
  function carregarImg(src) { return new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = src; }); }
  async function gerarImagem() {
    try { await document.fonts.ready; } catch (e) {}
    const W = 1080, H = 1350, c = document.createElement("canvas"); c.width = W; c.height = H; const x = c.getContext("2d");
    const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, "#0a1a6e"); g.addColorStop(.55, "#0026B7"); g.addColorStop(1, "#05070f");
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    const r = x.createRadialGradient(W * .85, H * .1, 10, W * .85, H * .1, 700); r.addColorStop(0, "rgba(249,189,0,.35)"); r.addColorStop(1, "rgba(249,189,0,0)");
    x.fillStyle = r; x.fillRect(0, 0, W, H);
    const logo = await carregarImg("assets/logo-branca.png");
    if (logo) { const lw = 260, lh = lw * logo.height / logo.width; x.drawImage(logo, (W - lw) / 2, 90, lw, lh); }
    x.textAlign = "center"; x.fillStyle = "#F9BD00"; x.font = "600 30px Manrope, sans-serif";
    const d = agora(); x.fillText("PALAVRA DO DIA  ·  " + d.getDate() + " de " + MESES[d.getMonth()], W / 2, 430);
    x.fillStyle = "#fff"; let tam = 58; const texto = "“" + (palavra.texto || palavra.ref) + "”"; let ls;
    do { x.font = "400 " + tam + "px Fraunces, Georgia, serif"; ls = quebrar(x, texto, W - 220); tam -= 3; } while (ls.length * tam * 1.38 > 560 && tam > 30);
    const lh = tam * 1.45 + 4; let y = 520 + Math.max(0, (560 - ls.length * lh) / 2);
    ls.forEach(l => { x.fillText(l, W / 2, y); y += lh; });
    x.fillStyle = "#F9BD00"; x.font = "italic 400 44px Fraunces, Georgia, serif"; x.fillText(palavra.ref, W / 2, 1140);
    x.fillStyle = "rgba(255,255,255,.7)"; x.font = "500 28px Manrope, sans-serif";
    const nome = (ST() && ST().igreja && ST().igreja.nome) || "Nossa igreja"; x.fillText(nome, W / 2, 1230);
    return new Promise(res => c.toBlob(b => res(b), "image/png"));
  }
  async function compartilhar() {
    if (!palavra) return;
    const btn = $("pdd-compartilhar"); btn.disabled = true;
    const nome = (ST() && ST().igreja && ST().igreja.nome) || "";
    const msg = (palavra.texto ? "“" + palavra.texto + "” — " : "") + palavra.ref + "\n\nPalavra do dia · " + nome + "\nhttps://ieqvilareal.com.br/app";
    try {
      const blob = await gerarImagem();
      const arq = blob && new File([blob], "palavra-do-dia.png", { type: "image/png" });
      if (arq && navigator.canShare && navigator.canShare({ files: [arq] })) await navigator.share({ files: [arq], text: msg });
      else if (navigator.share) await navigator.share({ text: msg });
      else if (blob) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "palavra-do-dia.png"; a.click(); }
      else if (navigator.clipboard) { await navigator.clipboard.writeText(msg); if (window.mostrarToast) mostrarToast("Texto copiado"); }
    } catch (e) { /* cancelou */ }
    btn.disabled = false;
  }
  document.addEventListener("click", e => { if (e.target.closest && e.target.closest("#pdd-compartilhar")) compartilhar(); });

  /* ---------- aniversariantes de hoje ---------- */
  async function carregarAnivHoje(m) {
    const box = $("aniv-hoje"); if (!box || !SB() || !ST() || !ST().igreja) return;
    try {
      const { data } = await SB().from("igr_membros").select("id,nome_completo,data_nascimento,telefone,foto_url")
        .eq("igreja_id", state.igreja.id).not("data_nascimento", "is", null);
      const d = agora(), mm = d.getMonth() + 1, dd = d.getDate();
      const hoje = (data || []).filter(p => { const s = String(p.data_nascimento).slice(5, 10).split("-"); return +s[0] === mm && +s[1] === dd; });
      if (!hoje.length) { box.hidden = true; return; }
      const meu = m && m.id;
      $("aniv-hoje-lista").innerHTML = hoje.map(p => {
        const foto = p.foto_url ? `<img src="${p.foto_url}" alt="">` : (typeof avatarIniciais === "function" ? avatarIniciais(p.nome_completo) : "");
        const eu = p.id === meu;
        return `<button type="button" class="ah-p" data-ah="${p.id}" ${eu ? "data-eu=1" : ""}><span class="ah-f">${foto}</span><b>${eu ? "Você" : p.nome_completo.split(" ")[0]}</b><small>${eu ? "Feliz aniversário!" : "Mandar parabéns"}</small></button>`;
      }).join("");
      $("aniv-hoje-tit").textContent = hoje.length === 1 ? "Hoje é aniversário!" : "Hoje tem " + hoje.length + " aniversariantes!";
      box.hidden = false;
      box.querySelectorAll("[data-ah]").forEach(el => el.onclick = () => {
        if (el.dataset.eu) return;
        const p = hoje.find(x => x.id === el.dataset.ah); if (p && typeof abrirModalAniversariante === "function") abrirModalAniversariante(p);
      });
    } catch (e) { console.error("anivhoje", e); box.hidden = true; }
  }

  function iniciar() {
    const orig = window.v8Home;
    window.v8Home = async function (m) {
      if (orig) { try { await orig(m); } catch (e) {} }
      carregarPalavra().then(pintarPalavra);
      carregarAnivHoje(m);
    };
  }
  document.addEventListener("click", e => {
    if (e.target.closest && e.target.closest("#btn-sair")) { const d = $("drawer-admin"); if (d) { d.setAttribute("data-nav", "tela-admin-login"); d.onclick = null; } }
  });
  iniciar();
})();
