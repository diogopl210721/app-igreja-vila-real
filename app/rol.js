/* Rol de membros — painel administrativo.
   Ver no app (busca + filtros), exportar PDF e exportar Excel.
   Baseado no rol da Catedral Pão da Vida; usa as cores da própria igreja (igr_igrejas). */
(function () {
  "use strict";

  const MES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const GENERO = { masculino: "Masculino", feminino: "Feminino", m: "Masculino", f: "Feminino" };
  const EST = { solteiro: "Solteiro(a)", casado: "Casado(a)", divorciado: "Divorciado(a)", viuvo: "Viúvo(a)", "viúvo": "Viúvo(a)", uniao_estavel: "União estável" };
  const TIPOS = { "": "Todos", lideres: "Só líderes", batizados: "Batizados", "nao-batizados": "Não batizados", aniversariantes: "Aniversariantes do mês" };

  /* ---------- utilidades ---------- */
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const cap = s => String(s || "").trim();
  const semAcento = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const pad2 = n => String(n).padStart(2, "0");
  const avisar = msg => (typeof mostrarToast === "function" ? mostrarToast(msg) : alert(msg));
  const $ = id => document.getElementById(id);

  function carregarScript(src) {
    return new Promise((ok, erro) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => erro(new Error("Falha ao carregar " + src)); document.head.appendChild(s); });
  }
  const data = iso => { if (!iso) return null; const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const dBR = d => (d ? `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}` : "");
  function idade(nasc) { if (!nasc) return null; const h = new Date(); let a = h.getFullYear() - nasc.getUTCFullYear(); const m = h.getMonth() - nasc.getUTCMonth(); if (m < 0 || (m === 0 && h.getDate() < nasc.getUTCDate())) a--; return a >= 0 && a < 130 ? a : null; }
  function tel(t) { const n = String(t || "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, ""); if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 3)} ${n.slice(3, 7)}-${n.slice(7)}`; if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`; return t || ""; }
  const generoTxt = g => { const k = String(g || "").toLowerCase().trim(); return GENERO[k] || cap(g); };
  const estadoTxt = e => { const k = String(e || "").toLowerCase().trim(); return EST[k] || cap(e); };
  const slug = s => String(s || "igreja").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const hojeISO = () => { const h = new Date(); return `${h.getFullYear()}-${pad2(h.getMonth() + 1)}-${pad2(h.getDate())}`; };
  const hojeBR = () => { const h = new Date(); return `${pad2(h.getDate())}/${pad2(h.getMonth() + 1)}/${h.getFullYear()}`; };

  /* ---------- cores da igreja ---------- */
  const rgb = hex => { let h = String(hex || "").replace("#", ""); if (h.length === 3) h = h.split("").map(c => c + c).join(""); return /^[0-9a-f]{6}$/i.test(h) ? [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)) : null; };
  const misturar = (c, alvo, p) => c.map((v, i) => v + (alvo[i] - v) * p);
  const argb = c => "FF" + c.map(v => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase();
  function paleta(ig) {
    const pri = rgb(ig && ig.cor_primaria) || [0, 38, 183], sec = rgb(ig && ig.cor_secundaria) || [249, 189, 0];
    const preto = [0, 0, 0], branco = [255, 255, 255];
    return {
      pri, sec,
      cab: misturar(pri, preto, .35),         // cabeçalho da tabela
      zebra: misturar(pri, branco, .955),     // linha alternada
      suave: misturar(pri, branco, .9),       // blocos do resumo
      ouro: misturar(sec, preto, .42),        // texto de destaque sobre fundo claro
      linha: misturar(pri, branco, .85),
    };
  }

  /* ---------- dados ---------- */
  const R = { linhas: [], visiveis: [], grupos: new Map(), ig: null, ligado: false };
  const COLS_DB = "id,numero,nome_completo,foto_url,genero,data_nascimento,estado_civil,telefone,email,endereco,profissao,grupo_id,eh_lider,batizado,data_batismo,pastor_batismo,created_at,ultimo_acesso,autoriza_fotos,igr_membros_grupos(grupo_id)";

  async function buscarDados() {
    const ig = state.igreja;
    let membros = [];
    for (let ini = 0; ; ini += 1000) { // o Supabase corta em 1000 linhas por consulta: busca em páginas
      const { data: lote, error } = await sb.from("igr_membros").select(COLS_DB).eq("igreja_id", ig.id).order("nome_completo").order("id").range(ini, ini + 999);
      if (error) throw error;
      membros = membros.concat(lote || []);
      if (!lote || lote.length < 1000) break;
    }
    const { data: gr, error: eg } = await sb.from("igr_grupos").select("id,nome,tipo").eq("igreja_id", ig.id);
    if (eg) throw eg;
    const grupos = new Map((gr || []).map(g => [g.id, g]));

    // Nº do membro = ordem de cadastro (a coluna "numero" da Vila Real é o número da casa, não do membro)
    const ordem = new Map(membros.slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))).map((m, i) => [m.id, String(i + 1).padStart(4, "0")]));

    const linhas = membros.map(m => {
      const nasc = data(m.data_nascimento);
      const ids = new Set([m.grupo_id, ...(m.igr_membros_grupos || []).map(x => x.grupo_id)].filter(g => g && grupos.has(g)));
      const outros = [...ids].filter(g => g !== m.grupo_id).map(g => grupos.get(g).nome).filter(Boolean);
      return {
        id: m.id, foto: m.foto_url || "", num: ordem.get(m.id), nome: cap(m.nome_completo), genero: generoTxt(m.genero), nasc, idade: idade(nasc), estado: estadoTxt(m.estado_civil),
        telRaw: cap(m.telefone), tel: tel(m.telefone), email: cap(m.email), endereco: [cap(m.endereco), cap(m.numero)].filter(Boolean).join(", "), profissao: cap(m.profissao),
        grupo: (grupos.get(m.grupo_id) || {}).nome || "", grupoIds: ids, outros: outros.join(", "), lider: m.eh_lider ? "Sim" : "Não",
        batizado: m.batizado ? "Sim" : "Não", dataBat: data(m.data_batismo), porQuem: cap(m.pastor_batismo),
        desde: data(m.created_at), acesso: data(m.ultimo_acesso), fotos: m.autoriza_fotos === false ? "Não" : m.autoriza_fotos ? "Sim" : "",
        tipoGrupo: (grupos.get(m.grupo_id) || {}).tipo,
      };
    }).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));

    R.ig = ig; R.grupos = grupos; R.linhas = linhas;
  }

  /* ---------- tela no app ---------- */
  function injetarCss() {
    if ($("rol-css")) return;
    const st = document.createElement("style"); st.id = "rol-css";
    st.textContent = `
    .rol-acoes{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:4px 0 14px}
    .rol-acoes .btn{width:auto;margin:0;min-height:46px}
    .rol-acoes .btn[disabled]{opacity:.7}
    .rol-busca{display:block;width:100%;min-height:44px;margin:0 0 8px;padding:0 14px;border-radius:14px;border:1px solid var(--line);background:var(--card);color:var(--ink);font:600 16px 'Inter',sans-serif;box-sizing:border-box}
    .rol-chips{display:flex;gap:6px;overflow-x:auto;padding-bottom:2px;scrollbar-width:none}
    .rol-chips::-webkit-scrollbar{display:none}
    .rol-chips button{flex:none;min-height:36px;padding:0 14px;border-radius:99px;border:1px solid var(--line);background:var(--card);color:var(--ink-soft);font:700 13px 'Inter',sans-serif;cursor:pointer}
    .rol-chips button[aria-pressed="true"]{background:var(--gold-t,#F9BD00);border-color:var(--gold-t,#F9BD00);color:#10132b}
    .rol-tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin:14px 0 12px}
    .rol-tile{padding:10px 6px;border-radius:16px;background:var(--card);border:1px solid var(--line);text-align:center}
    .rol-tile:first-child{background:radial-gradient(120% 140% at 100% 0%,rgba(249,189,0,.26),transparent 60%),var(--card);border-color:rgba(249,189,0,.4)}
    .rol-tile b{display:block;font:600 26px/1 'Fraunces',Georgia,serif;color:var(--ink);font-variant-numeric:lining-nums tabular-nums}
    .rol-tile:first-child b{color:var(--gold-t,#E8B000)}
    .rol-tile span{display:block;margin-top:4px;font-size:11px;font-weight:600;color:var(--ink-soft)}
    .rol-item{background:var(--card);border:1px solid var(--line);border-radius:18px;margin-bottom:6px;overflow:hidden}
    .rol-item[open]{border-color:rgba(249,189,0,.45)}
    .rol-item summary{list-style:none;display:flex;align-items:center;gap:11px;padding:10px 12px;cursor:pointer}
    .rol-item summary::-webkit-details-marker{display:none}
    .rol-av{width:42px;height:42px;border-radius:50%;object-fit:cover;flex:none;background:rgba(249,189,0,.16)}
    .rol-av.ini{display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;color:var(--gold-t,#E8B000)}
    .rol-info{flex:1;min-width:0}
    .rol-info b{display:block;font-size:15px;font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .rol-info span{display:block;margin-top:2px;font-size:12px;color:var(--ink-soft);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .rol-tags{display:flex;flex-direction:column;gap:3px;align-items:flex-end;flex:none}
    .rol-tags i{font:700 10.5px 'Inter',sans-serif;font-style:normal;padding:3px 8px;border-radius:99px}
    .t-lider{background:rgba(249,189,0,.18);color:var(--gold-t,#E8B000)}
    .t-bat{background:rgba(60,190,120,.14);color:#4cc68a}
    html.claro .t-bat{color:#15805C;background:rgba(21,128,92,.12)}
    .rol-det{margin:0;padding:4px 14px 14px;display:grid;grid-template-columns:1fr 1fr;gap:10px 14px}
    .rol-det div{min-width:0}
    .rol-det dt{font-size:11px;font-weight:600;color:var(--ink-soft)}
    .rol-det dd{margin:2px 0 0;font-size:13.5px;font-weight:600;line-height:1.35;color:var(--ink);overflow-wrap:anywhere}
    .rol-det dd a{color:inherit;text-decoration:none}
    a.rol-zap{grid-column:1 / -1;justify-self:start;padding:9px 13px;border-radius:12px;background:rgba(37,211,102,.14);color:#25b85f;font:700 13px 'Inter',sans-serif;text-decoration:none}
    @media (max-width:340px){.rol-det{grid-template-columns:1fr}}`;
    document.head.appendChild(st);
  }

  function descFiltro() {
    const partes = [];
    const g = $("rol-filtro-grupo") && $("rol-filtro-grupo").value;
    if (g && R.grupos.get(g)) partes.push(R.grupos.get(g).nome);
    const t = $("rol-filtro-tipo") && $("rol-filtro-tipo").value;
    if (t) partes.push(TIPOS[t]);
    const b = $("rol-busca") && $("rol-busca").value.trim();
    if (b) partes.push(`busca “${b}”`);
    return partes.join(" · ");
  }

  function filtrar() {
    const termo = semAcento($("rol-busca").value.trim()), dig = $("rol-busca").value.replace(/\D/g, "");
    const g = $("rol-filtro-grupo").value, t = $("rol-filtro-tipo").value, mesAtual = new Date().getMonth();
    R.visiveis = R.linhas.filter(l => {
      if (termo && !(semAcento(l.nome).includes(termo) || l.num.includes(dig) && dig.length >= 1 && /^\d+$/.test(termo) || (dig.length >= 3 && l.telRaw.replace(/\D/g, "").includes(dig)))) return false;
      if (g && !l.grupoIds.has(g)) return false;
      if (t === "lideres" && l.lider !== "Sim") return false;
      if (t === "batizados" && l.batizado !== "Sim") return false;
      if (t === "nao-batizados" && l.batizado === "Sim") return false;
      if (t === "aniversariantes" && !(l.nasc && l.nasc.getUTCMonth() === mesAtual)) return false;
      return true;
    });
    if (t === "aniversariantes") R.visiveis.sort((a, b) => a.nasc.getUTCDate() - b.nasc.getUTCDate());
    desenhar();
  }

  function iniciais(nome) { const p = cap(nome).split(/\s+/).filter(Boolean); return ((p[0] || "?")[0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase(); }
  function itemHtml(l) {
    const d = l.telRaw.replace(/\D/g, ""), wa = d.length >= 10 ? (d.length <= 11 ? "55" + d : d) : "";
    const det = [
      ["Telefone", esc(l.tel)],
      ["Nascimento", l.nasc ? `${dBR(l.nasc)}${l.idade != null ? ` · ${l.idade} anos` : ""}` : ""],
      ["E-mail", l.email ? `<a href="mailto:${esc(l.email)}">${esc(l.email)}</a>` : ""],
      ["Gênero", esc(l.genero)], ["Estado civil", esc(l.estado)], ["Profissão", esc(l.profissao)],
      ["Endereço", esc(l.endereco)], ["Também participa de", esc(l.outros)],
      ["Batismo", l.batizado === "Sim" ? esc([l.dataBat ? dBR(l.dataBat) : "", l.porQuem ? "por " + l.porQuem : ""].filter(Boolean).join(" ") || "Sim") : "Ainda não"],
      ["Membro desde", dBR(l.desde)], ["Último acesso ao app", dBR(l.acesso) || "Nunca"],
    ].filter(([, v]) => v);
    return `<details class="rol-item"><summary>
        ${l.foto ? `<img class="rol-av" src="${esc(l.foto)}" alt="" loading="lazy">` : `<div class="rol-av ini">${esc(iniciais(l.nome))}</div>`}
        <div class="rol-info"><b>${esc(l.nome)}</b><span>${esc(l.num)}${l.grupo ? " · " + esc(l.grupo) : ""}</span></div>
        <div class="rol-tags">${l.lider === "Sim" ? `<i class="t-lider">Líder</i>` : ""}${l.batizado === "Sim" ? `<i class="t-bat">Batizado</i>` : ""}</div>
      </summary>
      <dl class="rol-det">${det.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}${wa ? `<a class="rol-zap" href="https://wa.me/${wa}" target="_blank" rel="noopener">Conversar no WhatsApp</a>` : ""}</dl></details>`;
  }

  function desenhar() {
    const v = R.visiveis, idades = v.map(l => l.idade).filter(x => x != null);
    $("rol-resumo").innerHTML = [
      [v.length, v.length === 1 ? "membro" : "membros"], [v.filter(l => l.batizado === "Sim").length, "batizados"], [v.filter(l => l.lider === "Sim").length, "líderes"],
      [idades.length ? Math.round(idades.reduce((s, x) => s + x, 0) / idades.length) : "—", "idade média"],
    ].map(([n, t]) => `<div class="rol-tile"><b>${n}</b><span>${t}</span></div>`).join("");
    const filtro = descFiltro();
    $("rol-contagem").textContent = filtro ? `Mostrando ${v.length} de ${R.linhas.length} membros · ${filtro}. Os arquivos exportados levam só esta lista.` : `${R.linhas.length} membros cadastrados. Toque num nome para ver os dados.`;
    $("rol-lista").innerHTML = v.map(itemHtml).join("") || `<p class="hint">Nenhum membro encontrado com esses filtros.</p>`;
  }

  function ligar() {
    if (R.ligado) return; R.ligado = true;
    let t = null;
    $("rol-busca").addEventListener("input", () => { clearTimeout(t); t = setTimeout(filtrar, 180); });
    $("rol-filtro-grupo").addEventListener("change", filtrar);
    $("rol-chips").addEventListener("click", ev => { const b = ev.target.closest("button"); if (!b) return; $("rol-filtro-tipo").value = b.dataset.t; $("rol-chips").querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b)); filtrar(); });
    $("rol-btn-pdf").addEventListener("click", ev => exportar(ev.currentTarget, "pdf"));
    $("rol-btn-excel").addEventListener("click", ev => exportar(ev.currentTarget, "excel"));
  }

  async function abrir() {
    injetarCss(); ligar();
    $("rol-lista").innerHTML = `<p class="hint">Carregando membros…</p>`;
    try {
      await buscarDados();
      const sel = $("rol-filtro-grupo"), atual = sel.value;
      const lista = [...R.grupos.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));
      const op = dep => lista.filter(g => (g.tipo === "departamento") === dep).map(g => `<option value="${esc(g.id)}">${esc(g.nome)}</option>`).join("");
      sel.innerHTML = `<option value="">Todos os grupos e departamentos</option><optgroup label="Grupos">${op(false)}</optgroup><optgroup label="Departamentos">${op(true)}</optgroup>`;
      if (atual && R.grupos.has(atual)) sel.value = atual;
      filtrar();
    } catch (e) {
      console.error("Rol de membros:", e);
      $("rol-lista").innerHTML = `<p class="hint">Não foi possível carregar o rol agora. Verifique a conexão e abra de novo.</p>`;
    }
  }

  /* ---------- entrega do arquivo ---------- */
  // No celular (principalmente iPhone) o compartilhar só abre dentro de um toque; como gerar leva alguns
  // segundos, mostramos uma folha "pronto" e o toque em Salvar abre o compartilhar.
  const movel = /iphone|ipad|ipod|android/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  function baixarDireto(blob, nome) {
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nome; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  }
  // estilo próprio dos botões da folha (fica fora do tema do app, então não pode herdar as classes dele)
  const BTN = "display:block;width:100%;box-sizing:border-box;padding:14px;border-radius:999px;font:600 15px 'Inter',sans-serif;text-align:center;cursor:pointer;";
  function entregar(blob, nome, tipo) {
    if (!movel) { baixarDireto(blob, nome); return; }
    const arq = new File([blob], nome, { type: tipo });
    const podeCompartilhar = !!(navigator.canShare && navigator.canShare({ files: [arq] }));
    const url = URL.createObjectURL(blob), ehPdf = tipo === "application/pdf";
    const f = document.createElement("div"); f.setAttribute("role", "dialog"); f.setAttribute("aria-modal", "true");
    f.style.cssText = "position:fixed;inset:0;z-index:99999;background:rgba(15,18,30,.6);display:flex;align-items:flex-end;justify-content:center;padding:16px;padding-bottom:calc(16px + env(safe-area-inset-bottom,0px))";
    f.innerHTML = `<div style="background:#fff;border-radius:20px;padding:22px 20px;width:100%;max-width:420px;text-align:center;font-family:'Inter',sans-serif">
        <b style="display:block;font-family:'Montserrat',sans-serif;font-size:17px;color:#171923">${ehPdf ? "PDF do rol pronto" : "Planilha do rol pronta"}</b>
        <div style="margin:14px auto 10px;width:64px;height:64px;border-radius:16px;background:var(--brand-soft,#EAEDFF);color:var(--brand,#0026B7);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px">${ehPdf ? "PDF" : "XLSX"}</div>
        <small style="display:block;color:#6B7280;font-size:12.5px;line-height:1.4;margin-bottom:14px">Toque em Salvar e escolha “Salvar em Arquivos” ou mande pelo WhatsApp.</small>
        <button type="button" data-rol-salvar style="${BTN}background:var(--brand,#0026B7);color:#fff;border:0">Salvar</button>
        ${ehPdf ? `<a href="${url}" target="_blank" rel="noopener" style="${BTN}margin-top:8px;background:#fff;color:#171923;border:1.5px solid #D9DCE6;text-decoration:none">Abrir o PDF</a>` : ""}
        <button type="button" data-rol-fechar style="${BTN}margin-top:8px;background:#fff;color:#171923;border:1.5px solid #D9DCE6">Fechar</button></div>`;
    document.body.appendChild(f);
    const fechar = () => { f.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000); };
    f.addEventListener("click", e => { if (e.target === f || e.target.closest("[data-rol-fechar]")) fechar(); });
    f.querySelector("[data-rol-salvar]").addEventListener("click", () => {
      if (podeCompartilhar) navigator.share({ files: [arq], title: nome }).then(fechar).catch(e => { if (e && e.name !== "AbortError") baixarDireto(blob, nome); });
      else baixarDireto(blob, nome);
    });
  }

  async function logoBase64() {
    try {
      const r = await fetch("assets/logo-branca.png"); if (!r.ok) return null; const b = await r.blob();
      const url = await new Promise(ok => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(b); });
      const img = await new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = url; });
      return img ? { url, b64: url.split(",")[1], w: img.naturalWidth, h: img.naturalHeight, img } : null;
    } catch (e) { return null; }
  }
  // logo menor (altura em px) para o PDF não ficar com vários MB
  function logoReduzida(logo, alturaPx) {
    try {
      const k = Math.min(1, alturaPx / logo.h), c = document.createElement("canvas");
      c.width = Math.round(logo.w * k); c.height = Math.round(logo.h * k);
      c.getContext("2d").drawImage(logo.img, 0, 0, c.width, c.height);
      return c.toDataURL("image/png");
    } catch (e) { return logo.url; }
  }

  async function exportar(btn, formato) {
    if (!R.visiveis.length) { avisar("Nenhum membro na lista para exportar."); return; }
    const txt = btn.innerHTML; btn.disabled = true; btn.innerHTML = formato === "pdf" ? "Gerando PDF…" : "Gerando planilha…";
    try {
      const linhas = R.visiveis.slice(), filtro = descFiltro();
      if (formato === "pdf") await gerarPdf(linhas, filtro); else await gerarExcel(linhas, filtro);
    } catch (e) {
      console.error("Rol de membros (" + formato + "):", e);
      avisar(formato === "pdf" ? "Não foi possível gerar o PDF. Tente de novo." : "Não foi possível gerar a planilha. Tente de novo.");
    } finally { btn.disabled = false; btn.innerHTML = txt; }
  }

  const subtitulo = (ig, n, filtro) => `${ig.nome || "Igreja"}${ig.pastor_principal ? " · " + ig.pastor_principal : ""} · ${n} membro${n === 1 ? "" : "s"}${filtro ? " · " + filtro : ""}`;

  /* ---------- PDF ---------- */
  async function gerarPdf(linhas, filtro) {
    if (!window.jspdf) throw new Error("jsPDF não carregou");
    const { jsPDF } = window.jspdf, ig = R.ig, P = paleta(ig), logo = await logoBase64();
    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const W = 297, H = 210, M = 10, RH = 6.6, LIM = H - 14;
    const COLS = [["Nº", 14, "num", "c"], ["Nome completo", 60, "nome", "l"], ["Nascimento", 21, "nascTxt", "c"], ["Idade", 11, "idadeTxt", "c"], ["Estado civil", 22, "estado", "l"],
      ["Telefone", 29, "tel", "l"], ["Endereço", 60, "endereco", "l"], ["Grupo / departamento", 37, "grupo", "l"], ["Líder", 11, "lider", "c"], ["Batiz.", 12, "batizado", "c"]];
    const TINTA = [23, 25, 35], SUAVE = [107, 114, 128];
    const ajusta = (t, w) => { t = String(t == null ? "" : t); if (pdf.getTextWidth(t) <= w - 2.4) return t; while (t.length > 1 && pdf.getTextWidth(t + "...") > w - 2.4) t = t.slice(0, -1); return t + "..."; };
    const cel = (txt, x, y, w, al) => { const t = ajusta(txt, w); if (al === "c") pdf.text(t, x + w / 2, y, { align: "center", baseline: "middle" }); else pdf.text(t, x + 1.4, y, { baseline: "middle" }); };

    // faixa de título (1ª página)
    pdf.setFillColor(...P.pri); pdf.rect(0, 0, W, 27, "F");
    pdf.setFillColor(...P.sec); pdf.rect(0, 27, W, 1.2, "F");
    let tx = M;
    if (logo) { const h = 17, w = h * logo.w / logo.h; pdf.addImage(logoReduzida(logo, 200), "PNG", M, 5, w, h, undefined, "FAST"); tx = M + w + 6; }
    pdf.setTextColor(255, 255, 255); pdf.setFont("helvetica", "bold"); pdf.setFontSize(19); pdf.text("Rol de Membros", tx, 13, { baseline: "middle" });
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(9); pdf.setTextColor(...P.sec); pdf.text(ajusta(subtitulo(ig, linhas.length, filtro), W - tx - M - 40), tx, 20.5, { baseline: "middle" });
    pdf.setTextColor(255, 255, 255); pdf.setFontSize(8); pdf.text("Emitido em " + hojeBR(), W - M, 20.5, { align: "right", baseline: "middle" });

    const bat = linhas.filter(l => l.batizado === "Sim").length, lid = linhas.filter(l => l.lider === "Sim").length;
    pdf.setTextColor(...P.ouro); pdf.setFont("helvetica", "bold"); pdf.setFontSize(9);
    pdf.text(`${linhas.length} membros · ${bat} batizados · ${lid} líderes`, M, 34.5, { baseline: "middle" });

    let y = 38.5;
    const cabecalhoTabela = () => {
      pdf.setFillColor(...P.cab); pdf.rect(M, y, W - 2 * M, 7, "F");
      pdf.setFont("helvetica", "bold"); pdf.setFontSize(7.6); pdf.setTextColor(...P.sec);
      let x = M; COLS.forEach(([t, w, , al]) => { cel(t, x, y + 3.5, w, al); x += w; });
      y += 7;
    };
    cabecalhoTabela();
    linhas.forEach((l, k) => {
      if (y + RH > LIM) {
        pdf.addPage(); y = 0;
        pdf.setFillColor(...P.pri); pdf.rect(0, 0, W, 9, "F"); pdf.setFillColor(...P.sec); pdf.rect(0, 9, W, .8, "F");
        pdf.setTextColor(255, 255, 255); pdf.setFont("helvetica", "bold"); pdf.setFontSize(9); pdf.text("Rol de Membros · " + (ig.nome || ""), M, 4.8, { baseline: "middle" });
        y = 13; cabecalhoTabela();
      }
      if (k % 2) { pdf.setFillColor(...P.zebra); pdf.rect(M, y, W - 2 * M, RH, "F"); }
      pdf.setDrawColor(...P.linha); pdf.setLineWidth(.15); pdf.line(M, y + RH, W - M, y + RH);
      const v = { ...l, nascTxt: dBR(l.nasc), idadeTxt: l.idade != null ? String(l.idade) : "" };
      let x = M;
      COLS.forEach(([, w, chave, al], i) => {
        pdf.setFont("helvetica", i === 1 ? "bold" : "normal"); pdf.setFontSize(8);
        if ((chave === "lider" && v.lider === "Sim") || (chave === "batizado" && v.batizado === "Sim")) { pdf.setFont("helvetica", "bold"); pdf.setTextColor(...P.ouro); }
        else pdf.setTextColor(...(i === 1 ? TINTA : [60, 66, 80]));
        cel(v[chave], x, y + RH / 2 + .1, w, al); x += w;
      });
      y += RH;
    });

    const n = pdf.getNumberOfPages();
    for (let p = 1; p <= n; p++) {
      pdf.setPage(p); pdf.setDrawColor(...P.linha); pdf.setLineWidth(.2); pdf.line(M, H - 10, W - M, H - 10);
      pdf.setFont("helvetica", "normal"); pdf.setFontSize(7.5); pdf.setTextColor(...SUAVE);
      pdf.text(`${ig.nome || ""} · Rol de membros · ${hojeBR()}`, M, H - 6, { baseline: "middle" });
      pdf.text(`Página ${p} de ${n}`, W - M, H - 6, { align: "right", baseline: "middle" });
    }
    const blob = pdf.output("blob");
    entregar(blob, `rol-de-membros-${slug(ig.nome)}-${hojeISO()}.pdf`, "application/pdf");
  }

  /* ---------- Excel ---------- */
  async function gerarExcel(linhas, filtro) {
    if (!window.ExcelJS) await carregarScript("vendor/exceljs.min.js?v=1");
    const ig = R.ig, grupos = R.grupos, P = paleta(ig), logo = await logoBase64();
    const BANDA = argb(P.pri), CAB = argb(P.cab), FILETE = argb(P.sec), ZEBRA = argb(P.zebra), SUAVE_BG = argb(P.suave), OURO = argb(P.ouro), LINHA = argb(P.linha);
    const TINTA = "FF171923", CINZA = "FF6B7280", hojeTxt = hojeBR();
    const wb = new ExcelJS.Workbook();
    wb.creator = "App " + (ig.nome || "da igreja"); wb.created = new Date();
    const logoId = logo ? wb.addImage({ base64: logo.b64, extension: "png" }) : null;
    const fill = argbCor => ({ type: "pattern", pattern: "solid", fgColor: { argb: argbCor } });
    const rodape = `&L&8${String(ig.nome || "").replace(/&/g, "&&")} · Rol de membros · ${hojeTxt}&R&8Página &P de &N`;

    const COLS = [
      ["Nº", "num", 9], ["Nome completo", "nome", 34], ["Gênero", "genero", 12], ["Nascimento", "nasc", 13, "dd/mm/yyyy"], ["Idade", "idade", 8],
      ["Estado civil", "estado", 14], ["Telefone", "tel", 18], ["E-mail", "email", 28], ["Endereço", "endereco", 38], ["Profissão", "profissao", 20],
      ["Grupo / departamento", "grupo", 22], ["Também participa de", "outros", 28], ["Líder", "lider", 8], ["Batizado", "batizado", 10],
      ["Data do batismo", "dataBat", 15, "dd/mm/yyyy"], ["Batizado(a) por", "porQuem", 22], ["Membro desde", "desde", 14, "dd/mm/yyyy"],
      ["Último acesso ao app", "acesso", 18, "dd/mm/yyyy"], ["Autoriza fotos", "fotos", 13],
    ];
    const N = COLS.length, CENTRO = new Set([0, 3, 4, 12, 13, 14, 16, 17, 18]);
    const cabecalho = (ws, titulo, sub, nCols) => {
      ws.properties.defaultRowHeight = 20;
      for (let r = 1; r <= 4; r++) { const row = ws.getRow(r); row.height = r === 1 ? 14 : r === 2 ? 34 : r === 3 ? 22 : 20; for (let c = 1; c <= nCols; c++) row.getCell(c).fill = fill(BANDA); }
      const t = ws.getCell(2, 3); t.value = titulo; t.font = { name: "Calibri", size: 22, bold: true, color: { argb: "FFFFFFFF" } }; t.alignment = { vertical: "middle" };
      const s = ws.getCell(3, 3); s.value = sub; s.font = { name: "Calibri", size: 11, color: { argb: FILETE } }; s.alignment = { vertical: "middle" };
      const e = ws.getCell(4, 3); e.value = `Emitido em ${hojeTxt} pelo app da igreja`; e.font = { name: "Calibri", size: 9, color: { argb: "FFC9D3F5" } };
      for (let c = 1; c <= nCols; c++) ws.getCell(5, c).fill = fill(FILETE);
      ws.getRow(5).height = 4;
      if (logoId !== null) { const h = 62, w = h * logo.w / logo.h; ws.addImage(logoId, { tl: { col: 0.25, row: 0.5 }, ext: { width: w, height: h }, editAs: "absolute" }); }
    };
    const borda = { top: { style: "thin", color: { argb: LINHA } }, bottom: { style: "thin", color: { argb: LINHA } }, left: { style: "thin", color: { argb: LINHA } }, right: { style: "thin", color: { argb: LINHA } } };
    const sub = subtitulo(ig, linhas.length, filtro);

    /* aba 1: rol */
    const ws = wb.addWorksheet("Rol de membros", {
      views: [{ state: "frozen", ySplit: 7, xSplit: 2, showGridLines: false }],
      pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: .3, right: .3, top: .4, bottom: .5, header: .2, footer: .2 }, printTitlesRow: "7:7" },
      headerFooter: { oddFooter: rodape },
    });
    COLS.forEach(([, , w], i) => { ws.getColumn(i + 1).width = w; });
    cabecalho(ws, "Rol de Membros", sub, N);
    ws.getRow(6).height = 10;
    const hr = ws.getRow(7); hr.height = 30;
    COLS.forEach(([t], i) => {
      const c = hr.getCell(i + 1); c.value = t;
      c.font = { name: "Calibri", size: 10.5, bold: true, color: { argb: FILETE } }; c.fill = fill(CAB);
      c.alignment = { vertical: "middle", horizontal: CENTRO.has(i) ? "center" : "left", wrapText: true, indent: CENTRO.has(i) ? 0 : 1 };
      c.border = { bottom: { style: "medium", color: { argb: FILETE } } };
    });
    linhas.forEach((l, k) => {
      const row = ws.getRow(8 + k); row.height = 22;
      COLS.forEach(([, chave, , fmt], i) => {
        const c = row.getCell(i + 1), v = l[chave];
        c.value = v === "" || v === undefined ? null : v;
        if (fmt) c.numFmt = fmt;
        c.font = { name: "Calibri", size: 10.5, color: { argb: i === 1 ? TINTA : "FF3C4250" }, bold: i === 1 };
        c.alignment = { vertical: "middle", horizontal: CENTRO.has(i) ? "center" : "left", indent: CENTRO.has(i) ? 0 : 1 };
        c.fill = fill(k % 2 ? ZEBRA : "FFFFFFFF"); c.border = borda;
      });
      if (l.lider === "Sim") row.getCell(13).font = { name: "Calibri", size: 10.5, bold: true, color: { argb: OURO } };
      if (l.batizado === "Sim") row.getCell(14).font = { name: "Calibri", size: 10.5, bold: true, color: { argb: "FF15805C" } };
    });
    const fim = 7 + linhas.length;
    ws.autoFilter = { from: { row: 7, column: 1 }, to: { row: Math.max(fim, 7), column: N } };
    const tr = ws.getRow(fim + 2);
    tr.getCell(2).value = `Total: ${linhas.length} membros · ${linhas.filter(l => l.batizado === "Sim").length} batizados · ${linhas.filter(l => l.lider === "Sim").length} líderes`;
    tr.getCell(2).font = { name: "Calibri", size: 10.5, bold: true, color: { argb: OURO } };

    /* aba 2: resumo */
    const rs = wb.addWorksheet("Resumo", { views: [{ showGridLines: false }], pageSetup: { orientation: "portrait", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 }, headerFooter: { oddFooter: rodape } });
    [26, 14, 4, 26, 14, 4, 22, 14].forEach((w, i) => { rs.getColumn(i + 1).width = w; });
    cabecalho(rs, "Resumo da membresia", sub, 8);
    const borda2 = { top: { style: "medium", color: { argb: FILETE } } };
    const bloco = (col, linha0, titulo, pares) => {
      const h = rs.getCell(linha0, col); h.value = titulo; h.font = { name: "Calibri", size: 13, bold: true, color: { argb: TINTA } };
      rs.getCell(linha0 + 1, col).border = borda2; rs.getCell(linha0 + 1, col + 1).border = borda2;
      pares.forEach(([k, v], i) => {
        const a = rs.getCell(linha0 + 1 + i, col), b = rs.getCell(linha0 + 1 + i, col + 1);
        a.value = k; b.value = v;
        [a, b].forEach((c, j) => { c.font = { name: "Calibri", size: 11, bold: j === 1, color: { argb: j ? OURO : TINTA } }; c.fill = fill(i % 2 ? ZEBRA : SUAVE_BG); c.alignment = { vertical: "middle", horizontal: j ? "center" : "left", indent: j ? 0 : 1 }; c.border = borda; });
        rs.getRow(linha0 + 1 + i).height = 21;
      });
      return linha0 + 2 + pares.length;
    };
    const cont = f => { const m = new Map(); linhas.forEach(l => { const k = f(l) || "Não informado"; m.set(k, (m.get(k) || 0) + 1); }); return [...m.entries()].sort((a, b) => b[1] - a[1]); };
    const idades = linhas.map(l => l.idade).filter(x => x != null);
    const faixa = a => a < 12 ? "Crianças (0–11)" : a < 18 ? "Adolescentes (12–17)" : a < 30 ? "Jovens (18–29)" : a < 60 ? "Adultos (30–59)" : "Melhor idade (60+)";
    let y1 = bloco(1, 7, "Visão geral", [
      ["Membros", linhas.length], ["Batizados", linhas.filter(l => l.batizado === "Sim").length], ["Ainda não batizados", linhas.filter(l => l.batizado !== "Sim").length],
      ["Líderes", linhas.filter(l => l.lider === "Sim").length], ["Idade média", idades.length ? Math.round(idades.reduce((s, x) => s + x, 0) / idades.length) : "—"],
      ["Com telefone", linhas.filter(l => l.tel).length], ["Usaram o app (30 dias)", linhas.filter(l => l.acesso && Date.now() - l.acesso < 30 * 864e5).length],
    ]);
    y1 = bloco(1, y1 + 1, "Gênero", cont(l => l.genero));
    y1 = bloco(1, y1 + 1, "Estado civil", cont(l => l.estado));
    bloco(1, y1 + 1, "Faixa etária", cont(l => (l.idade == null ? "" : faixa(l.idade))));
    const y2 = bloco(4, 7, "Grupos", cont(l => (l.tipoGrupo === "departamento" ? null : l.grupo)).filter(([k]) => k !== "Não informado"));
    const deps = new Map();
    linhas.forEach(l => { l.grupoIds.forEach(gid => { const g = grupos.get(gid); if (g && g.tipo === "departamento") deps.set(g.nome, (deps.get(g.nome) || 0) + 1); }); });
    bloco(4, y2 + 1, "Departamentos e ministérios", [...deps.entries()].sort((a, b) => b[1] - a[1]));
    bloco(7, 7, "Aniversariantes por mês", MES.map((m, i) => [m, linhas.filter(l => l.nasc && l.nasc.getUTCMonth() === i).length]));

    /* aba 3: aniversariantes */
    const an = wb.addWorksheet("Aniversariantes", { views: [{ state: "frozen", ySplit: 7, showGridLines: false }], pageSetup: { orientation: "portrait", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 }, headerFooter: { oddFooter: rodape } });
    [14, 34, 12, 10, 18, 22].forEach((w, i) => { an.getColumn(i + 1).width = w; });
    cabecalho(an, "Aniversariantes", "Membros com data de nascimento, mês a mês", 6);
    const ah = an.getRow(7); ah.height = 26;
    ["Mês", "Nome", "Dia", "Idade", "Telefone", "Grupo / departamento"].forEach((t, i) => {
      const c = ah.getCell(i + 1); c.value = t; c.font = { name: "Calibri", size: 10.5, bold: true, color: { argb: FILETE } }; c.fill = fill(CAB);
      c.alignment = { vertical: "middle", horizontal: i === 1 || i >= 4 ? "left" : "center", indent: i === 1 || i >= 4 ? 1 : 0 };
    });
    let r = 8;
    MES.forEach((mes, i) => {
      const lista = linhas.filter(l => l.nasc && l.nasc.getUTCMonth() === i).sort((a, b) => a.nasc.getUTCDate() - b.nasc.getUTCDate());
      lista.forEach((l, k) => {
        const row = an.getRow(r++); row.height = 21;
        [k === 0 ? mes : "", l.nome, pad2(l.nasc.getUTCDate()) + "/" + pad2(i + 1), l.idade != null ? l.idade + 1 : null, l.tel, l.grupo].forEach((v, j) => {
          const c = row.getCell(j + 1); c.value = v === "" ? null : v;
          c.font = { name: "Calibri", size: 10.5, bold: j <= 1, color: { argb: j === 0 ? OURO : TINTA } };
          c.fill = fill(i % 2 ? ZEBRA : "FFFFFFFF");
          c.alignment = { vertical: "middle", horizontal: j === 1 || j >= 4 ? "left" : "center", indent: j === 1 || j >= 4 ? 1 : 0 };
          c.border = borda;
        });
      });
    });
    if (r > 8) { const nota = an.getCell(r + 1, 2); nota.value = "A idade mostrada é a que a pessoa vai completar no aniversário."; nota.font = { name: "Calibri", size: 9, italic: true, color: { argb: CINZA } }; }

    const buf = await wb.xlsx.writeBuffer();
    const tipo = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    entregar(new Blob([buf], { type: tipo }), `rol-de-membros-${slug(ig.nome)}-${hojeISO()}.xlsx`, tipo);
  }

  window.carregarRolAdmin = abrir;
})();
