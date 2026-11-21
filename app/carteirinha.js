/* IEQ Vila Real — Carteirinha de membro (frente e verso, PNG e PDF) */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const SITE = "https://ieqvilareal.com.br";
  let PASTORES = [];
  const assinatura = n => String(n || "").replace(/^(pr|pra|pastor|pastora|ap|missionári[oa])\.?\s+/i, "").trim();
  async function carregarPastores() {
    try {
      const { data } = await sb.from("igr_pastores").select("nome,ordem").eq("igreja_id", state.igreja.id).order("ordem");
      PASTORES = (data || []).slice(0, 2).map(p => ({ nome: p.nome, ass: assinatura(p.nome) }));
    } catch (e) { PASTORES = []; }
    if (!PASTORES.length && state.igreja.pastor_principal) PASTORES = [{ nome: state.igreja.pastor_principal, ass: assinatura(state.igreja.pastor_principal) }];
  }
  const W = 1012, H = 638;

  const dataBR = d => { if (!d) return "—"; const [a, m, dd] = String(d).slice(0, 10).split("-"); return `${dd}/${m}/${a}`; };
  const mesAno = d => { if (!d) return "—"; const x = new Date(d); return x.toLocaleDateString("pt-BR", { month: "short", year: "numeric" }).replace(". de ", "/").replace(" de ", "/").replace(".", ""); };
  const iniciais = n => String(n || "?").trim().split(/\s+/).filter(p => p.length > 2 || /^[A-ZÁÉÍÓÚ]/.test(p)).slice(0, 2).map(p => p[0]).join("").toUpperCase() || "?";
  const tel = t => { const d = String(t || "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, ""); return d.length === 11 ? `(${d.slice(0, 2)}) ${d[2]} ${d.slice(3, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : (t || "—"); };

  // Nº do membro = ordem de cadastro (o campo "numero" daqui é o nº da casa, por isso não é usado nem gravado)
  async function numeroDoMembro(m) {
    try {
      const { count } = await sb.from("igr_membros").select("id", { count: "exact", head: true })
        .eq("igreja_id", state.igreja.id).lte("created_at", m.created_at);
      return "VR-" + String(count || 1).padStart(4, "0");
    } catch (e) { return "VR-" + String(m.id).slice(0, 4).toUpperCase(); }
  }

  const corOk = c => /^#[0-9a-f]{6}$/i.test(c || "");
  const cores = () => `--c1:${corOk(state.igreja?.cor_primaria) ? state.igreja.cor_primaria : "#0026B7"};--c2:${corOk(state.igreja?.cor_secundaria) ? state.igreja.cor_secundaria : "#F9BD00"}`;

  function montarCartao(d) {
    const foto = d.foto ? `<img src="${esc(d.foto)}" crossorigin="anonymous" alt="">` : `<div class="ct-ini">${esc(iniciais(d.nome))}</div>`;
    return `
    <div class="ct-card ct-frente" id="ct-frente" style="${cores()}">
      <img class="ct-marca" src="assets/logo-branca.png" alt="">
      <div class="ct-topo"><img class="ct-lg" src="assets/logo-branca.png" alt=""><div><span class="ct-nm">IEQ <em>Vila Real</em></span><small>Igreja do Evangelho Quadrangular</small></div></div>
      <div class="ct-tipo"><b>Carteira de Membro</b></div>
      <div class="ct-foto">${foto}</div>
      <div class="ct-dados">
        <h1>${esc(d.nome)}</h1>
        <div class="ct-cargo">${esc(d.cargo)}</div>
        <div class="ct-linha">
          <div><span>Nº de membro</span><b>${esc(d.numero)}</b></div>
          <div><span>Membro desde</span><b>${esc(d.desde)}</b></div>
          ${d.batismo ? `<div><span>Batismo</span><b>${esc(d.batismo)}</b></div>` : ""}
        </div>
      </div>
      <div class="ct-holo"><span>ieqvilareal.com.br</span><b>IEQ · ${new Date().getFullYear()}</b></div>
    </div>
    <div class="ct-card ct-verso" id="ct-verso" style="${cores()}">
      <img class="ct-marca" src="assets/logo-branca.png" alt="" style="left:-120px;right:auto;opacity:.05">
      <div class="ct-v-topo"><b>Dados do membro</b><span>IEQ Vila Real</span></div>
      <div class="ct-grade">
        <div><span>Data de nascimento</span><b>${esc(d.nasc)}</b></div>
        <div><span>Estado civil</span><b>${esc(d.civil)}</b></div>
        <div><span>Grupo</span><b>${esc(d.grupo)}</b></div>
        <div><span>Telefone</span><b>${esc(d.tel)}</b></div>
        <div><span>Batizado(a) por</span><b>${esc(d.pastorBatismo)}</b></div>
        <div><span>Emitida em</span><b>${esc(d.emissao)}</b></div>
      </div>
      <div class="ct-qr"><div class="q"><canvas id="ct-qr"></canvas></div><small>Aponte a câmera para<br>conferir a carteirinha</small></div>
      <div class="ct-ass" style="${PASTORES.length > 1 ? "" : "grid-template-columns:1fr;width:320px"}">
        ${PASTORES.map(p => `<div><div class="sig">${esc(p.ass)}</div><i></i><b>${esc(p.nome)}</b></div>`).join("")}
        <span>${PASTORES.length > 1 ? "Pastores Titulares" : "Pastor Titular"}</span>
      </div>
      <div class="ct-holo"><span>Esta carteira é pessoal e intransferível · IEQ Vila Real</span></div>
    </div>`;
  }

  async function dadosDoMembro(m) {
    const g = (state.grupos || []).find(x => x.id === m.grupo_id);
    const funcao = m.eh_lider ? "Líder" : "Membro";
    return {
      nome: m.nome_completo || "Membro",
      foto: m.foto_url || "",
      cargo: g ? `${funcao} · ${g.nome}` : funcao,
      numero: await numeroDoMembro(m),
      desde: mesAno(m.created_at),
      batismo: m.batizado && m.data_batismo ? dataBR(m.data_batismo) : (m.batizado ? "Batizado(a)" : ""),
      nasc: dataBR(m.data_nascimento),
      civil: m.estado_civil ? m.estado_civil[0].toUpperCase() + m.estado_civil.slice(1) : "—",
      grupo: g ? g.nome : "—",
      tel: tel(m.telefone),
      pastorBatismo: m.pastor_batismo || (m.batizado ? "—" : "Ainda não batizado(a)"),
      emissao: dataBR(new Date().toISOString()),
      id: m.id,
    };
  }

  function encaixar() {
    const box = $("#ct-palco"); if (!box) return;
    const larg = box.clientWidth; const esc = Math.min(1, larg / W);
    box.querySelectorAll(".ct-card").forEach(c => { c.style.transform = `scale(${esc})`; });
    box.querySelectorAll(".ct-slot").forEach(s => { s.style.height = (H * esc) + "px"; });
  }

  async function abrir() {
    if (!state.membro) { window.mostrarTela && window.mostrarTela("tela-login"); return; }
    let t = $("#tela-cpv-carteirinha");
    if (!t) {
      t = document.createElement("div");
      t.className = "screen"; t.id = "tela-cpv-carteirinha";
      t.innerHTML = `<div class="scroll no-nav">
        <div class="voltar-btn" data-nav="tela-editar-perfil"><svg class="icon" width="14" height="14"><use href="#i-arrowleft"/></svg>Voltar</div>
        <span style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:19px;display:block;margin-bottom:4px;">Minha carteirinha</span>
        <div id="ct-palco"><p class="ct-carregando">Gerando sua carteirinha…</p></div>
        <div class="ct-acoes">
          <button type="button" class="btn" id="ct-png">Baixar PNG</button>
          <button type="button" class="btn btn-ghost" id="ct-pdf">Baixar PDF</button>
        </div>
        <p class="ct-dica">O PDF sai no tamanho de cartão (8,6 × 5,4 cm), frente e verso, pronto para imprimir e plastificar. Para mudar algum dado, atualize o seu perfil.</p>
      </div>`;
      ($("#tela-editar-perfil")).after(t);
      $("#ct-png", t).addEventListener("click", baixarPNG);
      $("#ct-pdf", t).addEventListener("click", baixarPDF);
      window.addEventListener("resize", encaixar);
    }
    window.mostrarTela("tela-cpv-carteirinha");
    await carregarPastores();
    const d = await dadosDoMembro(state.membro);
    const palco = $("#ct-palco", t);
    palco.innerHTML = `<p class="ct-lado">Frente</p><div class="ct-slot"></div><p class="ct-lado">Verso</p><div class="ct-slot"></div>`;
    const tmp = document.createElement("div"); tmp.innerHTML = montarCartao(d);
    const slots = palco.querySelectorAll(".ct-slot");
    slots[0].appendChild(tmp.children[0]); slots[1].appendChild(tmp.children[0]);
    if (window.QRCode) {
      try {
        const url = await QRCode.toDataURL(`${SITE}/app/#verificar=${d.id}`, { width: 380, margin: 0, color: { dark: "#050816", light: "#F4F6FF" } });
        const cv = $("#ct-qr"); const img = new Image(); img.src = url; img.alt = "QR Code de conferência"; img.className = "ct-qr-img"; cv.replaceWith(img);
        if (!img.complete) await new Promise(r => { img.onload = img.onerror = r; });
      } catch (e) { console.error(e); }
    }
    encaixar();
    preparo = null;
    // espera as fotos/fontes e prepara os arquivos sem travar a tela
    setTimeout(() => preparar().catch(e => console.warn("carteirinha (pré-geração):", e)), 400);
  }

  const ESCALA = 1.6; // 1620 px de largura: nítido para imprimir no tamanho de cartão
  async function capturar(id) {
    const el = $("#" + id);
    const prev = el.style.transform; el.style.transform = "none";
    try {
      await document.fonts.ready;
      const c = await html2canvas(el, { scale: ESCALA, backgroundColor: null, useCORS: true, logging: false,
        onclone: (doc) => { const k = doc.getElementById(id); if (k) k.style.boxShadow = "none"; } });
      // recorta os cantos arredondados do cartão
      const r = 44 * ESCALA, o = document.createElement("canvas"); o.width = c.width; o.height = c.height;
      const x = o.getContext("2d"); x.beginPath();
      if (x.roundRect) x.roundRect(0, 0, o.width, o.height, r); else x.rect(0, 0, o.width, o.height);
      x.clip(); x.drawImage(c, 0, 0);
      // filete dourado da borda (desenhado aqui; o html2canvas distorce o inset shadow)
      x.lineWidth = 4 * (c.width / el.offsetWidth) / 2; x.strokeStyle = "rgba(249,189,0,.4)";
      x.beginPath(); if (x.roundRect) x.roundRect(0, 0, o.width, o.height, r); else x.rect(0, 0, o.width, o.height); x.stroke();
      // garante o QR Code nítido na imagem final (html2canvas às vezes o omite)
      const qr = el.querySelector(".ct-qr-img");
      if (qr && qr.complete && qr.naturalWidth) {
        const a = el.getBoundingClientRect(), b = qr.getBoundingClientRect(), k = c.width / a.width;
        x.imageSmoothingEnabled = false;
        x.drawImage(qr, (b.left - a.left) * k, (b.top - a.top) * k, b.width * k, b.height * k);
      }
      return o;
    } finally { el.style.transform = prev; }
  }
  function nomeArquivo(ext) { return `carteirinha-${String(state.membro?.nome_completo || "membro").toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.${ext}`; }
  function avisar(msg) { if (typeof mostrarToast === "function") mostrarToast(msg); }
  // No celular (principalmente iPhone), o compartilhar só funciona dentro do toque da pessoa.
  // Como gerar leva alguns segundos, mostramos uma folha "pronto" e o toque em Salvar abre o compartilhar.
  const movel = /iphone|ipad|ipod|android/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const BTN2 = "background:rgba(255,255,255,.1);color:#F4F6FF;border:1.5px solid rgba(255,255,255,.35);";
  function baixarDireto(blob, nome) {
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nome; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  }
  async function entregar(blob, nome, tipo) {
    const arq = new File([blob], nome, { type: tipo });
    const podeCompartilhar = !!(navigator.canShare && navigator.canShare({ files: [arq] }));
    if (!movel) { baixarDireto(blob, nome); return; }
    const url = URL.createObjectURL(blob);
    const ehImg = tipo.startsWith("image/"), ehPdf = tipo === "application/pdf";
    const f = document.createElement("div"); f.className = "ct-pronto"; f.setAttribute("role", "dialog"); f.setAttribute("aria-modal", "true");
    f.innerHTML = `<div class="ct-pronto-c">
        <b>${ehImg ? "Sua carteirinha está pronta" : /^carteirinha/.test(nome) ? "PDF da carteirinha pronto" : ehPdf ? "Relatório pronto" : "Planilha pronta"}</b>
        ${ehImg ? `<img src="${url}" alt="Carteirinha"><small>Toque em Salvar e escolha “Salvar imagem”. Se preferir, toque e segure a imagem.</small>`
                : `<div class="ct-pronto-pdf">${(nome.split(".").pop() || "").toUpperCase()}</div><small>Toque em Salvar e escolha “Salvar em Arquivos” ou mande pelo WhatsApp.</small>`}
        <button type="button" class="btn" data-ct-salvar>Salvar</button>
        ${ehPdf ? `<a class="btn" style="${BTN2}" href="${url}" target="_blank" rel="noopener">Abrir o PDF</a>` : ""}
        <button type="button" class="ct-pronto-x" data-ct-fechar>Fechar</button>
      </div>`;
    document.body.appendChild(f);
    const fechar = () => { f.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000); };
    f.addEventListener("click", e => { if (e.target === f || e.target.closest("[data-ct-fechar]")) fechar(); });
    f.querySelector("[data-ct-salvar]").addEventListener("click", () => {
      if (podeCompartilhar) {
        navigator.share({ files: [arq], title: nome }).then(fechar).catch(e => { if (e && e.name !== "AbortError") baixarDireto(blob, nome); });
      } else baixarDireto(blob, nome);
    });
  }
  window.cpvEntregarArquivo = entregar;
  // Gera PNG e PDF em segundo plano assim que a carteirinha aparece; o toque em Baixar só entrega.
  let preparo = null;
  function preparar() {
    if (preparo) return preparo;
    preparo = (async () => {
      const f = await capturar("ct-frente");
      await new Promise(r => setTimeout(r, 30));
      const v = await capturar("ct-verso");
      const gap = Math.round(30 * ESCALA), c = document.createElement("canvas");
      c.width = f.width; c.height = f.height + v.height + gap;
      const x = c.getContext("2d"); x.drawImage(f, 0, 0); x.drawImage(v, 0, f.height + gap);
      const png = await new Promise(r => c.toBlob(r, "image/png"));
      let pdf = null;
      if (window.jspdf) {
        const doc = new window.jspdf.jsPDF({ orientation: "landscape", unit: "mm", format: [85.6, 54] });
        doc.addImage(f.toDataURL("image/jpeg", .92), "JPEG", 0, 0, 85.6, 54);
        doc.addPage([85.6, 54], "landscape");
        doc.addImage(v.toDataURL("image/jpeg", .92), "JPEG", 0, 0, 85.6, 54);
        pdf = doc.output("blob");
      }
      return { png, pdf };
    })();
    preparo.catch(() => { preparo = null; });
    return preparo;
  }
  async function baixar(tipo) {
    const b = $(tipo === "png" ? "#ct-png" : "#ct-pdf"), txt = b.textContent;
    b.disabled = true; b.textContent = "Preparando…";
    try {
      const r = await preparar();
      const blob = tipo === "png" ? r.png : r.pdf;
      if (!blob) throw new Error("sem arquivo");
      await entregar(blob, nomeArquivo(tipo), tipo === "png" ? "image/png" : "application/pdf");
    } catch (e) { console.error(e); avisar(tipo === "png" ? "Não deu para gerar a imagem agora. Tente de novo." : "Não deu para gerar o PDF agora. Tente de novo."); }
    b.disabled = false; b.textContent = txt;
  }
  const baixarPNG = () => baixar("png"), baixarPDF = () => baixar("pdf");

  /* Conferência pelo QR Code: /app/#verificar=<id> */
  async function verificar() {
    const m = /verificar=([0-9a-f-]{36})/i.exec(location.hash); if (!m) return;
    const f = document.createElement("div"); f.className = "ct-verif";
    f.innerHTML = `<div class="ct-verif-c"><img src="assets/logo-branca.png" alt=""><p>Conferindo carteirinha…</p></div>`;
    document.body.appendChild(f);
    let r = null;
    try { const q = await sb.from("igr_membros").select("nome_completo, foto_url, created_at, igreja_id").eq("id", m[1]).maybeSingle(); r = q.data; } catch (e) {}
    const ok = r && (!state.igreja || r.igreja_id === state.igreja.id);
    f.querySelector(".ct-verif-c").innerHTML = ok
      ? `<img src="assets/logo-branca.png" alt=""><div class="ct-ok">✓</div><h2>Membro ativo</h2>
         ${r.foto_url ? `<img class="ct-vf" src="${esc(r.foto_url)}" alt="">` : ""}<b>${esc(r.nome_completo)}</b><p>Membro da IEQ Vila Real desde ${esc(mesAno(r.created_at))}</p><button type="button" class="btn">Fechar</button>`
      : `<img src="assets/logo-branca.png" alt=""><div class="ct-ok no">!</div><h2>Carteirinha não encontrada</h2><p>Este cadastro não está ativo na IEQ Vila Real.</p><button type="button" class="btn">Fechar</button>`;
    f.querySelector("button").onclick = () => { f.remove(); history.replaceState(null, "", location.pathname); };
  }
  window.addEventListener("load", () => setTimeout(verificar, 1200));

  window.abrirCarteirinha = abrir;
  document.addEventListener("click", e => { if (e.target.closest && e.target.closest("[data-abrir-carteirinha]")) abrir(); });
})();
