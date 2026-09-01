// ============================================================
// App Igreja — lógica principal
// ============================================================
const sb = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

const state = {
  igreja: null,
  grupos: [],
  membro: JSON.parse(localStorage.getItem("igr_membro") || "null"),
  grupoSelecionado: null,
  editando: {},
};

// ---------- utilidades ----------
async function sha256(texto) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function limparTelefone(v) {
  return (v || "").replace(/\D/g, "");
}

// deixa todos os campos de data no padrão dd/mm/aaaa, digitável com barra automática,
// com um ícone de calendário que abre o seletor nativo do celular (o input nativo fica
// exatamente por baixo do ícone, do mesmo tamanho — o toque cai direto nele, sem
// precisar simular clique via JS, o que é bem mais confiável em qualquer aparelho).
function isoParaBr(iso) {
  if (!iso || !iso.includes("-")) return "";
  const [aaaa, mm, dd] = iso.split("-");
  return `${dd}/${mm}/${aaaa}`;
}

// mapeia o valor salvo (domingo, segunda...) pro numero do getDay() e pro texto no plural,
// usado tanto pra filtrar quais dias marcar na grade quanto pro texto exibido
const DIA_SEMANA_INFO = {
  domingo: { numero: 0, plural: "aos domingos" },
  segunda: { numero: 1, plural: "às segundas-feiras" },
  terca: { numero: 2, plural: "às terças-feiras" },
  quarta: { numero: 3, plural: "às quartas-feiras" },
  quinta: { numero: 4, plural: "às quintas-feiras" },
  sexta: { numero: 5, plural: "às sextas-feiras" },
  sabado: { numero: 6, plural: "aos sábados" },
};

// data ISO cai no dia da semana escolhido (ou sempre true se nao houver recorrencia definida)
function diaBateComSemana(dataISO, dia_semana) {
  if (!dia_semana || !DIA_SEMANA_INFO[dia_semana]) return true;
  return new Date(dataISO + "T00:00:00").getDay() === DIA_SEMANA_INFO[dia_semana].numero;
}

// monta o texto do periodo, ja juntando a data (ou intervalo) com o dia da semana,
// no formato "06/09/2026 à 20/12/2026 aos domingos" ou so "06/09/2026" se for pontual
function formatarPeriodoCalendario(data, data_fim, dia_semana) {
  const base = (data_fim && data_fim !== data) ? `${formatarData(data)} à ${formatarData(data_fim)}` : formatarData(data);
  const infoDia = dia_semana && DIA_SEMANA_INFO[dia_semana];
  return infoDia ? `${base} ${infoDia.plural}` : base;
}
function estilizarInputsData() {
  document.querySelectorAll('input[type="date"]').forEach(input => {
    if (input.dataset.estilizado) return;
    input.dataset.estilizado = "1";

    const wrapper = document.createElement("div");
    wrapper.className = "data-input-wrapper";
    input.parentNode.insertBefore(wrapper, input);

    const textInput = document.createElement("input");
    textInput.type = "text";
    textInput.inputMode = "numeric";
    textInput.placeholder = "dd/mm/aaaa";
    textInput.maxLength = 10;
    textInput.className = "data-input-texto";
    if (input.value) textInput.value = isoParaBr(input.value);

    const iconeWrap = document.createElement("div");
    iconeWrap.className = "data-input-icone-wrap";
    iconeWrap.innerHTML = '<span class="data-input-icone"><svg class="icon"><use href="#i-calendar"/></svg></span>';

    wrapper.appendChild(textInput);
    wrapper.appendChild(iconeWrap);
    iconeWrap.appendChild(input);
    input.classList.add("data-input-nativo");

    textInput.addEventListener("input", () => {
      let v = textInput.value.replace(/\D/g, "").slice(0, 8);
      if (v.length >= 5) v = v.slice(0, 2) + "/" + v.slice(2, 4) + "/" + v.slice(4);
      else if (v.length >= 3) v = v.slice(0, 2) + "/" + v.slice(2);
      textInput.value = v;
      if (v.length === 10) {
        const [dd, mm, aaaa] = v.split("/");
        const iso = `${aaaa}-${mm}-${dd}`;
        const d = new Date(iso + "T00:00:00");
        if (!isNaN(d) && d.getDate() === parseInt(dd, 10) && d.getMonth() + 1 === parseInt(mm, 10)) {
          input.value = iso;
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }
      } else {
        input.value = "";
      }
    });

    // o input nativo (nao o texto) recebe o toque de verdade, entao seu proprio
    // "change" (disparado pelo navegador ao escolher no calendario) e o unico
    // lugar que precisa atualizar o texto visivel
    input.addEventListener("change", () => {
      textInput.value = input.value ? isoParaBr(input.value) : "";
    });
  });
}

function definirValorData(id, isoValue) {
  const input = document.getElementById(id);
  if (!input) return;
  input.value = isoValue || "";
  const textInput = input.closest(".data-input-wrapper")?.querySelector(".data-input-texto");
  if (textInput) textInput.value = isoValue ? isoParaBr(isoValue) : "";
}

function estilizarInputsArquivo() {
  document.querySelectorAll('input[type="file"]').forEach(input => {
    if (input.dataset.estilizado) return;
    input.dataset.estilizado = "1";
    if (!input.id) input.id = "file-" + Math.random().toString(36).slice(2);
    input.style.display = "none";

    const label = document.createElement("label");
    label.className = "file-upload-btn";
    label.setAttribute("for", input.id);
    label.textContent = input.multiple ? "📷 Escolher fotos" : "📷 Escolher arquivo";

    const nomeSpan = document.createElement("span");
    nomeSpan.className = "hint file-upload-nome";
    nomeSpan.textContent = "Nenhum arquivo selecionado";

    input.insertAdjacentElement("afterend", nomeSpan);
    input.insertAdjacentElement("afterend", label);

    input.addEventListener("change", () => {
      const arquivos = input.files;
      if (!arquivos || !arquivos.length) { nomeSpan.textContent = "Nenhum arquivo selecionado"; return; }
      nomeSpan.textContent = arquivos.length > 1 ? `${arquivos.length} fotos selecionadas` : arquivos[0].name;
    });
  });
}

// recorta uma imagem em quadrado, centralizada, antes do upload (foto de perfil)
// ---------- editor interativo de foto de perfil (arrastar + zoom) ----------
const fotoEditor = { img: null, naturalW: 0, naturalH: 0, baseScale: 1, offsetX: 0, offsetY: 0, arrastando: false, inicioX: 0, inicioY: 0, resolver: null };
const FOTO_EDITOR_TAMANHO = 240;

function abrirEditorFoto(fonteImagem) {
  return new Promise((resolve) => {
    fotoEditor.resolver = resolve;
    const imgEl = document.getElementById("foto-editor-img");
    imgEl.crossOrigin = "anonymous";
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      fotoEditor.naturalW = img.naturalWidth;
      fotoEditor.naturalH = img.naturalHeight;
      fotoEditor.baseScale = FOTO_EDITOR_TAMANHO / Math.min(img.naturalWidth, img.naturalHeight);
      document.getElementById("foto-editor-zoom").value = 100;
      posicionarImagemEditor(true);
      document.getElementById("foto-editor-overlay").classList.add("open");
    };
    img.onerror = () => {
      alert("Não deu pra carregar essa foto pra editar. Tente escolher o arquivo de novo.");
      if (fotoEditor.resolver) fotoEditor.resolver(null);
      fotoEditor.resolver = null;
    };
    img.src = fonteImagem;
    imgEl.src = fonteImagem;
    fotoEditor.img = imgEl;
  });
}

function posicionarImagemEditor(centralizar) {
  const zoomMult = document.getElementById("foto-editor-zoom").value / 100;
  const escala = fotoEditor.baseScale * zoomMult;
  const largura = fotoEditor.naturalW * escala;
  const altura = fotoEditor.naturalH * escala;
  if (centralizar) {
    fotoEditor.offsetX = (FOTO_EDITOR_TAMANHO - largura) / 2;
    fotoEditor.offsetY = (FOTO_EDITOR_TAMANHO - altura) / 2;
  }
  fotoEditor.img.style.width = largura + "px";
  fotoEditor.img.style.height = altura + "px";
  fotoEditor.img.style.left = fotoEditor.offsetX + "px";
  fotoEditor.img.style.top = fotoEditor.offsetY + "px";
}

function fecharEditorFoto() {
  document.getElementById("foto-editor-overlay").classList.remove("open");
  fotoEditor.resolver = null;
}

function salvarEditorFoto() {
  const btnSalvar = document.getElementById("foto-editor-salvar");
  try {
    const zoomMult = document.getElementById("foto-editor-zoom").value / 100;
    const escala = fotoEditor.baseScale * zoomMult;
    const sx = -fotoEditor.offsetX / escala;
    const sy = -fotoEditor.offsetY / escala;
    const sLado = FOTO_EDITOR_TAMANHO / escala;

    const canvas = document.createElement("canvas");
    canvas.width = 500; canvas.height = 500;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(fotoEditor.img, sx, sy, sLado, sLado, 0, 0, 500, 500);
    canvas.toBlob(blob => {
      if (!blob) {
        alert("Não deu pra salvar o recorte agora. Tente escolher a foto de novo pelo botão \"Escolher arquivo\".");
        fecharEditorFoto();
        return;
      }
      const arquivo = new File([blob], "perfil.jpg", { type: "image/jpeg" });
      if (fotoEditor.resolver) fotoEditor.resolver(arquivo);
      fecharEditorFoto();
    }, "image/jpeg", 0.9);
  } catch (e) {
    console.error("Erro ao salvar recorte da foto:", e);
    alert("Não deu pra salvar o recorte agora. Tente escolher a foto de novo pelo botão \"Escolher arquivo\".");
    fecharEditorFoto();
  } finally {
    btnSalvar.disabled = false;
  }
}

function configurarEditorFoto() {
  const viewport = document.getElementById("foto-editor-viewport");
  const zoomSlider = document.getElementById("foto-editor-zoom");

  const iniciarArrasto = (x, y) => {
    fotoEditor.arrastando = true;
    fotoEditor.inicioX = x - fotoEditor.offsetX;
    fotoEditor.inicioY = y - fotoEditor.offsetY;
  };
  const moverArrasto = (x, y) => {
    if (!fotoEditor.arrastando) return;
    fotoEditor.offsetX = x - fotoEditor.inicioX;
    fotoEditor.offsetY = y - fotoEditor.inicioY;
    fotoEditor.img.style.left = fotoEditor.offsetX + "px";
    fotoEditor.img.style.top = fotoEditor.offsetY + "px";
  };
  const pararArrasto = () => { fotoEditor.arrastando = false; };

  viewport.addEventListener("pointerdown", (ev) => { viewport.setPointerCapture(ev.pointerId); iniciarArrasto(ev.clientX, ev.clientY); });
  viewport.addEventListener("pointermove", (ev) => moverArrasto(ev.clientX, ev.clientY));
  viewport.addEventListener("pointerup", pararArrasto);
  viewport.addEventListener("pointercancel", pararArrasto);

  zoomSlider.addEventListener("input", () => posicionarImagemEditor(false));
  document.getElementById("foto-editor-cancelar").addEventListener("click", () => {
    if (fotoEditor.resolver) fotoEditor.resolver(null);
    fecharEditorFoto();
  });
  document.getElementById("foto-editor-salvar").addEventListener("click", salvarEditorFoto);
}

async function uploadArquivo(file, pasta) {
  if (!file) return null;
  try {
    const ext = (file.name.split(".").pop() || "bin").toLowerCase();
    const path = `${pasta}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await sb.storage.from("igreja-arquivos").upload(path, file);
    if (error) { console.error("Erro no upload:", error); return null; }
    const { data } = sb.storage.from("igreja-arquivos").getPublicUrl(path);
    return data?.publicUrl || null;
  } catch (e) {
    console.error("Erro no upload:", e);
    return null;
  }
}

// Aplica uma marca d'água pequena (logo da igreja) no canto inferior direito de uma foto, via Canvas
function aplicarMarcaDagua(file, logoUrl) {
  return new Promise((resolve) => {
    if (!file || !file.type.startsWith("image/")) { resolve(file); return; }
    const imgUrl = URL.createObjectURL(file);
    const foto = new Image();
    foto.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = foto.naturalWidth;
      canvas.height = foto.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(foto, 0, 0);
      URL.revokeObjectURL(imgUrl);

      const finalizar = () => {
        canvas.toBlob(blob => {
          if (!blob) { resolve(file); return; }
          const nomeComExtensao = (file.name || "foto.jpg").replace(/\.[^.]+$/, "") + "-marcado.jpg";
          resolve(new File([blob], nomeComExtensao, { type: "image/jpeg" }));
        }, "image/jpeg", 0.9);
      };

      if (!logoUrl) { finalizar(); return; }
      const logo = new Image();
      logo.crossOrigin = "anonymous";
      logo.onload = () => {
        const larguraLogo = canvas.width * 0.13;
        const alturaLogo = larguraLogo * (logo.naturalHeight / logo.naturalWidth);
        const margem = canvas.width * 0.025;
        const x = canvas.width - larguraLogo - margem;
        const y = canvas.height - alturaLogo - margem;
        ctx.globalAlpha = 0.85;
        ctx.drawImage(logo, x, y, larguraLogo, alturaLogo);
        ctx.globalAlpha = 1;
        finalizar();
      };
      logo.onerror = finalizar;
      logo.src = logoUrl;
    };
    foto.onerror = () => resolve(file);
    foto.src = imgUrl;
  });
}

// Avatar circular com iniciais, cores alternadas (padrão visual do Stitch)
const AVATAR_CORES = ["#0026B7", "#F9BD00", "#15C08A", "#FF6A5C", "#8B5CF6", "#0EA5E9"];
function avatarIniciais(nome, idx) {
  const partes = (nome || "?").trim().split(/\s+/);
  const iniciais = ((partes[0]?.[0] || "") + (partes[1]?.[0] || "")).toUpperCase() || "?";
  const cor = AVATAR_CORES[Math.abs(hashStr(nome || "")) % AVATAR_CORES.length];
  return `<span class="avatar-ini" style="background:${cor}22;color:${cor};">${iniciais}</span>`;
}
function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  return h;
}

// ---------- adicionar à agenda (.ics) ----------
const DIAS_SEMANA_MAP = {
  "domingo": 0, "segunda": 1, "segunda-feira": 1, "terça": 2, "terca": 2, "terça-feira": 2, "terca-feira": 2,
  "quarta": 3, "quarta-feira": 3, "quinta": 4, "quinta-feira": 4, "sexta": 5, "sexta-feira": 5,
  "sábado": 6, "sabado": 6,
};
function proximaOcorrencia(diaSemanaTexto, horarioTexto) {
  const alvo = DIAS_SEMANA_MAP[(diaSemanaTexto || "").toLowerCase().trim()];
  const [h, m] = (horarioTexto || "00:00").split(":").map(n => parseInt(n, 10) || 0);
  const d = new Date();
  if (alvo === undefined) { d.setHours(h, m, 0, 0); return d; }
  let diff = (alvo - d.getDay() + 7) % 7;
  if (diff === 0 && (d.getHours() > h || (d.getHours() === h && d.getMinutes() >= m))) diff = 7;
  d.setDate(d.getDate() + diff);
  d.setHours(h, m, 0, 0);
  return d;
}
function gerarICS({ titulo, descricao, local, inicio, duracaoMin, semanal, alarmeMin }) {
  const pad = n => String(n).padStart(2, "0");
  const fmt = d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
  const fim = new Date(inicio.getTime() + (duracaoMin || 60) * 60000);
  const linhas = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "BEGIN:VEVENT",
    `UID:${Date.now()}-${Math.random().toString(36).slice(2)}@app-igreja`,
    `DTSTAMP:${fmt(new Date())}`, `DTSTART:${fmt(inicio)}`, `DTEND:${fmt(fim)}`,
    `SUMMARY:${(titulo || "").replace(/\n/g, " ")}`,
  ];
  if (descricao) linhas.push(`DESCRIPTION:${descricao.replace(/\n/g, " ")}`);
  if (local) linhas.push(`LOCATION:${local.replace(/\n/g, " ")}`);
  if (semanal) linhas.push("RRULE:FREQ=WEEKLY");
  if (alarmeMin) {
    linhas.push("BEGIN:VALARM", `TRIGGER:-PT${alarmeMin}M`, "ACTION:AUDIO", "END:VALARM");
  }
  linhas.push("END:VEVENT", "END:VCALENDAR");
  return linhas.join("\r\n");
}
function baixarICS(ics, nomeArquivo) {
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = nomeArquivo; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function adicionarCultoAgenda(titulo, diaSemana, horario, local) {
  const inicio = proximaOcorrencia(diaSemana, horario);
  const ics = gerarICS({ titulo, local, inicio, duracaoMin: 90, semanal: true });
  baixarICS(ics, `${titulo.replace(/\s+/g, "-")}.ics`);
}
function adicionarEventoAgenda(titulo, dataStr, horario, local, descricao) {
  const [h, m] = (horario || "00:00").split(":").map(n => parseInt(n, 10) || 0);
  const inicio = new Date(dataStr + "T00:00:00");
  inicio.setHours(h, m, 0, 0);
  const ics = gerarICS({ titulo, local, descricao, inicio, duracaoMin: 90 });
  baixarICS(ics, `${titulo.replace(/\s+/g, "-")}.ics`);
}
function adicionarCalendarioAgenda(titulo, dataStr, dataFimStr, horario, local, observacoes) {
  const [h, m] = (horario || "00:00").split(":").map(n => parseInt(n, 10) || 0);
  const inicio = new Date(dataStr + "T00:00:00");
  inicio.setHours(h, m, 0, 0);
  let duracaoMin = 60;
  if (dataFimStr && dataFimStr !== dataStr) {
    const fim = new Date(dataFimStr + "T00:00:00");
    fim.setHours(h, m, 0, 0);
    duracaoMin = Math.round((fim.getTime() - inicio.getTime()) / 60000) + 60;
  }
  const ics = gerarICS({ titulo, local, descricao: observacoes, inicio, duracaoMin, alarmeMin: 5 });
  baixarICS(ics, `${titulo.replace(/\s+/g, "-")}.ics`);
}

// Selo de data (mês abreviado + dia), padrão visual do Stitch pros avisos/eventos
function seloData(dataStr) {
  if (!dataStr) return `<span class="date-badge"><b>—</b>—</span>`;
  const d = new Date(dataStr + (dataStr.length <= 10 ? "T00:00:00" : ""));
  const meses = ["JAN","FEV","MAR","ABR","MAI","JUN","JUL","AGO","SET","OUT","NOV","DEZ"];
  return `<span class="date-badge">${meses[d.getMonth()]}<b>${d.getDate()}</b></span>`;
}

// Caixinhas de PIN (login/cadastro) — sincroniza com o input oculto e avança o foco
function configurarPinBoxes() {
  document.querySelectorAll("[data-pin-group]").forEach(grupo => {
    const hidden = document.getElementById(grupo.dataset.pinGroup);
    const boxes = Array.from(grupo.querySelectorAll(".pin-box"));
    const sync = () => { if (hidden) hidden.value = boxes.map(b => b.value).join(""); };
    boxes.forEach((box, i) => {
      box.addEventListener("input", () => {
        box.value = box.value.replace(/\D/g, "").slice(0, 1);
        if (box.value && boxes[i + 1]) boxes[i + 1].focus();
        sync();
      });
      box.addEventListener("keydown", (ev) => {
        if (ev.key === "Backspace" && !box.value && boxes[i - 1]) boxes[i - 1].focus();
      });
    });
  });
}

function linkWhatsapp(telefone, mensagem) {
  const numero = limparTelefone(telefone);
  const comDDI = numero.startsWith("55") ? numero : "55" + numero;
  return `https://wa.me/${comDDI}?text=${encodeURIComponent(mensagem)}`;
}

// ---------- modal do aniversariante ----------
function abrirModalAniversariante(pessoa) {
  if (!pessoa) return;
  const primeiro = pessoa.nome_completo.split(" ")[0];
  const foto = pessoa.foto_url
    ? `<img src="${pessoa.foto_url}" style="width:84px;height:84px;border-radius:50%;object-fit:cover;margin:0 auto 14px;display:block;">`
    : `<div style="width:84px;height:84px;border-radius:50%;margin:0 auto 14px;display:flex;align-items:center;justify-content:center;">${avatarIniciais(pessoa.nome_completo)}</div>`;
  const mensagemPadrao = `Oi ${primeiro}! Passando pra desejar um feliz aniversário, que Deus abençoe muito a sua vida! 🎉🙏`;

  const conteudo = document.getElementById("aniv-modal-conteudo");
  conteudo.innerHTML = `
    ${foto}
    <h3 style="text-align:center;margin:0 0 4px;font-family:'Montserrat',sans-serif;">🎉 ${primeiro} faz aniversário!</h3>
    <p class="hint" style="text-align:center;margin-bottom:18px;">Escreva um carinho — fica registrado no perfil ${pessoa.telefone ? "e já abre pra você mandar no WhatsApp também" : "dela(e)"}.</p>
    <div class="field" style="margin-bottom:8px;">
      <label>Sua mensagem</label>
      <textarea id="aniv-msg-texto" rows="3" maxlength="280" style="width:100%;padding:13px 14px;border-radius:12px;border:1.5px solid var(--line);background:var(--bg);font-family:'Inter',sans-serif;font-size:14px;">${mensagemPadrao}</textarea>
    </div>
    <button class="btn btn-primary" id="aniv-msg-enviar" type="button">${pessoa.telefone ? "💬 Enviar (perfil + WhatsApp)" : "Enviar mensagem"}</button>
    <p class="hint" id="aniv-msg-status" style="text-align:center;margin-top:8px;"></p>
  `;
  document.getElementById("aniv-msg-enviar").addEventListener("click", () => enviarMensagemPerfil(pessoa));
  document.getElementById("modal-aniversariante").classList.add("open");
}
function fecharModalAniversariante() {
  document.getElementById("modal-aniversariante").classList.remove("open");
}
async function enviarMensagemPerfil(pessoa) {
  const texto = document.getElementById("aniv-msg-texto").value.trim();
  if (!texto) return;
  const btn = document.getElementById("aniv-msg-enviar");
  btn.disabled = true; btn.textContent = "Enviando...";
  const { error } = await sb.from("igr_interacoes_perfil").insert({
    membro_destino_id: pessoa.id,
    membro_origem_id: state.membro?.id || null,
    nome_origem: state.membro?.nome_completo || "Alguém da igreja",
    texto,
  });
  btn.disabled = false; btn.textContent = pessoa.telefone ? "💬 Enviar (perfil + WhatsApp)" : "Enviar mensagem";
  const statusEl = document.getElementById("aniv-msg-status");
  if (error) { statusEl.textContent = "Não deu pra enviar agora. Tente de novo."; return; }

  if (pessoa.telefone) {
    window.open(linkWhatsapp(pessoa.telefone, texto), "_blank", "noopener");
  }
  statusEl.textContent = "Mensagem salva no perfil dela(e)! 💛";
  setTimeout(fecharModalAniversariante, 1200);
}

async function carregarMensagensRecebidas() {
  const el = document.getElementById("ep-mensagens-recebidas");
  if (!el || !state.membro) return;
  const { data } = await sb.from("igr_interacoes_perfil").select("*").eq("membro_destino_id", state.membro.id).order("created_at", { ascending: false });
  el.innerHTML = (data || []).map(m => `
    <div class="card">
      <b style="font-size:13px;">${m.nome_origem}</b>
      <p style="margin:4px 0 0;font-size:13px;">${m.texto}</p>
      <span class="hint">${formatarData(m.created_at)}</span>
    </div>
  `).join("") || `<p class="hint">Nenhuma mensagem recebida ainda.</p>`;
}

function formatarData(dataIso) {
  if (!dataIso) return "";
  const d = new Date(dataIso + "T00:00:00");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });
}

function formatarPeriodo(inicio, fim) {
  if (!inicio) return "";
  if (!fim || fim === inicio) return formatarData(inicio);
  return `${formatarData(inicio)} a ${formatarData(fim)}`;
}

function tempoRelativo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const dias = Math.floor(diffMs / 86400000);
  if (dias <= 0) return "Enviado hoje";
  if (dias === 1) return "Enviado ontem";
  return `Enviado há ${dias} dias`;
}

function mostrarTela(id) {
  fecharLightbox();
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  document.getElementById("bottomnav").style.display =
    (state.membro && id.startsWith("tela-membro-")) ? "flex" : "none";
  document.querySelectorAll(".navitem").forEach(n => n.classList.remove("on"));
  const nav = document.querySelector(`.navitem[data-target="${id}"]`);
  if (nav) nav.classList.add("on");
  window.scrollTo(0, 0);
}

function aplicarMarca(igreja) {
  document.documentElement.style.setProperty("--brand", igreja.cor_primaria || "#3D5AFE");
  document.documentElement.style.setProperty("--coral", igreja.cor_secundaria || "#FF6A5C");
  document.querySelectorAll(".wordmark span").forEach(el => el.textContent = igreja.nome);
  document.querySelectorAll(".wordmark img").forEach(el => el.src = igreja.logo_url || "assets/logo.png");
  document.getElementById("appbar-nome").textContent = igreja.nome;
  document.getElementById("appbar-logo").src = igreja.logo_url || "assets/logo.png";
  document.getElementById("drawer-nome").textContent = igreja.nome;
  document.querySelector(".drawer-brand img").src = igreja.logo_url || "assets/logo.png";
  document.title = igreja.nome;
}

// ---------- carregamento inicial ----------
async function carregarIgreja() {
  const { data, error } = await sb.from("igr_igrejas").select("*").eq("slug", window.IGREJA_SLUG).single();
  if (error || !data) {
    document.getElementById("app").innerHTML = `<div class="empty" style="padding:60px 24px;">Não encontramos os dados da igreja. Verifique a configuração (slug "${window.IGREJA_SLUG}").</div>`;
    throw error;
  }
  state.igreja = data;
  aplicarMarca(data);

  const { data: grupos } = await sb.from("igr_grupos").select("*").eq("igreja_id", data.id).order("created_at");
  state.grupos = grupos || [];
  document.querySelectorAll(".termo-grupo").forEach(el => el.textContent = data.termo_grupo || "Grupo");
}

async function carregarCultos() {
  const { data } = await sb.from("igr_cultos").select("*").eq("igreja_id", state.igreja.id).order("ordem");
  const hojeISO = new Date().toISOString().slice(0, 10);
  const visiveis = (data || []).filter(c => {
    if (c.data_inicio && hojeISO < c.data_inicio) return false;
    if (c.data_fim && hojeISO > c.data_fim) return false;
    return true;
  });
  const el = document.getElementById("lista-cultos");
  el.innerHTML = visiveis.map(c => {
    const periodo = (c.data_inicio || c.data_fim)
      ? `${c.data_inicio ? formatarData(c.data_inicio) : "início"} à ${c.data_fim ? formatarData(c.data_fim) : "sem data final"}${c.dia_semana && !c.data ? " às " + c.dia_semana.toLowerCase() + "s" : ""}`
      : "";
    return `
    <div class="card">
      ${c.imagem_url ? `<img class="capa-thumb" src="${c.imagem_url}" alt="">` : ""}
      <h3>${c.titulo}</h3>
      <p>${c.data ? formatarData(c.data) + " (especial)" : (c.dia_semana || "")} · ${c.horario || ""} · ${c.local || ""}</p>
      ${periodo ? `<p class="hint" style="margin:2px 0 0;">📅 ${periodo}</p>` : ""}
      <button class="btn btn-ghost" style="width:auto;padding:8px 14px;font-size:12px;margin-top:8px;" data-add-agenda-culto="${c.id}">📅 Adicionar à agenda</button>
    </div>
  `;
  }).join("") || `<div class="empty">Nenhum culto cadastrado ainda.</div>`;
  el.querySelectorAll("[data-add-agenda-culto]").forEach(btn => {
    const c = visiveis.find(x => x.id === btn.dataset.addAgendaCulto);
    if (!c) return;
    btn.addEventListener("click", () => {
      if (c.data) adicionarEventoAgenda(c.titulo, c.data, c.horario, c.local, "");
      else adicionarCultoAgenda(c.titulo, c.dia_semana, c.horario, c.local);
    });
  });
}

async function carregarAvisos(targetId) {
  const { data } = await sb.from("igr_avisos").select("*").eq("igreja_id", state.igreja.id).order("publicado_em", { ascending: false }).limit(8);
  const grupoMembro = state.membro?.grupo_id || null;
  const visiveis = (data || []).filter(a => !a.grupo_id || a.grupo_id === grupoMembro);
  const el = document.getElementById(targetId);
  if (!el) return;
  el.innerHTML = visiveis.slice(0, 5).map(a => `
    <div class="card">
      ${a.imagem_url ? `<img class="capa-thumb" src="${a.imagem_url}" alt="">` : ""}
      ${a.video_url ? `<video class="capa-thumb" src="${a.video_url}" controls playsinline></video>` : ""}
      <div class="row-avatar" style="align-items:flex-start;">
        ${seloData(a.publicado_em)}
        <div class="row-info">
          <b>${a.titulo}</b>
          <span class="badge-inline">${a.grupo_id ? "Aviso do grupo" : "Aviso"}</span>
          <p style="margin:4px 0 0;font-size:12.5px;color:var(--ink-soft);">${a.texto || ""}</p>
        </div>
      </div>
    </div>
  `).join("") || `<div class="empty">Nenhum aviso no momento.</div>`;
}

// ---------- visitante ----------
function calcularIdade(dataNascStr) {
  const nasc = new Date(dataNascStr + "T00:00:00");
  const hoje = new Date();
  let idade = hoje.getFullYear() - nasc.getFullYear();
  const aindaNaoFezAniversario = (hoje.getMonth() < nasc.getMonth()) ||
    (hoje.getMonth() === nasc.getMonth() && hoje.getDate() < nasc.getDate());
  if (aindaNaoFezAniversario) idade--;
  return idade;
}

function classificarVisitante(dataNasc, genero, estadoCivil) {
  const idade = calcularIdade(dataNasc);
  let categoria;
  if (idade >= 4 && idade <= 10) categoria = "crianca";
  else if (idade >= 11 && idade <= 13) categoria = "juniores";
  else if (idade >= 14 && idade <= 32 && (estadoCivil === "solteiro" || idade <= 17)) categoria = "jovem";
  else if (genero === "M") categoria = "homens";
  else if (genero === "F") categoria = "mulheres";
  else return { idade, grupo: null };
  const grupo = state.grupos.find(g => g.categoria === categoria) || null;
  return { idade, grupo };
}

async function enviarContatoVisitante(ev) {
  ev.preventDefault();
  const nome = document.getElementById("visitante-nome").value.trim();
  const telefone = limparTelefone(document.getElementById("visitante-telefone").value);
  const data_nascimento = document.getElementById("visitante-nascimento").value;
  const genero = document.getElementById("visitante-genero").value;
  const estado_civil = document.getElementById("visitante-estado-civil").value;
  if (!nome || !telefone || !data_nascimento || !genero || !estado_civil) return;
  if (!state.igreja) { alert("Ainda carregando os dados da igreja. Aguarde um instante e toque em Enviar de novo."); return; }
  const btn = document.getElementById("btn-enviar-visitante");
  btn.disabled = true; btn.textContent = "Enviando...";
  try {
    const { grupo } = classificarVisitante(data_nascimento, genero, estado_civil);
    const { error } = await sb.from("igr_visitantes").insert({
      igreja_id: state.igreja.id, nome, telefone, data_nascimento, genero, estado_civil,
      grupo_id: grupo?.id || null,
    });
    if (error) { alert("Não deu pra enviar agora. Tente de novo em instantes."); return; }
    const msgGrupo = grupo ? ` Já te encaminhamos pro <b>${grupo.nome}</b> — em breve alguém de lá te chama no WhatsApp!` : " Alguém da nossa equipe vai entrar em contato.";
    document.getElementById("form-visitante").innerHTML = `<div class="empty">Obrigado, ${nome.split(" ")[0]}! 💛${msgGrupo}</div>`;
  } catch (e) {
    console.error("Erro ao enviar contato de visitante:", e);
    alert("Não deu pra enviar agora. Verifique sua conexão e tente de novo.");
  } finally {
    btn.disabled = false; btn.textContent = "Enviar";
  }
}

// ---------- cadastro de membro ----------
async function concluirCadastro(ev) {
  ev.preventDefault();
  const nome_completo = document.getElementById("cad-nome").value.trim();
  const data_nascimento = document.getElementById("cad-nascimento").value;
  const endereco = document.getElementById("cad-endereco").value.trim();
  const telefone = limparTelefone(document.getElementById("cad-telefone").value);
  const pin = document.getElementById("cad-senha").value.trim();
  const pinConfirmar = document.getElementById("cad-senha-confirmar").value.trim();
  const errEl = document.getElementById("cad-erro");
  errEl.classList.remove("show");

  if (!nome_completo || !telefone || !/^\d{4}$/.test(pin)) {
    errEl.textContent = "Preencha nome, telefone e uma senha de 4 números.";
    errEl.classList.add("show");
    return;
  }
  if (!endereco) {
    errEl.textContent = "O endereço é obrigatório.";
    errEl.classList.add("show");
    return;
  }
  if (pin !== pinConfirmar) {
    errEl.textContent = "As senhas não coincidem. Digite a mesma senha nos dois campos.";
    errEl.classList.add("show");
    return;
  }
  if (!state.igreja) {
    errEl.textContent = "Ainda carregando os dados da igreja. Aguarde um instante e toque em Concluir de novo.";
    errEl.classList.add("show");
    return;
  }

  const btn = document.getElementById("btn-concluir-cadastro");
  btn.disabled = true; btn.textContent = "Enviando...";

  try {
    const pin_hash = await sha256(pin + ":" + telefone);
    const batizadoResp = document.getElementById("cad-batizado").value;
    const batizado = batizadoResp === "sim" ? true : batizadoResp === "nao" ? false : null;
    const data_batismo = document.getElementById("cad-data-batismo").value || null;
    const pastor_batismo = document.getElementById("cad-pastor-batismo").value.trim() || null;
    const interesses = coletarInteresses("cad-interesses-lista", "cad-interesse-outro");
    const autoriza_fotos = document.getElementById("cad-autoriza-fotos").checked;
    const genero = document.getElementById("cad-genero").value || null;
    const estado_civil = document.getElementById("cad-estado-civil").value || null;
    const { grupo } = data_nascimento ? classificarVisitante(data_nascimento, genero, estado_civil) : { grupo: null };

    const { data, error } = await sb.from("igr_membros").insert({
      igreja_id: state.igreja.id, nome_completo, telefone, endereco,
      data_nascimento: data_nascimento || null,
      genero, estado_civil,
      grupo_id: grupo?.id || null,
      pin_hash,
      lider_status: "nenhum",
      batizado, data_batismo, pastor_batismo, interesses,
      autoriza_fotos,
      perfil_completo: true,
    }).select().single();

    if (error) {
      errEl.textContent = error.code === "23505"
        ? "Já existe um cadastro com esse telefone. Tente entrar em vez de cadastrar."
        : "Não deu pra concluir agora. Tente de novo em instantes.";
      errEl.classList.add("show");
      return;
    }

    if (state.parentesSelecionados?.length) {
      await salvarVinculosParentes(data.id, state.parentesSelecionados, nome_completo);
    }

    entrarComoMembro(data);
  } catch (e) {
    console.error("Erro ao concluir cadastro:", e);
    errEl.textContent = "Não deu pra concluir agora. Verifique sua conexão e tente de novo.";
    errEl.classList.add("show");
  } finally {
    btn.disabled = false; btn.textContent = "Concluir cadastro";
  }
}

// ---------- interesses / talentos (checklist reutilizável) ----------
const OPCOES_INTERESSES = [
  "Louvor e Música", "Recepção e Acolhimento", "Trabalho com Crianças", "Mídia e Tecnologia",
  "Oração e Intercessão", "Ensino e Estudos Bíblicos", "Organização de Eventos",
  "Redes Sociais", "Cozinha", "Limpeza e Manutenção",
];
function renderInteresses(containerId, jaSelecionados) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const selecionados = jaSelecionados || [];
  el.innerHTML = OPCOES_INTERESSES.map((op, i) => `
    <label class="interesse-item">
      <input type="checkbox" value="${op}" ${selecionados.includes(op) ? "checked" : ""}>
      ${op}
    </label>
  `).join("");
}
function coletarInteresses(containerId, outroInputId) {
  const el = document.getElementById(containerId);
  const marcados = Array.from(el.querySelectorAll("input:checked")).map(i => i.value);
  const outro = document.getElementById(outroInputId)?.value.trim();
  if (outro) marcados.push(outro);
  return marcados;
}

const INVERSO_PARENTESCO = {
  "Cônjuge": "Cônjuge", "Pai": "Filho(a)", "Mãe": "Filho(a)", "Filho(a)": "Pai/Mãe",
  "Irmão(ã)": "Irmão(ã)", "Avô/Avó": "Neto(a)", "Neto(a)": "Avô/Avó",
  "Tio(a)": "Sobrinho(a)", "Sobrinho(a)": "Tio(a)", "Primo(a)": "Primo(a)", "Outro": "Outro",
};

async function salvarVinculosParentes(membroId, parentesIds, nomeQuemConecta) {
  const linhas = [];
  parentesIds.forEach(pid => {
    const grau = state.parentescosPorId?.[pid] || null;
    linhas.push({ membro_id: membroId, parente_id: pid, parentesco: grau });
    linhas.push({ membro_id: pid, parente_id: membroId, parentesco: grau ? (INVERSO_PARENTESCO[grau] || grau) : null });
  });
  // ignora vínculos que já existem, pra não dar erro ao salvar de novo sem mudar nada
  await sb.from("igr_membros_parentes").upsert(linhas, { onConflict: "membro_id,parente_id", ignoreDuplicates: true });
  // avisa cada parente já cadastrado de que houve uma conexão
  const nomeQuemConectou = (nomeQuemConecta || state.membro?.nome_completo || "Alguém").split(" ")[0];
  enviarPush({ tipo: "membros", membro_ids: parentesIds }, "Nova conexão familiar 💛", `${nomeQuemConectou} te adicionou como parente no app da igreja.`);
}
async function removerVinculosParentes(membroId, parentesIds) {
  await sb.from("igr_membros_parentes").delete().eq("membro_id", membroId).in("parente_id", parentesIds);
  await sb.from("igr_membros_parentes").delete().in("membro_id", parentesIds).eq("parente_id", membroId);
}

// ---------- meu perfil (editar dados / trocar senha) ----------
function abrirEditarPerfil() {
  const m = state.membro;
  if (!m) return;
  document.getElementById("ep-nome").value = m.nome_completo || "";
  document.getElementById("ep-telefone").value = m.telefone || "";
  document.getElementById("ep-email").value = m.email || "";
  definirValorData("ep-nascimento", m.data_nascimento);
  document.getElementById("ep-endereco").value = m.endereco || "";
  document.getElementById("ep-profissao").value = m.profissao || "";
  document.getElementById("ep-foto-preview").src = m.foto_url || "assets/logo.png";
  state.fotoPerfilRecortada = null;
  renderInteresses("ep-interesses-lista", m.interesses || []);
  document.getElementById("ep-interesse-outro").value = "";

  document.getElementById("ep-batizado").value = m.batizado === true ? "sim" : m.batizado === false ? "nao" : "";
  definirValorData("ep-data-batismo", m.data_batismo);
  document.getElementById("ep-pastor-batismo").value = m.pastor_batismo || "";
  document.getElementById("ep-batismo-detalhes").style.display = m.batizado === true ? "block" : "none";

  document.getElementById("ep-tem-parentes").value = "";
  document.getElementById("ep-parentes-detalhes").style.display = "none";
  state.parentesSelecionadosPerfil = [];
  state.parentesOriginaisPerfil = [];
  document.getElementById("ep-parentes-selecionados").innerHTML = "";
  carregarParentesExistentes(m.id);
  carregarMensagensRecebidas();

  document.getElementById("ep-erro").classList.remove("show");
  document.getElementById("ep-senha-erro").classList.remove("show");
  document.getElementById("form-trocar-senha").style.display = "none";
  mostrarTela("tela-editar-perfil");
}

async function carregarParentesExistentes(membroId) {
  const { data } = await sb.from("igr_membros_parentes").select("parente_id, parentesco, igr_membros!igr_membros_parentes_parente_id_fkey(nome_completo)").eq("membro_id", membroId);
  state.parentesOriginaisPerfil = (data || []).map(r => r.parente_id);
  if (!data || !data.length) return;
  state.parentesSelecionadosPerfil = [...state.parentesOriginaisPerfil];
  state.nomesParentesCache = state.nomesParentesCache || {};
  state.parentescosPorId = state.parentescosPorId || {};
  data.forEach(r => {
    state.nomesParentesCache[r.parente_id] = r.igr_membros?.nome_completo || "…";
    state.parentescosPorId[r.parente_id] = r.parentesco || "";
  });
  document.getElementById("ep-tem-parentes").value = "sim";
  document.getElementById("ep-parentes-detalhes").style.display = "block";
  renderPillsParentes("ep-parentes-selecionados", "parentesSelecionadosPerfil", "ep-busca-parente", "ep-parente-sugestoes");
}

async function enviarEditarPerfil(ev) {
  ev.preventDefault();
  const nome_completo = document.getElementById("ep-nome").value.trim();
  const telefone = limparTelefone(document.getElementById("ep-telefone").value);
  const email = document.getElementById("ep-email").value.trim() || null;
  const data_nascimento = document.getElementById("ep-nascimento").value || null;
  const endereco = document.getElementById("ep-endereco").value.trim();
  const profissao = document.getElementById("ep-profissao").value.trim() || null;
  const interesses = coletarInteresses("ep-interesses-lista", "ep-interesse-outro");
  const batizadoResp = document.getElementById("ep-batizado").value;
  const batizado = batizadoResp === "sim" ? true : batizadoResp === "nao" ? false : null;
  const data_batismo = document.getElementById("ep-data-batismo").value || null;
  const pastor_batismo = document.getElementById("ep-pastor-batismo").value.trim() || null;
  const errEl = document.getElementById("ep-erro");
  errEl.classList.remove("show");

  if (!nome_completo || !telefone) {
    errEl.textContent = "Preencha ao menos nome e telefone.";
    errEl.classList.add("show");
    return;
  }
  const btn = ev.target.querySelector("button[type=submit]");
  btn.disabled = true; btn.textContent = "Salvando...";
  try {
    const arquivoFoto = state.fotoPerfilRecortada || document.getElementById("ep-foto").files[0];
    const novaFoto = await uploadArquivo(arquivoFoto, "membros");
    const foto_url = novaFoto || state.membro.foto_url || null;
    const { error } = await sb.from("igr_membros").update({
      nome_completo, telefone, email, data_nascimento, endereco, interesses, profissao, foto_url,
      batizado, data_batismo, pastor_batismo, perfil_completo: true,
    }).eq("id", state.membro.id);
    if (error) {
      errEl.textContent = error.code === "23505" ? "Esse telefone já está em uso por outro cadastro." : "Não deu pra salvar: " + error.message;
      errEl.classList.add("show");
      return;
    }

    const atuais = state.parentesSelecionadosPerfil || [];
    const originais = state.parentesOriginaisPerfil || [];
    const adicionados = atuais.filter(id => !originais.includes(id));
    const removidos = originais.filter(id => !atuais.includes(id));
    if (adicionados.length) await salvarVinculosParentes(state.membro.id, adicionados);
    if (removidos.length) await removerVinculosParentes(state.membro.id, removidos);

    Object.assign(state.membro, { nome_completo, telefone, email, data_nascimento, endereco, interesses, profissao, foto_url, batizado, data_batismo, pastor_batismo, perfil_completo: true });
    localStorage.setItem("igr_membro", JSON.stringify(state.membro));
    document.getElementById("perfil-lembrete-box").style.display = "none";
    alert("Perfil atualizado com sucesso 💛");
    mostrarTela("tela-membro-home");
    montarHomeMembro();
  } catch (e) {
    console.error("Erro ao salvar perfil:", e);
    errEl.textContent = "Não deu pra salvar agora. Verifique sua conexão e tente de novo.";
    errEl.classList.add("show");
  } finally {
    btn.disabled = false; btn.textContent = "Salvar alterações";
  }
}

async function enviarTrocarSenha(ev) {
  ev.preventDefault();
  const novaSenha = document.getElementById("ep-nova-senha").value;
  const confirmar = document.getElementById("ep-nova-senha-confirmar").value;
  const errEl = document.getElementById("ep-senha-erro");
  errEl.classList.remove("show");

  if (!/^\d{4}$/.test(novaSenha)) {
    errEl.textContent = "Digite uma senha de 4 números.";
    errEl.classList.add("show");
    return;
  }
  if (novaSenha !== confirmar) {
    errEl.textContent = "As senhas não coincidem.";
    errEl.classList.add("show");
    return;
  }
  const btn = ev.target.querySelector("button[type=submit]");
  btn.disabled = true; btn.textContent = "Salvando...";
  try {
    const pin_hash = await sha256(novaSenha + ":" + state.membro.telefone);
    const { error } = await sb.from("igr_membros").update({ pin_hash }).eq("id", state.membro.id);
    if (error) { errEl.textContent = "Não deu pra trocar a senha: " + error.message; errEl.classList.add("show"); return; }
    ev.target.reset();
    document.querySelectorAll('#form-trocar-senha .pin-box').forEach(b => b.value = "");
    alert("Senha alterada com sucesso 💛");
    document.getElementById("form-trocar-senha").style.display = "none";
  } catch (e) {
    console.error("Erro ao trocar senha:", e);
    errEl.textContent = "Não deu pra trocar agora. Verifique sua conexão e tente de novo.";
    errEl.classList.add("show");
  } finally {
    btn.disabled = false; btn.textContent = "Trocar senha";
  }
}

// ---------- busca de parentes (autocomplete) ----------
const GRAUS_PARENTESCO = ["Cônjuge", "Pai", "Mãe", "Filho(a)", "Irmão(ã)", "Avô/Avó", "Neto(a)", "Tio(a)", "Sobrinho(a)", "Primo(a)", "Outro"];

function configurarBuscaParentes(inputId, sugestoesId, pillsContainerId, selecionadosKey) {
  const input = document.getElementById(inputId);
  const sugestoesEl = document.getElementById(sugestoesId);
  if (!input) return;
  state[selecionadosKey] = state[selecionadosKey] || [];
  state.parentescosPorId = state.parentescosPorId || {};

  let timeoutId = null;
  input.addEventListener("input", () => {
    clearTimeout(timeoutId);
    const termo = input.value.trim();
    if (termo.length < 2) { sugestoesEl.style.display = "none"; return; }
    timeoutId = setTimeout(async () => {
      const { data } = await sb.from("igr_membros").select("id, nome_completo")
        .eq("igreja_id", state.igreja.id).ilike("nome_completo", `%${termo}%`).limit(6);
      const resultados = (data || []).filter(m => !state[selecionadosKey].includes(m.id) && m.id !== state.membro?.id);
      sugestoesEl.innerHTML = resultados.map(m => `<div class="autocomplete-item" data-id="${m.id}" data-nome="${m.nome_completo}">${m.nome_completo}</div>`).join("");
      sugestoesEl.style.display = resultados.length ? "block" : "none";
      sugestoesEl.querySelectorAll("[data-id]").forEach(item => {
        item.addEventListener("click", () => {
          state[selecionadosKey].push(item.dataset.id);
          state.nomesParentesCache = state.nomesParentesCache || {};
          state.nomesParentesCache[item.dataset.id] = item.dataset.nome;
          renderPillsParentes(pillsContainerId, selecionadosKey, inputId, sugestoesId);
          input.value = "";
          sugestoesEl.style.display = "none";
          // permite adicionar mais um em seguida, sem precisar reabrir nada
          input.focus();
        });
      });
    }, 300);
  });
  document.addEventListener("click", (ev) => {
    if (!sugestoesEl.contains(ev.target) && ev.target !== input) sugestoesEl.style.display = "none";
  });
}
function renderPillsParentes(pillsContainerId, selecionadosKey, inputId, sugestoesId) {
  const container = document.getElementById(pillsContainerId);
  state.parentescosPorId = state.parentescosPorId || {};
  container.innerHTML = (state[selecionadosKey] || []).map(id => {
    const nome = state.nomesParentesCache?.[id] || "…";
    const atual = state.parentescosPorId[id] || "";
    return `
      <div class="parente-linha">
        <b>${nome}</b>
        <select data-grau-parente="${id}">
          <option value="">Grau de parentesco</option>
          ${GRAUS_PARENTESCO.map(g => `<option value="${g}" ${atual === g ? "selected" : ""}>${g}</option>`).join("")}
        </select>
        <button type="button" data-remover-parente="${id}">✕</button>
      </div>`;
  }).join("") || "";
  container.querySelectorAll("[data-remover-parente]").forEach(b => {
    b.addEventListener("click", () => {
      state[selecionadosKey] = state[selecionadosKey].filter(id => id !== b.dataset.removerParente);
      renderPillsParentes(pillsContainerId, selecionadosKey, inputId, sugestoesId);
    });
  });
  container.querySelectorAll("[data-grau-parente]").forEach(sel => {
    sel.addEventListener("change", () => { state.parentescosPorId[sel.dataset.grauParente] = sel.value; });
  });
}

// ---------- login de membro ----------
async function enviarLoginTelefone(ev) {
  ev.preventDefault();
  const telefone = limparTelefone(document.getElementById("login-telefone").value);
  if (!telefone) return;
  if (!state.igreja) { document.getElementById("login-erro-tel").textContent = "Ainda carregando os dados da igreja. Tente de novo em instantes."; document.getElementById("login-erro-tel").classList.add("show"); return; }
  const { data } = await sb.from("igr_membros").select("id").eq("igreja_id", state.igreja.id).eq("telefone", telefone).maybeSingle();
  const errEl = document.getElementById("login-erro-tel");
  errEl.classList.remove("show");
  if (!data) {
    errEl.textContent = "Não achamos esse telefone. Quer se cadastrar?";
    errEl.classList.add("show");
    return;
  }
  document.getElementById("login-passo-telefone").style.display = "none";
  document.getElementById("login-passo-pin").style.display = "block";
  document.getElementById("login-form-pin").dataset.telefone = telefone;
  document.querySelector('[data-pin-group="login-senha"] .pin-box')?.focus();
}

async function enviarLoginPin(ev) {
  ev.preventDefault();
  const telefone = ev.target.dataset.telefone;
  const pin = document.getElementById("login-senha").value.trim();
  const errEl = document.getElementById("login-erro-pin");
  errEl.classList.remove("show");
  if (!/^\d{4}$/.test(pin)) return;

  const pin_hash = await sha256(pin + ":" + telefone);
  const { data, error } = await sb.from("igr_membros").select("*")
    .eq("igreja_id", state.igreja.id).eq("telefone", telefone).eq("pin_hash", pin_hash).maybeSingle();

  if (error || !data) {
    errEl.textContent = "Senha incorreta. Tente de novo.";
    errEl.classList.add("show");
    const grupo = document.querySelector('[data-pin-group="login-senha"]');
    grupo.querySelectorAll(".pin-box").forEach(b => b.value = "");
    document.getElementById("login-senha").value = "";
    grupo.querySelector(".pin-box").focus();
    return;
  }
  sb.from("igr_membros").update({ ultimo_acesso: new Date().toISOString() }).eq("id", data.id).then(() => {});
  entrarComoMembro(data);
}

function entrarComoMembro(membro) {
  state.membro = membro;
  localStorage.setItem("igr_membro", JSON.stringify(membro));
  atualizarVisibilidadeLouvor();
  if (state.eventoAtual && document.getElementById("evento-card-login-necessario").style.display === "block") {
    abrirEventoDetalhe(state.eventoAtual.id).then(() => escolherSouMembro());
    return;
  }
  montarHomeMembro();
  mostrarTela("tela-membro-home");
}

function atualizarVisibilidadeLouvor() {
  const grupo = state.grupos.find(g => g.id === state.membro?.grupo_id);
  const ehLouvor = !!(grupo && /louvor/i.test(grupo.nome || ""));
  document.querySelectorAll("[data-louvor-only]").forEach(el => {
    el.style.display = ehLouvor ? "flex" : "none";
  });
}

function sair() {
  state.membro = null;
  localStorage.removeItem("igr_membro");
  mostrarTela("tela-visitante");
}

// ---------- home do membro ----------
async function montarHomeMembro() {
  const m = state.membro;
  const primeiroNome = m.nome_completo.split(" ")[0];
  const hora = new Date().getHours();
  const saudacao = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
  document.getElementById("home-saudacao").textContent = `${saudacao}, ${primeiroNome} 👋`;

  // devocional de hoje — gerado inteiramente pela IA, conforme o temperamento da pessoa
  document.getElementById("home-devo-titulo").textContent = "Seu devocional de hoje";
  document.getElementById("home-devo-resumo").textContent = "Preparando algo especial pra você...";
  document.getElementById("btn-ler-devocional").onclick = () => abrirDevocional();
  gerarDevocionalDoDia().then(d => {
    state.devocionalGerado = d;
    if (!d) { document.getElementById("home-devo-resumo").textContent = "Não deu pra preparar seu devocional agora. Tente de novo em instantes."; return; }
    document.getElementById("home-devo-titulo").textContent = `${saudacao}, ${primeiroNome}!`;
    const textoBase = d.texto || "";
    document.getElementById("home-devo-resumo").textContent = textoBase.slice(0, 110) + (textoBase.length > 110 ? "..." : "");
  });

  configurarCheckinDiario();
  configurarCaixaPush();

  const lembreteBox = document.getElementById("perfil-lembrete-box");
  if (lembreteBox) {
    const perfilIncompleto = !m.perfil_completo || !m.endereco || !m.interesses?.length;
    lembreteBox.style.display = perfilIncompleto ? "flex" : "none";
    lembreteBox.onclick = () => abrirEditarPerfil();
  }

  // acesso ao painel administrativo (concedido pelo admin master) — mesmo login do membro, sem senha separada
  const btnPainelMidia = document.getElementById("btn-painel-midia");
  const temAcessoPainel = (m.papeis_especiais || []).length > 0;
  if (btnPainelMidia) {
    btnPainelMidia.style.display = temAcessoPainel ? "block" : "none";
    btnPainelMidia.onclick = () => abrirPainelEspecial(m.papeis_especiais || []);
  }

  const quicklinkCelula = document.getElementById("quicklink-celula");
  if (quicklinkCelula) {
    let minhaCelula = null;
    if (m.celula_id) {
      const { data } = await sb.from("igr_celulas").select("id, tipo").eq("id", m.celula_id).maybeSingle();
      minhaCelula = data;
    }
    if (!minhaCelula) {
      const { data } = await sb.from("igr_celulas").select("id, tipo").eq("monitor_membro_id", m.id).limit(1).maybeSingle();
      minhaCelula = data;
    }
    if (minhaCelula) {
      state.minhaCelulaId = minhaCelula.id;
      quicklinkCelula.style.display = "flex";
      document.getElementById("quicklink-celula-texto").textContent = `Meu(a) ${minhaCelula.tipo || "Célula"}`;
    } else {
      state.minhaCelulaId = null;
      quicklinkCelula.style.display = "none";
    }
  }
  const avisoNovoBox = document.getElementById("acesso-novo-box");
  if (avisoNovoBox) {
    if (m.papeis_especiais_novo && (m.papeis_especiais || []).length) {
      document.getElementById("acesso-novo-texto").textContent =
        `Você agora tem acesso a: ${(m.papeis_especiais || []).map(p => SECOES_ADMIN_INFO[p] || p).join(", ")}. Toque pra ver.`;
      avisoNovoBox.style.display = "flex";
      avisoNovoBox.onclick = async () => {
        avisoNovoBox.style.display = "none";
        m.papeis_especiais_novo = false;
        await sb.from("igr_membros").update({ papeis_especiais_novo: false }).eq("id", m.id);
        if (temAcessoPainel) abrirPainelEspecial(m.papeis_especiais || []);
      };
    } else {
      avisoNovoBox.style.display = "none";
    }
  }

  const btnMeuGrupo = document.getElementById("btn-meu-grupo");
  if (btnMeuGrupo) {
    if (m.grupo_id) {
      btnMeuGrupo.style.display = "block";
      btnMeuGrupo.onclick = () => abrirGrupoDetalhe(m.grupo_id);
    } else {
      btnMeuGrupo.style.display = "none";
    }
  }

  // aniversariantes do mês
  const mesAtual = new Date().getMonth() + 1;
  const { data: membros } = await sb.from("igr_membros").select("id,nome_completo,data_nascimento,telefone,foto_url")
    .eq("igreja_id", state.igreja.id).not("data_nascimento", "is", null);
  const aniversariantes = (membros || [])
    .filter(x => x.data_nascimento && (new Date(x.data_nascimento + "T00:00:00").getMonth() + 1) === mesAtual)
    .sort((a, b) => new Date(a.data_nascimento).getDate() - new Date(b.data_nascimento).getDate());
  const bdayEl = document.getElementById("home-aniversariantes");
  const MESES_ABREV = ["JAN","FEV","MAR","ABR","MAI","JUN","JUL","AGO","SET","OUT","NOV","DEZ"];
  bdayEl.innerHTML = aniversariantes.map(a => {
    const dataObj = new Date(a.data_nascimento + "T00:00:00");
    const dia = dataObj.getDate();
    const mesAbrev = MESES_ABREV[dataObj.getMonth()];
    const primeiro = a.nome_completo.split(" ")[0];
    const foto = a.foto_url
      ? `<img src="${a.foto_url}" class="bday-foto" alt="">`
      : avatarIniciais(a.nome_completo);
    return `<div class="bday" data-aniv-id="${a.id}" style="cursor:pointer;">
      <div class="circle">${foto}</div>
      <b class="bday-nome">${primeiro}</b>
      <span class="bday-data">${dia} ${mesAbrev}</span>
    </div>`;
  }).join("") || `<div class="empty" style="padding:14px;">Ninguém faz aniversário este mês.</div>`;

  bdayEl.querySelectorAll("[data-aniv-id]").forEach(el => {
    const pessoa = aniversariantes.find(x => x.id === el.dataset.anivId);
    el.addEventListener("click", () => abrirModalAniversariante(pessoa));
  });

  await carregarAvisos("home-avisos");
  await carregarPedidosOracao();

  const btnAvisoLider = document.getElementById("btn-abrir-aviso-lider");
  if (btnAvisoLider) btnAvisoLider.style.display = m.eh_lider ? "block" : "none";
  const btnBannerLider = document.getElementById("btn-abrir-banner-lider");
  if (btnBannerLider) btnBannerLider.style.display = m.eh_lider ? "block" : "none";
  const liderVisitantesBox = document.getElementById("lider-visitantes-box");
  if (liderVisitantesBox) {
    liderVisitantesBox.style.display = m.eh_lider ? "block" : "none";
    if (m.eh_lider) await carregarVisitantesLider();
  }
}

async function carregarVisitantesLider() {
  const { data } = await sb.from("igr_visitantes").select("*, igr_grupos(nome)")
    .eq("grupo_id", state.membro.grupo_id).order("created_at", { ascending: false }).limit(15);
  const el = document.getElementById("lider-visitantes-lista");
  const nomeLider = (state.membro.nome_completo || "").split(" ")[0];
  el.innerHTML = (data || []).map(v => {
    const idade = v.data_nascimento ? calcularIdade(v.data_nascimento) : null;
    const nomeGrupo = v.igr_grupos?.nome || "nossa igreja";
    const msg = `Oi ${v.nome.split(" ")[0]}! Aqui é ${nomeLider}, do ${nomeGrupo} da ${state.igreja.nome}. Que alegria que você nos visitou! 💛`;
    return `
    <div class="card">
      <div class="row-avatar">
        ${avatarIniciais(v.nome)}
        <div class="row-info"><b>${v.nome}${idade ? " · " + idade + " anos" : ""}</b><span>${tempoRelativo(v.created_at)}${v.contatado ? " · já contatado" : ""}</span></div>
      </div>
      <div style="display:flex;gap:8px;margin-top:10px;">
        <a class="btn btn-primary" style="width:auto;padding:9px 16px;font-size:12.5px;" href="${linkWhatsapp(v.telefone, msg)}" target="_blank" rel="noopener">Chamar no WhatsApp</a>
        ${!v.contatado ? `<button class="btn btn-ghost" style="width:auto;padding:9px 16px;font-size:12.5px;" data-marcar-contatado="${v.id}">Marcar contatado</button>` : ""}
      </div>
    </div>`;
  }).join("") || `<div class="empty">Nenhum visitante novo por aqui ainda.</div>`;

  el.querySelectorAll("[data-marcar-contatado]").forEach(btn => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      await sb.from("igr_visitantes").update({ contatado: true }).eq("id", btn.dataset.marcarContatado);
      await carregarVisitantesLider();
    });
  });
}

async function enviarAvisoLider(ev) {
  ev.preventDefault();
  const titulo = document.getElementById("lider-aviso-titulo").value.trim();
  const texto = document.getElementById("lider-aviso-texto").value.trim();
  if (!titulo) return;
  const btn = document.getElementById("btn-lider-postar");
  btn.disabled = true; btn.textContent = "Publicando...";
  try {
    const arquivo = document.getElementById("lider-aviso-imagem").files[0];
    const arquivoVideo = document.getElementById("lider-aviso-video").files[0];
    const imagem_url = await uploadArquivo(arquivo, "avisos");
    const video_url = await uploadArquivo(arquivoVideo, "avisos");
    const { error } = await sb.from("igr_avisos").insert({
      igreja_id: state.igreja.id, titulo, texto, imagem_url, video_url,
      grupo_id: state.membro.grupo_id, criado_por_membro_id: state.membro.id,
    });
    if (error) { alert("Não deu pra publicar agora. Tente de novo."); return; }
    document.getElementById("lider-aviso-titulo").value = "";
    document.getElementById("lider-aviso-texto").value = "";
    document.getElementById("lider-aviso-imagem").value = "";
    document.getElementById("lider-aviso-video").value = "";
    await carregarAvisos("home-avisos");
    enviarPush({ tipo: "grupo", grupo_id: state.membro.grupo_id }, titulo, texto);
  } catch (e) {
    console.error("Erro ao publicar aviso do líder:", e);
    alert("Não deu pra publicar agora. Verifique sua conexão.");
  } finally {
    btn.disabled = false; btn.textContent = "Publicar para o grupo";
  }
}

async function carregarPedidosOracao() {
  const { data } = await sb.from("igr_pedidos_oracao").select("*")
    .eq("membro_id", state.membro.id).order("created_at", { ascending: false });
  const el = document.getElementById("lista-pedidos-oracao");
  el.innerHTML = (data || []).map(p => `
    <div class="prayer-item">
      <div><p>${p.texto}</p><span>${tempoRelativo(p.created_at)}</span></div>
      <span class="status-pill ${p.status}">${p.status === "novo" ? "Novo" : p.status === "orando" ? "Orando" : "Respondido"}</span>
    </div>
  `).join("") || `<p class="hint">Você ainda não enviou nenhum pedido de oração.</p>`;
}

async function enviarPedidoOracao(ev) {
  ev.preventDefault();
  const texto = document.getElementById("novo-pedido-texto").value.trim();
  if (!texto) return;
  const btn = document.getElementById("btn-enviar-pedido");
  btn.disabled = true; btn.textContent = "Enviando...";
  try {
    const { error } = await sb.from("igr_pedidos_oracao").insert({ igreja_id: state.igreja.id, membro_id: state.membro.id, texto });
    if (error) { alert("Não deu pra enviar o pedido: " + error.message); return; }
    document.getElementById("novo-pedido-texto").value = "";
    await carregarPedidosOracao();
    if (state.membro.grupo_id) {
      const { data: lideres } = await sb.from("igr_membros").select("id")
        .eq("grupo_id", state.membro.grupo_id).eq("eh_lider", true);
      if (lideres && lideres.length) {
        enviarPush({ tipo: "membros", membro_ids: lideres.map(l => l.id) },
          "Novo pedido de oração 🙏", `${state.membro.nome_completo.split(" ")[0]} enviou um pedido de oração.`);
      }
    }
  } catch (e) {
    console.error("Erro ao enviar pedido de oração:", e);
    alert("Não deu pra enviar agora. Verifique sua conexão e tente de novo.");
  } finally {
    btn.disabled = false; btn.textContent = "Enviar pedido";
  }
}

async function gerarDevocionalDoDia() {
  if (!state.membro) return null;
  try {
    const { data, error } = await sb.functions.invoke("igr-personalizar-devocional", {
      body: { membro_id: state.membro.id },
    });
    if (error || !data?.ok) { console.error("Erro ao gerar devocional:", error || data); return null; }
    return data;
  } catch (e) {
    console.error("Erro ao gerar devocional:", e);
    return null;
  }
}

function abrirDevocional() {
  const d = state.devocionalGerado;
  if (!d) return;
  const hora = new Date().getHours();
  const saudacaoAgora = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
  const primeiroNome = state.membro?.nome_completo?.split(" ")[0] || "";
  document.getElementById("devo-titulo-detalhe").textContent = `${saudacaoAgora}, ${primeiroNome}!`;
  document.getElementById("devo-tema-detalhe").textContent = d.titulo || "";
  document.getElementById("devo-versiculo").textContent = `"${d.versiculo || ""}"`;
  document.getElementById("devo-referencia").textContent = d.referencia || "";
  document.getElementById("devo-texto-completo").textContent = d.texto || "";
  mostrarTela("tela-devocional-detalhe");
  configurarReacoesDevocional();
}

async function configurarReacoesDevocional() {
  const msgEl = document.getElementById("devo-reacao-msg");
  msgEl.style.display = "none";
  const botoes = document.querySelectorAll("#devo-reacoes .reacao-btn");
  botoes.forEach(b => b.classList.remove("on"));
  const hoje = new Date().toISOString().slice(0, 10);

  if (state.membro) {
    const { data: atual } = await sb.from("igr_devocional_reacoes").select("reacao")
      .eq("membro_id", state.membro.id).eq("devocional_id", `dia-${hoje}`).maybeSingle();
    if (atual) {
      document.querySelector(`#devo-reacoes .reacao-btn[data-reacao="${atual.reacao}"]`)?.classList.add("on");
    }
  }

  botoes.forEach(btn => {
    btn.onclick = async () => {
      if (!state.membro) return;
      botoes.forEach(b => b.classList.remove("on"));
      btn.classList.add("on");
      await sb.from("igr_devocional_reacoes")
        .upsert({ membro_id: state.membro.id, devocional_id: `dia-${hoje}`, reacao: btn.dataset.reacao }, { onConflict: "membro_id,devocional_id" });
      msgEl.textContent = "Obrigado por compartilhar 💛";
      msgEl.style.display = "block";
    };
  });
}

// ---------- check-in diário de humor ----------
const HUMOR_LABELS = {
  grato: "grato(a)", esperancoso: "esperançoso(a)", em_paz: "em paz",
  fortalecido: "fortalecido(a)", cansado: "cansado(a)", ansioso: "ansioso(a)",
};

async function configurarCheckinDiario() {
  const box = document.getElementById("checkin-diario-box");
  if (!box || !state.membro) return;
  const hoje = new Date().toISOString().slice(0, 10);
  const { data: existente } = await sb.from("igr_checkins_diarios").select("humor")
    .eq("membro_id", state.membro.id).eq("data", hoje).maybeSingle();

  if (existente) {
    // já respondeu hoje — não mostra de novo, só volta amanhã
    box.style.display = "none";
    return;
  }
  box.style.display = "block";
  const { data: anterior } = await sb.from("igr_checkins_diarios").select("humor, data")
    .eq("membro_id", state.membro.id).lt("data", hoje).order("data", { ascending: false }).limit(1).maybeSingle();
  const primeiroNome = state.membro?.nome_completo?.split(" ")[0] || "";
  box.querySelector(".checkin-pergunta").textContent = anterior
    ? `${primeiroNome}, da última vez você disse que estava ${HUMOR_LABELS[anterior.humor] || anterior.humor}. Como você está hoje?`
    : "Como você está hoje?";
  const botoes = box.querySelectorAll(".reacao-btn");
  botoes.forEach(b => b.classList.remove("on"));

  botoes.forEach(btn => {
    btn.onclick = async () => {
      botoes.forEach(b => { b.classList.remove("on"); b.disabled = true; });
      btn.classList.add("on");
      await sb.from("igr_checkins_diarios")
        .upsert({ membro_id: state.membro.id, humor: btn.dataset.reacao, data: hoje }, { onConflict: "membro_id,data" });
      box.querySelector(".checkin-pergunta").textContent = "Obrigado! Isso ajuda a personalizar seu devocional 💛";
      setTimeout(() => { box.style.display = "none"; }, 1400);
    };
  });
}

// ---------- estudos / pastor / história ----------
async function carregarEsbocos() {
  const { data } = await sb.from("igr_esbocos").select("*").eq("igreja_id", state.igreja.id).order("created_at", { ascending: false });
  const el = document.getElementById("lista-esbocos");
  el.innerHTML = (data || []).map(e => `
    <div class="card">
      ${e.capa_url ? `<img class="capa-thumb" src="${e.capa_url}" alt="" ${e.arquivo_url ? `onclick="window.open('${e.arquivo_url}','_blank')"` : ""}>` : ""}
      <div class="lesson">
        ${!e.capa_url ? `<div class="thumb warm"><svg class="icon"><use href="#i-file"/></svg></div>` : ""}
        <div class="meta"><h3>${e.titulo}</h3><span class="hint">${e.autor || ""}</span></div>
      </div>
      ${e.arquivo_url ? `
        <div class="card-actions-row">
          <a class="btn btn-primary" style="width:auto;padding:8px 14px;font-size:12px;" href="${e.arquivo_url}" target="_blank" rel="noopener">Ler</a>
          <a class="btn btn-ghost" style="width:auto;padding:8px 14px;font-size:12px;" href="${e.arquivo_url}" download>Baixar</a>
        </div>` : ""}
    </div>
  `).join("") || `<div class="empty">Nenhum esboço publicado ainda.</div>`;
}

// ---------- ministério de louvor ----------
async function carregarLouvor() {
  const hoje = new Date().toISOString().slice(0, 10);
  const { data: escalas } = await sb.from("igr_louvor_escalas").select("*")
    .eq("igreja_id", state.igreja.id).gte("data", hoje).order("data", { ascending: true }).limit(1);
  const escala = (escalas || [])[0];
  state.louvorEscalaAtualId = escala?.id || null;

  const gerBox = document.getElementById("louvor-gerenciar-box");
  const podeGerenciarLouvor = state.membro?.eh_lider && (state.membro?.permissoes || []).includes("gerenciar_louvor");
  if (gerBox) gerBox.style.display = podeGerenciarLouvor ? "block" : "none";
  if (podeGerenciarLouvor) await carregarMembrosGrupoLouvor();

  const escalaEl = document.getElementById("louvor-escala");
  const musicasEl = document.getElementById("louvor-musicas");

  if (!escala) {
    escalaEl.innerHTML = `<div class="empty">Nenhuma escala publicada ainda.</div>`;
    musicasEl.innerHTML = "";
  } else {
    const [{ data: participantes }, { data: musicas }] = await Promise.all([
      sb.from("igr_louvor_participantes").select("*").eq("escala_id", escala.id).order("created_at"),
      sb.from("igr_louvor_musicas").select("*").eq("escala_id", escala.id).order("ordem"),
    ]);
    const dataFmt = formatarData(escala.data);
    escalaEl.innerHTML = `
      <div class="card">
        <h3>${escala.culto_titulo || "Culto"} · ${dataFmt}</h3>
        ${escala.observacoes ? `<p style="margin-bottom:8px;">${escala.observacoes}</p>` : ""}
        ${(participantes || []).map(p => `
          <div class="row-avatar" style="padding:9px 0;border-top:1px solid var(--line);">
            ${avatarIniciais(p.nome)}
            <div class="row-info"><b>${p.nome}</b><span>${p.funcao || ""}</span></div>
          </div>
        `).join("") || `<p class="hint">Ninguém escalado ainda.</p>`}
        ${escala.criado_por ? `<p class="hint" style="margin-top:10px;border-top:1px solid var(--line);padding-top:8px;">Escala organizada por <b style="color:var(--ink);">${escala.criado_por}</b></p>` : ""}
        <button class="btn btn-ghost" style="width:auto;padding:8px 14px;font-size:12px;margin-top:10px;" id="btn-agenda-escala">📅 Adicionar à agenda</button>
      </div>`;
    document.getElementById("btn-agenda-escala")?.addEventListener("click", () => {
      adicionarEventoAgenda(escala.culto_titulo || "Culto", escala.data, "19:00", "", escala.observacoes);
    });
    musicasEl.innerHTML = (musicas || []).map(m => `
      <div class="card">
        <h3>${m.titulo}</h3>
        <p>${m.artista || ""}${m.tom ? " · Tom: " + m.tom : ""}</p>
        <div class="card-actions-row">
          ${m.link ? `<a class="btn btn-ghost" style="width:auto;padding:8px 14px;font-size:12px;" href="${m.link}" target="_blank" rel="noopener">Ver cifra</a>` : ""}
          ${m.link_youtube ? `<a class="btn btn-primary" style="width:auto;padding:8px 14px;font-size:12px;" href="${m.link_youtube}" target="_blank" rel="noopener">▶ YouTube</a>` : ""}
        </div>
      </div>
    `).join("") || `<div class="empty">Repertório ainda não publicado.</div>`;
  }

  const { data: eventos } = await sb.from("igr_louvor_eventos").select("*")
    .eq("igreja_id", state.igreja.id).gte("data", hoje).order("data", { ascending: true });
  const eventosEl = document.getElementById("louvor-eventos");
  eventosEl.innerHTML = (eventos || []).map(ev => `
    <div class="card row-avatar">
      ${seloData(ev.data)}
      <div class="row-info">
        <b>${ev.titulo}</b>
        <span>${ev.horario ? ev.horario : ""}${ev.local ? " · " + ev.local : ""}</span>
        ${ev.descricao ? `<p style="margin:4px 0 0;font-size:12.5px;color:var(--ink-soft);">${ev.descricao}</p>` : ""}
        <button class="btn btn-ghost" style="width:auto;padding:7px 12px;font-size:11.5px;margin-top:8px;" data-add-agenda-evento="${ev.id}">📅 Adicionar à agenda</button>
      </div>
    </div>
  `).join("") || `<div class="empty">Nenhum ensaio ou evento agendado.</div>`;
  eventosEl.querySelectorAll("[data-add-agenda-evento]").forEach(btn => {
    const ev = (eventos || []).find(x => x.id === btn.dataset.addAgendaEvento);
    if (ev) btn.addEventListener("click", () => adicionarEventoAgenda(ev.titulo, ev.data, ev.horario, ev.local, ev.descricao));
  });
}

async function carregarMensagensPastor() {
  const { data } = await sb.from("igr_mensagens_pastor").select("*").eq("igreja_id", state.igreja.id).order("publicado_em", { ascending: false });
  const el = document.getElementById("lista-mensagens-pastor");
  if (!data || !data.length) { el.innerHTML = `<div class="empty">Nenhuma mensagem publicada ainda.</div>`; return; }
  const [primeira, ...resto] = data;
  el.innerHTML = `
    <div class="card">
      ${primeira.capa_url ? `<img class="capa-thumb" src="${primeira.capa_url}" alt="" ${primeira.video_url ? `onclick="window.open('${primeira.video_url}','_blank')"` : ""}>` : ""}
      <span class="badge-inline">${primeira.autor || ""}</span>
      <h3 style="margin:6px 0 4px;">${primeira.titulo}</h3><p style="margin:0;font-size:13px;color:var(--ink-soft);">${primeira.resumo || ""}</p>
      ${primeira.video_url ? `<a class="btn btn-primary" style="width:auto;padding:8px 14px;font-size:12px;margin-top:10px;" href="${primeira.video_url}" target="_blank" rel="noopener">Assistir</a>` : ""}
    </div>
    ${resto.length ? `<div class="section-label"><b>Mensagens anteriores</b></div>` : ""}
    ${resto.map(m => `
      <div class="card"><div class="lesson">
        ${m.capa_url ? `<img class="capa-thumb" style="width:52px;height:52px;flex:none;margin:0;" src="${m.capa_url}" alt="">` : `<div class="thumb"><svg class="icon"><use href="#i-play"/></svg></div>`}
        <div class="meta"><h3>${m.titulo}</h3><span class="hint">${m.duracao_min ? m.duracao_min + " min" : ""}</span></div>
      </div></div>
    `).join("")}
  `;
}

// ---------- tela de contatos ----------
function montarItensContato() {
  const ig = state.igreja || {};
  const itens = [];

  if (ig.endereco) {
    const q = encodeURIComponent(ig.endereco);
    itens.push(`
      <a class="contato-item" href="https://www.google.com/maps/search/?api=1&query=${q}" target="_blank" rel="noopener">
        <span class="ic"><svg class="icon"><use href="#i-mappin"/></svg></span>
        <div class="txt"><b>Endereço</b><span>${ig.endereco}</span></div>
      </a>
      <div class="contato-sub-links" style="margin:-4px 0 14px;">
        <a href="https://www.google.com/maps/search/?api=1&query=${q}" target="_blank" rel="noopener">📍 Google Maps</a>
        <a href="https://waze.com/ul?q=${q}&navigate=yes" target="_blank" rel="noopener">🚗 Waze</a>
      </div>`);
  }
  if (ig.whatsapp_contato) {
    itens.push(`
      <a class="contato-item" href="https://wa.me/${limparTelefone(ig.whatsapp_contato)}" target="_blank" rel="noopener">
        <span class="ic"><svg class="icon"><use href="#i-whatsapp"/></svg></span>
        <div class="txt"><b>WhatsApp</b><span>${ig.whatsapp_contato}</span></div>
      </a>`);
  }
  if (ig.instagram_url) {
    itens.push(`
      <a class="contato-item" href="${ig.instagram_url}" target="_blank" rel="noopener">
        <span class="ic"><svg class="icon"><use href="#i-instagram"/></svg></span>
        <div class="txt"><b>Instagram</b><span>Segue a gente lá</span></div>
      </a>`);
  }
  if (ig.facebook_url) {
    itens.push(`
      <a class="contato-item" href="${ig.facebook_url}" target="_blank" rel="noopener">
        <span class="ic"><svg class="icon"><use href="#i-facebook"/></svg></span>
        <div class="txt"><b>Facebook</b><span>Curte nossa página</span></div>
      </a>`);
  }
  return itens;
}

function carregarContatos() {
  const itens = montarItensContato();
  document.getElementById("lista-contatos").innerHTML = itens.join("") ||
    `<div class="empty">Nenhum contato cadastrado ainda.</div>`;
}

// ---------- tela sobre a igreja ----------
// ---------- grupos e departamentos ----------
async function carregarGruposLista() {
  const { data } = await sb.from("igr_grupos").select("*").eq("igreja_id", state.igreja.id).order("nome");
  state.gruposListaCache = data || [];
  const grupos = (data || []).filter(g => g.tipo === "grupo");
  const deptos = (data || []).filter(g => g.tipo === "departamento");
  const render = g => `
    <div class="album-card" data-grupo="${g.id}">
      <img src="${g.capa_url || "assets/logo.png"}" alt="">
      <div class="info"><b>${g.nome}</b><span>${g.encontro_info || ""}</span></div>
    </div>`;
  document.getElementById("lista-grupos-tipo-grupo").innerHTML = grupos.map(render).join("") || `<div class="empty">Nenhum grupo cadastrado.</div>`;
  document.getElementById("lista-grupos-tipo-departamento").innerHTML = deptos.map(render).join("") || `<div class="empty">Nenhum departamento cadastrado.</div>`;
  document.querySelectorAll("#tela-grupos-lista [data-grupo]").forEach(card => {
    card.addEventListener("click", () => abrirGrupoDetalhe(card.dataset.grupo));
  });
}

function abrirGrupoDetalhe(grupoId) {
  const grupo = (state.gruposListaCache || state.grupos || []).find(g => g.id === grupoId);
  if (!grupo) return;
  // Louvor tem tela própria, mais completa (escala, repertório etc.)
  if (/louvor/i.test(grupo.nome || "")) { mostrarTela("tela-membro-louvor"); return; }

  state.grupoDetalheAtual = grupo;
  const capaEl = document.getElementById("grupo-detalhe-capa");
  if (grupo.capa_url) { capaEl.src = grupo.capa_url; capaEl.style.display = "block"; } else { capaEl.style.display = "none"; }
  document.getElementById("grupo-detalhe-nome").textContent = grupo.nome;
  document.getElementById("grupo-detalhe-descricao").textContent = grupo.descricao || "Ainda não há uma descrição desse grupo.";

  const souLiderDesseGrupo = state.membro?.eh_lider && state.membro?.grupo_id === grupo.id;
  const gerBox = document.getElementById("grupo-detalhe-gerenciar");
  gerBox.style.display = souLiderDesseGrupo ? "block" : "none";
  if (souLiderDesseGrupo) {
    const permissoes = state.membro.permissoes || [];
    document.getElementById("grupo-bloco-editar-info").style.display = permissoes.includes("editar_grupo") ? "block" : "none";
    document.getElementById("grupo-bloco-avisos").style.display = permissoes.includes("postar_avisos") ? "block" : "none";
    document.getElementById("grupo-bloco-oracao").style.display = permissoes.includes("gerenciar_oracao") ? "block" : "none";
    document.getElementById("gi-descricao").value = grupo.descricao || "";
    if (permissoes.includes("gerenciar_oracao")) carregarOracaoDoGrupo(grupo.id);
    carregarCelulasDoGrupo(grupo.id, "");
  }

  mostrarTela("tela-grupo-detalhe");
  carregarAvisosDoGrupoDetalhe(grupo.id);
}

async function carregarOracaoDoGrupo(grupoId) {
  const { data } = await sb.from("igr_pedidos_oracao").select("*, igr_membros!inner(nome_completo, grupo_id)")
    .eq("igreja_id", state.igreja.id).eq("igr_membros.grupo_id", grupoId).order("created_at", { ascending: false });
  const el = document.getElementById("grupo-detalhe-oracao");
  el.innerHTML = (data || []).map(p => `
    <div class="card">
      <div class="row-avatar">
        ${avatarIniciais(p.igr_membros?.nome_completo || "?")}
        <div class="row-info"><b>${p.igr_membros?.nome_completo || "Membro"}</b><span>${tempoRelativo(p.created_at)}</span></div>
      </div>
      <p style="margin:10px 0;font-size:13.5px;">${p.texto}</p>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <button class="chip ${p.status === "novo" ? "on" : ""}" data-status-oracao-grupo="${p.id}" data-status="novo">Novo</button>
        <button class="chip ${p.status === "orando" ? "on" : ""}" data-status-oracao-grupo="${p.id}" data-status="orando">Orando</button>
        <button class="chip ${p.status === "respondido" ? "on" : ""}" data-status-oracao-grupo="${p.id}" data-status="respondido">Respondido</button>
      </div>
    </div>
  `).join("") || `<div class="empty">Nenhum pedido de oração do grupo ainda.</div>`;

  el.querySelectorAll("[data-status-oracao-grupo]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const pedido = (data || []).find(p => p.id === btn.dataset.statusOracaoGrupo);
      await sb.from("igr_pedidos_oracao").update({ status: btn.dataset.status }).eq("id", btn.dataset.statusOracaoGrupo);
      if (pedido?.membro_id) {
        if (btn.dataset.status === "orando") {
          enviarPush({ tipo: "membros", membro_ids: [pedido.membro_id] }, "Estamos orando por você 🙏", "Seu pedido de oração está sendo levado ao Senhor.");
        } else if (btn.dataset.status === "respondido") {
          enviarPush({ tipo: "membros", membro_ids: [pedido.membro_id] }, "Seu pedido foi respondido! 🙌", "Que alegria — seu pedido de oração foi marcado como respondido. Deus é fiel!");
        }
      }
      carregarOracaoDoGrupo(grupoId);
    });
  });
}

// ---------- células e monitores ----------
let monitorSelecionadoCelula = null;
let monitorSelecionadoCelulaAdmin = null;
let monitorSelecionadoEdicaoCelula = null;

async function carregarCelulasDoGrupo(grupoId, prefixo) {
  prefixo = prefixo || "";
  const souAdmin = prefixo === "adm-";
  const el = document.getElementById(souAdmin ? "adm-celulas-lista" : "grupo-celulas-lista");
  const { data: celulas } = await sb.from("igr_celulas").select("*, igr_membros!igr_celulas_monitor_membro_id_fkey(nome_completo)").eq("grupo_id", grupoId).order("created_at");
  const { data: membrosDoGrupo } = await sb.from("igr_membros").select("celula_id").eq("grupo_id", grupoId).not("celula_id", "is", null);
  const contagem = {};
  (membrosDoGrupo || []).forEach(m => { contagem[m.celula_id] = (contagem[m.celula_id] || 0) + 1; });

  el.innerHTML = (celulas || []).map(c => `
    <div class="card row-avatar">
      ${avatarIniciais(c.igr_membros?.nome_completo || "?")}
      <div class="row-info"><b>${c.nome}</b><span>${c.tipo || "Célula"} · Monitor(a): ${c.igr_membros?.nome_completo || "—"} · ${contagem[c.id] || 0} membro(s)</span></div>
      ${souAdmin ? `<button class="btn-icone-remover" data-editar-celula-admin="${c.id}" title="Editar" style="color:var(--brand);">✏️</button>` : ""}
      <button class="btn-icone-remover" data-remover-celula="${c.id}" title="Remover">✕</button>
    </div>
  `).join("") || `<p class="hint">Nenhum monitor escolhido ainda neste grupo.</p>`;

  el.querySelectorAll("[data-remover-celula]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Remover esse grupo? Os membros dele ficarão sem grupo/célula.")) return;
      await sb.from("igr_celulas").delete().eq("id", btn.dataset.removerCelula);
      carregarCelulasDoGrupo(grupoId, prefixo);
    });
  });
  if (souAdmin) {
    el.querySelectorAll("[data-editar-celula-admin]").forEach(btn => {
      const celula = (celulas || []).find(c => c.id === btn.dataset.editarCelulaAdmin);
      btn.addEventListener("click", () => abrirEditarCelulaAdmin(celula, grupoId));
    });
  }
}

function abrirEditarCelulaAdmin(celula, grupoId) {
  state.celulaEditandoAdmin = celula;
  state.grupoDaCelulaEditandoAdmin = grupoId;
  monitorSelecionadoEdicaoCelula = null;
  document.getElementById("admin-membros-view-editar-grupo").style.display = "none";
  document.getElementById("admin-membros-view-editar-celula").style.display = "block";
  document.getElementById("adm-eg-celula-tipo").value = celula.tipo || "Célula";
  document.getElementById("adm-eg-celula-nome").value = celula.nome;
  document.getElementById("adm-eg-celula-busca-novo-monitor").value = "";
  document.getElementById("adm-eg-celula-monitor-atual").textContent = `Monitor(a) atual: ${celula.igr_membros?.nome_completo || "—"}`;
}

async function salvarEdicaoCelulaAdmin(ev) {
  ev.preventDefault();
  const celula = state.celulaEditandoAdmin;
  if (!celula) return;
  const payload = {
    tipo: document.getElementById("adm-eg-celula-tipo").value,
    nome: document.getElementById("adm-eg-celula-nome").value.trim(),
  };
  if (monitorSelecionadoEdicaoCelula) payload.monitor_membro_id = monitorSelecionadoEdicaoCelula.id;
  const btn = ev.target.querySelector("button[type=submit]");
  btn.disabled = true; btn.textContent = "Salvando...";
  const { error } = await sb.from("igr_celulas").update(payload).eq("id", celula.id);
  btn.disabled = false; btn.textContent = "Salvar alterações";
  if (error) { alert("Não deu pra salvar: " + error.message); return; }
  if (monitorSelecionadoEdicaoCelula) {
    enviarPush({ tipo: "membros", membro_ids: [monitorSelecionadoEdicaoCelula.id] }, `Você é a nova liderança de um(a) ${payload.tipo}! 🎉`, `Você foi escolhido(a) monitor(a) da(o) ${payload.nome}.`);
  }
  document.getElementById("admin-membros-view-editar-celula").style.display = "none";
  document.getElementById("admin-membros-view-editar-grupo").style.display = "block";
  carregarCelulasDoGrupo(state.grupoDaCelulaEditandoAdmin, "adm-");
}

function configurarBuscaMonitorEdicaoAdmin() {
  const input = document.getElementById("adm-eg-celula-busca-novo-monitor");
  const sugestoesEl = document.getElementById("adm-eg-celula-sugestoes-monitor");
  if (!input) return;
  let timeoutId = null;
  input.addEventListener("input", () => {
    clearTimeout(timeoutId);
    const termo = input.value.trim();
    monitorSelecionadoEdicaoCelula = null;
    if (termo.length < 2) { sugestoesEl.style.display = "none"; return; }
    timeoutId = setTimeout(async () => {
      const { data } = await sb.from("igr_membros").select("id, nome_completo")
        .eq("igreja_id", state.igreja.id).ilike("nome_completo", `%${termo}%`).limit(6);
      sugestoesEl.innerHTML = (data || []).map(m => `<div class="autocomplete-item" data-id="${m.id}" data-nome="${m.nome_completo}">${m.nome_completo}</div>`).join("");
      sugestoesEl.style.display = data?.length ? "block" : "none";
      sugestoesEl.querySelectorAll("[data-id]").forEach(item => {
        item.addEventListener("click", () => {
          monitorSelecionadoEdicaoCelula = { id: item.dataset.id, nome: item.dataset.nome };
          input.value = item.dataset.nome;
          sugestoesEl.style.display = "none";
        });
      });
    }, 300);
  });
}

async function excluirCelulaAdmin() {
  const celula = state.celulaEditandoAdmin;
  if (!celula) return;
  if (!confirm(`Excluir "${celula.nome}"? Os membros dela ficarão sem grupo.`)) return;
  await sb.from("igr_celulas").delete().eq("id", celula.id);
  document.getElementById("admin-membros-view-editar-celula").style.display = "none";
  document.getElementById("admin-membros-view-editar-grupo").style.display = "block";
  carregarCelulasDoGrupo(state.grupoDaCelulaEditandoAdmin, "adm-");
}

function configurarBuscaMonitor(prefixo) {
  prefixo = prefixo || "";
  const souAdmin = prefixo === "adm-";
  const input = document.getElementById(prefixo + "celula-busca-monitor");
  const sugestoesEl = document.getElementById(prefixo + "celula-sugestoes-monitor");
  if (!input) return;
  let timeoutId = null;
  input.addEventListener("input", () => {
    clearTimeout(timeoutId);
    const termo = input.value.trim();
    if (souAdmin) monitorSelecionadoCelulaAdmin = null; else monitorSelecionadoCelula = null;
    document.getElementById(prefixo + "btn-criar-celula").disabled = true;
    if (termo.length < 2) { sugestoesEl.style.display = "none"; return; }
    timeoutId = setTimeout(async () => {
      const { data } = await sb.from("igr_membros").select("id, nome_completo")
        .eq("igreja_id", state.igreja.id).ilike("nome_completo", `%${termo}%`).limit(6);
      sugestoesEl.innerHTML = (data || []).map(m => `<div class="autocomplete-item" data-id="${m.id}" data-nome="${m.nome_completo}">${m.nome_completo}</div>`).join("");
      sugestoesEl.style.display = data?.length ? "block" : "none";
      sugestoesEl.querySelectorAll("[data-id]").forEach(item => {
        item.addEventListener("click", () => {
          const sel = { id: item.dataset.id, nome: item.dataset.nome };
          if (souAdmin) monitorSelecionadoCelulaAdmin = sel; else monitorSelecionadoCelula = sel;
          document.getElementById(prefixo + "celula-nome-monitor-selecionado").textContent = item.dataset.nome;
          document.getElementById(prefixo + "celula-monitor-selecionado").style.display = "block";
          const nomeInput = document.getElementById(prefixo + "celula-nome-nova");
          if (!nomeInput.value) nomeInput.value = `Célula ${item.dataset.nome.split(" ")[0]}`;
          input.value = "";
          sugestoesEl.style.display = "none";
          document.getElementById(prefixo + "btn-criar-celula").disabled = false;
        });
      });
    }, 300);
  });
  document.addEventListener("click", (ev) => {
    if (!sugestoesEl.contains(ev.target) && ev.target !== input) sugestoesEl.style.display = "none";
  });
}

async function criarCelula(grupoAlvo, prefixo) {
  prefixo = prefixo || "";
  const souAdmin = prefixo === "adm-";
  const monitorSel = souAdmin ? monitorSelecionadoCelulaAdmin : monitorSelecionadoCelula;
  if (!monitorSel || !grupoAlvo) return;
  const nome = document.getElementById(prefixo + "celula-nome-nova").value.trim();
  const tipo = document.getElementById(prefixo + "celula-tipo-nova").value;
  if (!nome) return;
  const btn = document.getElementById(prefixo + "btn-criar-celula");
  btn.disabled = true; btn.textContent = "Criando...";
  const { error } = await sb.from("igr_celulas").insert({
    igreja_id: state.igreja.id, grupo_id: grupoAlvo,
    monitor_membro_id: monitorSel.id, nome, tipo,
  });
  btn.disabled = false; btn.textContent = "Tornar monitor(a)";
  if (error) { alert("Não deu pra criar: " + error.message); return; }
  enviarPush({ tipo: "membros", membro_ids: [monitorSel.id] }, `Você é a nova liderança de um(a) ${tipo}! 🎉`, `Você foi escolhido(a) monitor(a) da(o) ${nome}. Acesse o app pra começar.`);
  document.getElementById(prefixo + "celula-monitor-selecionado").style.display = "none";
  document.getElementById(prefixo + "celula-nome-nova").value = "";
  if (souAdmin) monitorSelecionadoCelulaAdmin = null; else monitorSelecionadoCelula = null;
  carregarCelulasDoGrupo(grupoAlvo, prefixo);
}

async function abrirCelula(celulaId) {
  const { data: celula } = await sb.from("igr_celulas").select("*").eq("id", celulaId).single();
  if (!celula) return;
  state.celulaAtual = celula;
  const souMonitor = state.membro && celula.monitor_membro_id === state.membro.id;
  const rotulo = celula.tipo || "Célula";
  const rotuloMin = rotulo.toLowerCase();
  const artigoDe = celula.tipo === "Grupo de Monitor" ? "do" : "da";

  document.getElementById("celula-titulo").textContent = celula.nome;
  document.getElementById("celula-subtitulo").textContent = souMonitor ? `Você é o(a) monitor(a) desse ${rotulo}.` : `Bem-vindo(a) ao seu ${rotulo}.`;
  document.getElementById("celula-bloco-monitor").style.display = souMonitor ? "block" : "none";
  document.getElementById("form-celula-post").style.display = souMonitor ? "block" : "none";
  document.getElementById("celula-label-gerenciar").textContent = `Gerenciar ${rotuloMin}`;
  document.getElementById("celula-label-nome").textContent = `Nome ${artigoDe} ${rotuloMin}`;
  document.getElementById("celula-label-membros").textContent = `Membros ${artigoDe} ${rotuloMin}`;
  if (souMonitor) {
    document.getElementById("celula-editar-nome").value = celula.nome;
    carregarMembrosDaCelula(celulaId);
  }
  mostrarTela("tela-celula");
  carregarFeedCelula(celulaId);
}

async function salvarNomeCelula() {
  const novoNome = document.getElementById("celula-editar-nome").value.trim();
  if (!novoNome || !state.celulaAtual) return;
  await sb.from("igr_celulas").update({ nome: novoNome }).eq("id", state.celulaAtual.id);
  state.celulaAtual.nome = novoNome;
  document.getElementById("celula-titulo").textContent = novoNome;
}

async function carregarMembrosDaCelula(celulaId) {
  const { data } = await sb.from("igr_membros").select("id, nome_completo").eq("celula_id", celulaId).order("nome_completo");
  const el = document.getElementById("celula-membros-lista");
  el.innerHTML = (data || []).map(m => `
    <div class="row-avatar" style="margin-bottom:8px;">
      ${avatarIniciais(m.nome_completo)}
      <div class="row-info"><b style="font-size:13px;">${m.nome_completo}</b></div>
      <button class="btn-icone-remover" data-remover-membro-celula="${m.id}" title="Remover da célula">✕</button>
    </div>
  `).join("") || `<p class="hint">Nenhum membro na célula ainda.</p>`;
  el.querySelectorAll("[data-remover-membro-celula]").forEach(btn => {
    btn.addEventListener("click", async () => {
      await sb.from("igr_membros").update({ celula_id: null }).eq("id", btn.dataset.removerMembroCelula);
      carregarMembrosDaCelula(celulaId);
    });
  });
}

function configurarBuscaMembroCelula() {
  const input = document.getElementById("celula-busca-membro");
  const sugestoesEl = document.getElementById("celula-sugestoes-membro");
  if (!input) return;
  let timeoutId = null;
  input.addEventListener("input", () => {
    clearTimeout(timeoutId);
    const termo = input.value.trim();
    if (termo.length < 2 || !state.celulaAtual) { sugestoesEl.style.display = "none"; return; }
    timeoutId = setTimeout(async () => {
      const { data } = await sb.from("igr_membros").select("id, nome_completo")
        .eq("igreja_id", state.igreja.id).ilike("nome_completo", `%${termo}%`).limit(6);
      sugestoesEl.innerHTML = (data || []).map(m => `<div class="autocomplete-item" data-id="${m.id}" data-nome="${m.nome_completo}">${m.nome_completo}</div>`).join("");
      sugestoesEl.style.display = data?.length ? "block" : "none";
      sugestoesEl.querySelectorAll("[data-id]").forEach(item => {
        item.addEventListener("click", async () => {
          const celulaId = state.celulaAtual.id;
          const celulaNome = state.celulaAtual.nome;
          await sb.from("igr_membros").update({ celula_id: celulaId }).eq("id", item.dataset.id);
          enviarPush({ tipo: "membros", membro_ids: [item.dataset.id] }, "Você agora faz parte de uma célula! 🙌", `Você foi adicionado(a) à ${celulaNome}. Acesse o app pra se conectar com o grupo.`);
          input.value = "";
          sugestoesEl.style.display = "none";
          carregarMembrosDaCelula(celulaId);
        });
      });
    }, 300);
  });
}

async function carregarFeedCelula(celulaId) {
  const el = document.getElementById("celula-feed");
  el.innerHTML = `<p class="hint"><span class="loading-dot"></span></p>`;
  const souMonitor = state.membro && state.celulaAtual?.monitor_membro_id === state.membro.id;
  const { data: posts } = await sb.from("igr_celula_posts").select("*").eq("celula_id", celulaId).order("created_at", { ascending: false });
  const idsPosts = (posts || []).map(p => p.id).length ? (posts || []).map(p => p.id) : ["00000000-0000-0000-0000-000000000000"];
  const { data: comentarios } = await sb.from("igr_celula_comentarios").select("*").in("post_id", idsPosts).order("created_at");
  const { data: checks } = await sb.from("igr_celula_post_checks").select("post_id, membro_id, igr_membros(nome_completo)").in("post_id", idsPosts);

  el.innerHTML = (posts || []).map(p => {
    const comentariosDoPost = (comentarios || []).filter(c => c.post_id === p.id);
    const checksDoPost = (checks || []).filter(c => c.post_id === p.id);
    const euConfirmei = checksDoPost.some(c => c.membro_id === state.membro?.id);
    return `
      <div class="card" style="margin-bottom:12px;">
        <div class="row-avatar" style="align-items:flex-start;">
          ${avatarIniciais(p.autor_nome)}
          <div class="row-info"><b>${p.autor_nome}</b><span>${tempoRelativo(p.created_at)}</span></div>
        </div>
        <p style="margin:10px 0;font-size:13.5px;">${p.texto}</p>
        ${p.data_evento ? `<p style="margin:-4px 0 8px;font-size:12.5px;color:var(--brand);font-weight:600;">📅 ${formatarData(p.data_evento)}${p.hora_evento ? " às " + p.hora_evento : ""}</p>
        <button class="btn btn-ghost" data-add-agenda-celula='${JSON.stringify({ t: p.texto.slice(0, 60), d: p.data_evento, h: p.hora_evento || "" }).replace(/'/g, "&#39;")}' style="width:auto;padding:7px 14px;font-size:12px;margin-bottom:8px;">📲 Adicionar na minha agenda</button>` : ""}
        ${souMonitor
          ? `<p class="hint" style="margin:-4px 0 8px;">✓ ${checksDoPost.length} confirmaram: ${checksDoPost.map(c => c.igr_membros?.nome_completo?.split(" ")[0]).filter(Boolean).join(", ") || "ninguém ainda"}</p>`
          : `<button class="btn ${euConfirmei ? "" : "btn-primary"}" data-confirmar-post="${p.id}" ${euConfirmei ? "disabled" : ""} style="width:auto;padding:8px 16px;font-size:12.5px;margin-bottom:8px;">${euConfirmei ? "✓ Você confirmou" : "Confirmar recebimento"}</button>`
        }
        <div style="border-top:1px solid var(--line);margin-top:10px;padding-top:10px;">
          ${comentariosDoPost.map(c => `
            <div style="margin-bottom:8px;font-size:12.5px;"><b>${c.autor_nome}:</b> ${c.texto}</div>
          `).join("")}
          <div style="display:flex;gap:6px;">
            <input type="text" class="celula-comentario-input" data-post-id="${p.id}" placeholder="Escreva um comentário..." style="flex:1;padding:9px 12px;border-radius:10px;border:1.5px solid var(--line);background:var(--bg);font-size:12.5px;">
            <button class="btn btn-ghost" data-enviar-comentario="${p.id}" style="width:auto;padding:9px 14px;font-size:12.5px;">Enviar</button>
          </div>
        </div>
      </div>
    `;
  }).join("") || `<div class="empty">${souMonitor ? "Publique o primeiro aviso pro grupo." : "Nenhum aviso publicado ainda."}</div>`;

  el.querySelectorAll("[data-enviar-comentario]").forEach(btn => {
    btn.addEventListener("click", () => enviarComentarioCelula(btn.dataset.enviarComentario, celulaId));
  });
  el.querySelectorAll("[data-confirmar-post]").forEach(btn => {
    btn.addEventListener("click", () => confirmarRecebimentoPost(btn.dataset.confirmarPost, celulaId));
  });
  el.querySelectorAll("[data-add-agenda-celula]").forEach(btn => {
    btn.addEventListener("click", () => {
      const info = JSON.parse(btn.dataset.addAgendaCelula);
      adicionarEventoAgenda(info.t, info.d, info.h, state.celulaAtual?.nome || "", "");
    });
  });
}

async function confirmarRecebimentoPost(postId, celulaId) {
  if (!state.membro) return;
  await sb.from("igr_celula_post_checks").insert({ post_id: postId, membro_id: state.membro.id });
  carregarFeedCelula(celulaId);
}

async function enviarPostCelula(ev) {
  ev.preventDefault();
  const texto = document.getElementById("celula-post-texto").value.trim();
  const data_evento = document.getElementById("celula-post-data").value || null;
  const hora_evento = document.getElementById("celula-post-horario").value.trim() || null;
  if (!texto || !state.celulaAtual || !state.membro) return;
  await sb.from("igr_celula_posts").insert({
    celula_id: state.celulaAtual.id, autor_membro_id: state.membro.id,
    autor_nome: state.membro.nome_completo, texto, data_evento, hora_evento,
  });
  document.getElementById("celula-post-texto").value = "";
  document.getElementById("celula-post-data").value = "";
  document.getElementById("celula-post-horario").value = "";
  carregarFeedCelula(state.celulaAtual.id);

  const { data: membrosCelula } = await sb.from("igr_membros").select("id").eq("celula_id", state.celulaAtual.id);
  const ids = (membrosCelula || []).map(m => m.id).filter(id => id !== state.membro.id);
  if (ids.length) {
    enviarPush({ tipo: "membros", membro_ids: ids }, `Novo aviso no ${state.celulaAtual.tipo || "grupo"} ${state.celulaAtual.nome}`, texto.slice(0, 100));
  }
}

async function enviarComentarioCelula(postId, celulaId) {
  const input = document.querySelector(`.celula-comentario-input[data-post-id="${postId}"]`);
  const texto = input.value.trim();
  if (!texto || !state.membro) return;
  await sb.from("igr_celula_comentarios").insert({
    post_id: postId, autor_membro_id: state.membro.id, autor_nome: state.membro.nome_completo, texto,
  });
  carregarFeedCelula(celulaId);
}

async function carregarAvisosDoGrupoDetalhe(grupoId) {
  const { data } = await sb.from("igr_avisos").select("*").eq("grupo_id", grupoId).order("publicado_em", { ascending: false }).limit(10);
  const el = document.getElementById("grupo-detalhe-avisos");
  el.innerHTML = (data || []).map(a => `
    <div class="card">
      ${a.imagem_url ? `<img class="capa-thumb" src="${a.imagem_url}" alt="">` : ""}
      ${a.video_url ? `<video class="capa-thumb" src="${a.video_url}" controls playsinline></video>` : ""}
      <div class="row-avatar" style="align-items:flex-start;">
        ${seloData(a.publicado_em)}
        <div class="row-info"><b>${a.titulo}</b><p style="margin:4px 0 0;font-size:12.5px;color:var(--ink-soft);">${a.texto || ""}</p></div>
      </div>
    </div>
  `).join("") || `<div class="empty">Nenhum aviso publicado ainda.</div>`;
}

async function enviarGrupoInfo(ev) {
  ev.preventDefault();
  const grupo = state.grupoDetalheAtual;
  if (!grupo) return;
  const descricao = document.getElementById("gi-descricao").value.trim();
  const btn = ev.target.querySelector("button[type=submit]");
  btn.disabled = true; btn.textContent = "Salvando...";
  try {
    const arquivo = document.getElementById("gi-capa").files[0];
    const novaCapa = await uploadArquivo(arquivo, "grupos");
    const capa_url = novaCapa || grupo.capa_url || null;
    const { error } = await sb.from("igr_grupos").update({ descricao, capa_url }).eq("id", grupo.id);
    if (error) { alert("Não deu pra salvar: " + error.message); return; }
    Object.assign(grupo, { descricao, capa_url });
    document.getElementById("grupo-detalhe-descricao").textContent = descricao || "Ainda não há uma descrição desse grupo.";
    if (capa_url) { document.getElementById("grupo-detalhe-capa").src = capa_url; document.getElementById("grupo-detalhe-capa").style.display = "block"; }
    enviarPush({ tipo: "grupo", grupo_id: grupo.id }, `Novidade no grupo ${grupo.nome}`, "As informações do grupo foram atualizadas.");
    alert("Salvo com sucesso 💛");
  } catch (e) {
    console.error("Erro ao salvar informações do grupo:", e);
    alert("Não deu pra salvar agora. Verifique sua conexão e tente de novo.");
  } finally {
    btn.disabled = false; btn.textContent = "Salvar informações";
  }
}

async function enviarAvisoGrupoDetalhe(ev) {
  ev.preventDefault();
  const grupo = state.grupoDetalheAtual;
  if (!grupo) return;
  const titulo = document.getElementById("ga-titulo").value.trim();
  const texto = document.getElementById("ga-texto").value.trim();
  if (!titulo) return;
  const btn = ev.target.querySelector("button[type=submit]");
  btn.disabled = true; btn.textContent = "Publicando...";
  try {
    const arquivo = document.getElementById("ga-imagem").files[0];
    const arquivoVideo = document.getElementById("ga-video").files[0];
    const imagem_url = await uploadArquivo(arquivo, "avisos");
    const video_url = await uploadArquivo(arquivoVideo, "avisos");
    const { error } = await sb.from("igr_avisos").insert({
      igreja_id: state.igreja.id, titulo, texto, imagem_url, video_url, grupo_id: grupo.id, criado_por_membro_id: state.membro.id,
      publicado_em: new Date().toISOString(),
    });
    if (error) { alert("Não deu pra publicar: " + error.message); return; }
    ev.target.reset();
    await carregarAvisosDoGrupoDetalhe(grupo.id);
    enviarPush({ tipo: "grupo", grupo_id: grupo.id }, titulo, texto);
  } catch (e) {
    console.error("Erro ao publicar aviso do grupo:", e);
    alert("Não deu pra publicar agora. Verifique sua conexão e tente de novo.");
  } finally {
    btn.disabled = false; btn.textContent = "Publicar para o grupo";
  }
}

async function carregarSobreIgreja() {
  document.getElementById("sobreigreja-voltar").dataset.nav = state.membro ? "tela-membro-home" : "tela-visitante";
  const ig = state.igreja || {};
  document.getElementById("sobre-nome-igreja").textContent = ig.nome || "";
  document.getElementById("sobre-texto").textContent = ig.sobre_texto ||
    "Somos uma igreja que vive o amor de Cristo e caminha junto com nossa comunidade.";

  const itens = montarItensContato();
  document.getElementById("sobre-contatos").innerHTML = itens.join("") ||
    `<p class="hint">Nenhum contato cadastrado ainda.</p>`;

  const { data: pastores } = await sb.from("igr_pastores").select("*").eq("igreja_id", ig.id).order("ordem");
  document.getElementById("sobre-pastores").innerHTML = (pastores || []).map(p => `
    <div style="text-align:center;">
      <img src="${p.foto_url || "assets/logo.png"}" alt="" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:16px;margin-bottom:8px;">
      <b style="display:block;font-size:13.5px;">${p.nome}</b>
      <span class="hint" style="margin:0;">${p.cargo || ""}</span>
    </div>
  `).join("") || `<p class="hint">Liderança ainda não cadastrada.</p>`;

  const { data: cultos } = await sb.from("igr_cultos").select("*").eq("igreja_id", ig.id).order("ordem").limit(1);
  const proximoBox = document.getElementById("sobre-proximo-culto");
  if (cultos && cultos[0]) {
    const c = cultos[0];
    proximoBox.style.display = "block";
    proximoBox.innerHTML = `<span class="badge-inline">Próximo culto</span><h3 style="margin:6px 0 2px;">${c.titulo}</h3><p style="margin:0;font-size:13px;color:var(--ink-soft);">${c.data ? formatarData(c.data) : c.dia_semana} · ${c.horario}${c.local ? " · " + c.local : ""}</p>`;
  } else {
    proximoBox.style.display = "none";
  }
}

// ---------- eventos ----------
function podeGerenciarEventos() {
  return !!(state.adminNome || (state.membro && state.membro.eh_lider));
}
function podeEditarEvento(evento) {
  if (state.adminNome) return true;
  return !!(state.membro && evento.criado_por_membro_id === state.membro.id);
}

// ---------- biblia ----------
async function chamarBiblia(payload) {
  try {
    const { data, error } = await sb.functions.invoke("igr-biblia", { body: payload });
    if (error) throw error;
    return data;
  } catch (e) {
    console.error("Erro na Bíblia:", e);
    return null;
  }
}

async function abrirBibliaLivros() {
  document.getElementById("biblia-voltar").dataset.nav = state.membro ? "tela-membro-home" : "tela-visitante";
  document.getElementById("biblia-subtitulo").textContent = "Digite o livro (e o capítulo, se já souber) pra ir direto pra leitura.";
  document.getElementById("biblia-view-capitulos").style.display = "none";
  document.getElementById("biblia-view-texto").style.display = "none";
  document.getElementById("biblia-view-livros").style.display = "block";
  document.getElementById("biblia-busca-livro").value = "";
  document.getElementById("biblia-busca-capitulo").value = "";
  document.getElementById("biblia-busca-versiculo").value = "";
  state.bibliaLivroSelecionadoId = null;

  if (state.bibliaLivros) return;
  const resultado = await chamarBiblia({ acao: "livros" });
  if (!resultado?.livros) {
    document.getElementById("biblia-subtitulo").textContent = "Não deu pra carregar a Bíblia agora. Verifique sua internet e tente de novo.";
    return;
  }
  state.bibliaLivros = resultado.livros;
}

function configurarAutocompleteLivroBiblia() {
  const input = document.getElementById("biblia-busca-livro");
  const sugestoesEl = document.getElementById("biblia-livro-sugestoes");
  if (!input) return;

  const renderSugestoes = (lista) => {
    if (!lista.length) { sugestoesEl.style.display = "none"; return; }
    sugestoesEl.innerHTML = lista.map(l => `<div class="autocomplete-item" data-livro-id="${l.id}" data-livro-nome="${l.nome}">${l.nome}</div>`).join("");
    sugestoesEl.style.display = "block";
    sugestoesEl.querySelectorAll("[data-livro-id]").forEach(item => {
      item.addEventListener("click", () => {
        input.value = item.dataset.livroNome;
        state.bibliaLivroSelecionadoId = item.dataset.livroId;
        sugestoesEl.style.display = "none";
        document.getElementById("biblia-busca-capitulo").focus();
      });
    });
  };

  input.addEventListener("input", () => {
    state.bibliaLivroSelecionadoId = null;
    const termo = input.value.trim().toLowerCase();
    if (!termo || !state.bibliaLivros) { sugestoesEl.style.display = "none"; return; }
    renderSugestoes(state.bibliaLivros.filter(l => l.nome.toLowerCase().includes(termo)).slice(0, 8));
  });

  document.getElementById("btn-biblia-abrir-menu-livros")?.addEventListener("click", () => {
    if (!state.bibliaLivros) return;
    if (sugestoesEl.style.display === "block") { sugestoesEl.style.display = "none"; return; }
    renderSugestoes(state.bibliaLivros);
  });

  document.addEventListener("click", (ev) => {
    if (!sugestoesEl.contains(ev.target) && ev.target !== input && ev.target.id !== "btn-biblia-abrir-menu-livros") sugestoesEl.style.display = "none";
  });
}

async function irParaReferenciaBiblia() {
  let livroId = state.bibliaLivroSelecionadoId;
  const termo = document.getElementById("biblia-busca-livro").value.trim().toLowerCase();
  if (!livroId && termo && state.bibliaLivros) {
    const bateu = state.bibliaLivros.find(l => l.nome.toLowerCase() === termo) ||
      state.bibliaLivros.find(l => l.nome.toLowerCase().startsWith(termo));
    if (bateu) livroId = bateu.id;
  }
  if (!livroId) { alert("Digite o nome de um livro válido e escolha uma sugestão."); return; }

  const capitulo = document.getElementById("biblia-busca-capitulo").value.trim();
  const versiculo = document.getElementById("biblia-busca-versiculo").value.trim();
  if (capitulo) {
    await abrirBibliaTexto(livroId, capitulo);
    if (versiculo) {
      const alvo = document.querySelector(`[data-versiculo-biblia="${versiculo}"]`);
      if (alvo) { alvo.scrollIntoView({ behavior: "smooth", block: "center" }); alvo.click(); }
    }
  } else {
    await abrirBibliaCapitulos(livroId);
  }
}

async function abrirBibliaCapitulos(livroId) {
  const livro = state.bibliaLivros.find(l => l.id === livroId);
  if (!livro) return;
  state.bibliaLivroAtual = livro;
  document.getElementById("biblia-subtitulo").textContent = "Escolha um capítulo.";
  document.getElementById("biblia-view-livros").style.display = "none";
  document.getElementById("biblia-view-texto").style.display = "none";
  document.getElementById("biblia-view-capitulos").style.display = "block";
  document.getElementById("biblia-nome-livro").textContent = livro.nome;
  document.getElementById("biblia-lista-capitulos").innerHTML = `<p class="hint"><span class="loading-dot"></span></p>`;

  const resultado = await chamarBiblia({ acao: "capitulos", livroId });
  if (!resultado?.capitulos) {
    document.getElementById("biblia-lista-capitulos").innerHTML = `<div class="empty">Não deu pra carregar os capítulos.</div>`;
    return;
  }
  document.getElementById("biblia-lista-capitulos").innerHTML = resultado.capitulos.map(c => `
    <button class="chip" data-capitulo-biblia="${c}" style="text-align:center;">${c}</button>
  `).join("");
  document.querySelectorAll("[data-capitulo-biblia]").forEach(btn => {
    btn.addEventListener("click", () => abrirBibliaTexto(livroId, btn.dataset.capituloBiblia));
  });
}

async function abrirBibliaTexto(livroId, capitulo) {
  document.getElementById("biblia-subtitulo").textContent = "";
  document.getElementById("biblia-view-capitulos").style.display = "none";
  document.getElementById("biblia-view-texto").style.display = "block";
  document.getElementById("biblia-versiculos").innerHTML = `<p class="hint"><span class="loading-dot"></span></p>`;
  document.getElementById("biblia-marcar-painel").style.display = "none";

  const resultado = await chamarBiblia({ acao: "texto", livroId, capitulo });
  if (!resultado?.versiculos) {
    document.getElementById("biblia-versiculos").innerHTML = `<div class="empty">Não deu pra carregar esse capítulo.</div>`;
    return;
  }
  document.getElementById("biblia-referencia").textContent = resultado.referencia;

  const livro = state.bibliaLivroAtual;
  let versiculosLidos = new Set();
  if (state.membro) {
    const { data: leituras } = await sb.from("igr_leituras").select("versiculo_inicio")
      .eq("membro_id", state.membro.id).eq("livro", livro.nome).eq("capitulo", parseInt(capitulo))
      .not("versiculo_inicio", "is", null);
    versiculosLidos = new Set((leituras || []).map(l => l.versiculo_inicio));
  }

  document.getElementById("biblia-versiculos").innerHTML = resultado.versiculos.map(v => `
    <span data-versiculo-biblia="${v.numero}" style="cursor:pointer;${versiculosLidos.has(parseInt(v.numero)) ? "background:var(--brand-soft);border-radius:4px;" : ""}">
      <sup style="color:var(--brand);font-weight:700;margin-right:2px;">${v.numero}${versiculosLidos.has(parseInt(v.numero)) ? " ✅" : ""}</sup>${v.texto}
    </span> `
  ).join("");
  document.getElementById("biblia-copyright").textContent = resultado.copyright || "";

  document.querySelectorAll("[data-versiculo-biblia]").forEach(span => {
    span.addEventListener("click", () => abrirMarcarVersiculo(livro.nome, capitulo, span.dataset.versiculoBiblia));
  });
}

function abrirMarcarVersiculo(livroNome, capitulo, versiculo) {
  if (!state.membro) { alert("Faça login pra marcar sua leitura."); return; }
  state.bibliaVersiculoMarcando = { livroNome, capitulo, versiculo };
  document.getElementById("biblia-marcar-referencia").textContent = `${livroNome} ${capitulo}:${versiculo}`;
  document.getElementById("biblia-marcar-lido").checked = true;
  document.getElementById("biblia-marcar-nota").value = "";
  document.getElementById("biblia-marcar-compartilhar").checked = false;
  document.getElementById("biblia-marcar-painel").style.display = "block";
  document.getElementById("biblia-marcar-painel").scrollIntoView({ behavior: "smooth", block: "center" });
}

async function salvarMarcarVersiculo() {
  const alvo = state.bibliaVersiculoMarcando;
  if (!alvo || !state.membro) return;
  const nota = document.getElementById("biblia-marcar-nota").value.trim() || null;
  const compartilhado = document.getElementById("biblia-marcar-compartilhar").checked;
  const btn = document.getElementById("btn-biblia-marcar-salvar");
  btn.disabled = true; btn.textContent = "Salvando...";
  await sb.from("igr_leituras").insert({
    igreja_id: state.igreja.id, membro_id: state.membro.id,
    livro: alvo.livroNome, capitulo: parseInt(alvo.capitulo), versiculo_inicio: parseInt(alvo.versiculo),
    nota, compartilhado,
  });
  btn.disabled = false; btn.textContent = "Salvar";
  document.getElementById("biblia-marcar-painel").style.display = "none";
  if (nota) sb.functions.invoke("igr-atualizar-perfil-espiritual", { body: { membro_id: state.membro.id } }).catch(() => {});
  await abrirBibliaTexto(state.bibliaLivroAtual.id, alvo.capitulo);
}

// ---------- diário de leitura ----------
const LIVROS_BIBLICOS_NOMES = [
  "Gênesis","Êxodo","Levítico","Números","Deuteronômio","Josué","Juízes","Rute","1 Samuel","2 Samuel",
  "1 Reis","2 Reis","1 Crônicas","2 Crônicas","Esdras","Neemias","Ester","Jó","Salmos","Provérbios",
  "Eclesiastes","Cantares","Isaías","Jeremias","Lamentações","Ezequiel","Daniel","Oseias","Joel","Amós",
  "Obadias","Jonas","Miqueias","Naum","Habacuque","Sofonias","Ageu","Zacarias","Malaquias",
  "Mateus","Marcos","Lucas","João","Atos","Romanos","1 Coríntios","2 Coríntios","Gálatas","Efésios",
  "Filipenses","Colossenses","1 Tessalonicenses","2 Tessalonicenses","1 Timóteo","2 Timóteo","Tito","Filemom","Hebreus",
  "Tiago","1 Pedro","2 Pedro","1 João","2 João","3 João","Judas","Apocalipse",
];

async function chamarBibliaTexto(referencia) {
  try {
    const { data, error } = await sb.functions.invoke("igr-biblia-texto", { body: { referencia } });
    if (error) throw error;
    return data;
  } catch (e) {
    console.error("Erro ao buscar texto:", e);
    return null;
  }
}

function configurarAutocompleteLivroDiario() {
  const input = document.getElementById("diario-livro");
  const sugestoesEl = document.getElementById("diario-livro-sugestoes");
  if (!input) return;
  input.addEventListener("input", () => {
    const termo = input.value.trim().toLowerCase();
    if (!termo) { sugestoesEl.style.display = "none"; return; }
    const bateram = LIVROS_BIBLICOS_NOMES.filter(l => l.toLowerCase().startsWith(termo)).slice(0, 6);
    if (!bateram.length) { sugestoesEl.style.display = "none"; return; }
    sugestoesEl.innerHTML = bateram.map(l => `<div class="autocomplete-item" data-livro="${l}">${l}</div>`).join("");
    sugestoesEl.style.display = "block";
    sugestoesEl.querySelectorAll("[data-livro]").forEach(item => {
      item.addEventListener("click", () => {
        input.value = item.dataset.livro;
        sugestoesEl.style.display = "none";
      });
    });
  });
  document.addEventListener("click", (ev) => {
    if (!sugestoesEl.contains(ev.target) && ev.target !== input) sugestoesEl.style.display = "none";
  });
}

function montarReferenciaDiario() {
  const livro = document.getElementById("diario-livro").value.trim();
  const capitulo = document.getElementById("diario-capitulo").value.trim();
  const versiculo = document.getElementById("diario-versiculo").value.trim();
  if (!livro || !capitulo) return null;
  return versiculo ? `${livro} ${capitulo}:${versiculo}` : `${livro} ${capitulo}`;
}

async function verTextoDiario() {
  const ref = montarReferenciaDiario();
  const preview = document.getElementById("diario-texto-preview");
  if (!ref) { alert("Preencha o livro e o capítulo primeiro."); return; }
  preview.style.display = "block";
  preview.innerHTML = `<span class="loading-dot"></span>`;
  const resultado = await chamarBibliaTexto(ref);
  if (!resultado?.ok) {
    preview.innerHTML = "Não consegui encontrar essa referência. Confira o livro e o capítulo.";
    return;
  }
  preview.innerHTML = `<b>${resultado.referencia}</b><br>${resultado.texto}`;
}

async function salvarLeituraDiario() {
  if (!state.membro) return;
  const livro = document.getElementById("diario-livro").value.trim() || null;
  const capitulo = document.getElementById("diario-capitulo").value.trim() || null;
  const versiculo = document.getElementById("diario-versiculo").value.trim() || null;
  const nota = document.getElementById("diario-nota").value.trim() || null;
  const compartilhado = document.getElementById("diario-compartilhar").checked;
  if (!livro && !nota) { alert("Registre pelo menos um livro lido ou uma nota."); return; }

  const btn = document.getElementById("btn-salvar-diario");
  btn.disabled = true; btn.textContent = "Salvando...";
  const { error } = await sb.from("igr_leituras").insert({
    igreja_id: state.igreja.id, membro_id: state.membro.id,
    livro, capitulo: capitulo ? parseInt(capitulo) : null,
    versiculo_inicio: versiculo ? parseInt(versiculo) : null,
    nota, compartilhado,
  });
  btn.disabled = false; btn.textContent = "Salvar no meu diário";
  if (error) { alert("Não deu pra salvar: " + error.message); return; }

  document.getElementById("diario-livro").value = "";
  document.getElementById("diario-capitulo").value = "";
  document.getElementById("diario-versiculo").value = "";
  document.getElementById("diario-nota").value = "";
  document.getElementById("diario-compartilhar").checked = false;
  document.getElementById("diario-texto-preview").style.display = "none";
  if (nota) sb.functions.invoke("igr-atualizar-perfil-espiritual", { body: { membro_id: state.membro.id } }).catch(() => {});
  mostrarTela("tela-diario");
}

let leiturasHistoricoCache = null;
async function carregarHistoricoDiario() {
  const el = document.getElementById("diario-lista-historico");
  const { data } = await sb.from("igr_leituras").select("*")
    .eq("membro_id", state.membro.id).order("data", { ascending: false });
  leiturasHistoricoCache = data || [];
  renderHistoricoDiario();
}

function renderHistoricoDiario() {
  const el = document.getElementById("diario-lista-historico");
  const termo = document.getElementById("diario-busca-historico").value.trim().toLowerCase();
  const lista = (leiturasHistoricoCache || []).filter(l => {
    if (!termo) return true;
    return (l.livro || "").toLowerCase().includes(termo) || (l.nota || "").toLowerCase().includes(termo);
  });
  el.innerHTML = lista.map(l => {
    const ref = l.livro ? `${l.livro}${l.capitulo ? " " + l.capitulo : ""}${l.versiculo_inicio ? ":" + l.versiculo_inicio : ""}` : "";
    return `<div class="card">
      ${ref ? `<b style="font-size:14px;">${ref}</b>` : ""}
      <p class="hint" style="margin:2px 0 6px;">${formatarData(l.data)}${l.compartilhado ? " · 🔓 compartilhado" : ""}</p>
      ${l.nota ? `<p style="font-size:13.5px;margin:0;">${l.nota}</p>` : ""}
    </div>`;
  }).join("") || `<p class="hint">Nada por aqui ainda — registre sua primeira leitura!</p>`;
}

// ---------- planos de leitura ----------
async function carregarPlanos() {
  document.getElementById("planos-view-lista").style.display = "block";
  document.getElementById("planos-view-detalhe").style.display = "none";
  document.getElementById("planos-view-criar").style.display = "none";

  const [{ data: planos }, { data: progresso }] = await Promise.all([
    sb.from("igr_planos_leitura").select("*").or(`igreja_id.is.null,igreja_id.eq.${state.igreja.id}`).order("created_at"),
    sb.from("igr_planos_progresso").select("*").eq("membro_id", state.membro.id),
  ]);
  state.planosCache = planos || [];
  state.progressoCache = progresso || [];

  const emAndamentoIds = new Set((progresso || []).map(p => p.plano_id));
  const meusPlanos = (planos || []).filter(p => emAndamentoIds.has(p.id));
  const prontos = (planos || []).filter(p => !p.criado_por_membro_id);

  document.getElementById("planos-meus").innerHTML = meusPlanos.map(p => {
    const prog = progresso.find(pr => pr.plano_id === p.id);
    const pct = Math.round((prog.dias_concluidos.length / p.dias.length) * 100);
    return `<div class="card" data-abrir-plano="${p.id}" style="cursor:pointer;">
      <b style="font-size:14px;">${p.titulo}</b>
      <div style="background:var(--bg);border-radius:8px;height:6px;overflow:hidden;margin:8px 0 4px;"><div style="height:100%;background:var(--brand);width:${pct}%;"></div></div>
      <p class="hint" style="margin:0;">${prog.dias_concluidos.length} de ${p.dias.length} dias (${pct}%)</p>
    </div>`;
  }).join("") || `<p class="hint">Nenhum plano em andamento ainda.</p>`;

  document.getElementById("planos-catalogo").innerHTML = prontos.map(p => `
    <div class="card" data-abrir-plano="${p.id}" style="cursor:pointer;">
      <b style="font-size:14px;">${p.titulo}</b>
      <p class="hint" style="margin:4px 0 0;">${p.descricao || ""}</p>
      <p class="hint" style="margin:2px 0 0;">${p.dias.length} dias</p>
    </div>
  `).join("") || `<p class="hint">Nenhum plano pronto disponível.</p>`;

  document.querySelectorAll("[data-abrir-plano]").forEach(card => {
    card.addEventListener("click", () => abrirDetalhePlano(card.dataset.abrirPlano));
  });
}

async function abrirDetalhePlano(planoId) {
  const plano = state.planosCache.find(p => p.id === planoId);
  if (!plano) return;
  let progresso = state.progressoCache.find(p => p.plano_id === planoId);
  if (!progresso) {
    const { data } = await sb.from("igr_planos_progresso")
      .insert({ membro_id: state.membro.id, plano_id: planoId, dias_concluidos: [] })
      .select().single();
    progresso = data;
    state.progressoCache.push(progresso);
  }

  document.getElementById("planos-view-lista").style.display = "none";
  document.getElementById("planos-view-detalhe").style.display = "block";
  document.getElementById("plano-titulo-detalhe").textContent = plano.titulo;
  document.getElementById("plano-descricao-detalhe").textContent = plano.descricao || "";
  renderDetalhePlano(plano, progresso);
}

function renderDetalhePlano(plano, progresso) {
  const pct = Math.round((progresso.dias_concluidos.length / plano.dias.length) * 100);
  document.getElementById("plano-barra-progresso").style.width = pct + "%";
  document.getElementById("plano-dias-lista").innerHTML = plano.dias.map(d => {
    const feito = progresso.dias_concluidos.includes(d.dia);
    return `<div class="card row-avatar" style="align-items:center;">
      <label class="interesse-item" style="flex:1;margin:0;">
        <input type="checkbox" data-dia-plano="${d.dia}" ${feito ? "checked" : ""}>
        <span><b>Dia ${d.dia}</b> — ${d.referencia}</span>
      </label>
    </div>`;
  }).join("");
  document.querySelectorAll("[data-dia-plano]").forEach(chk => {
    chk.addEventListener("change", async () => {
      const dia = parseInt(chk.dataset.diaPlano);
      let dias = [...progresso.dias_concluidos];
      dias = chk.checked ? [...new Set([...dias, dia])] : dias.filter(d => d !== dia);
      progresso.dias_concluidos = dias;
      await sb.from("igr_planos_progresso").update({ dias_concluidos: dias }).eq("id", progresso.id);
      const pct2 = Math.round((dias.length / plano.dias.length) * 100);
      document.getElementById("plano-barra-progresso").style.width = pct2 + "%";
    });
  });
}

async function criarPlanoPersonalizado() {
  const titulo = document.getElementById("plano-novo-titulo").value.trim();
  const linhas = document.getElementById("plano-novo-dias").value.split("\n").map(l => l.trim()).filter(Boolean);
  if (!titulo || !linhas.length) { alert("Preencha o título e pelo menos um item."); return; }
  const dias = linhas.map((referencia, i) => ({ dia: i + 1, referencia }));
  const btn = document.getElementById("btn-salvar-plano-novo");
  btn.disabled = true; btn.textContent = "Criando...";
  const { data: novoPlano, error } = await sb.from("igr_planos_leitura").insert({
    igreja_id: state.igreja.id, criado_por_membro_id: state.membro.id, titulo, dias,
  }).select().single();
  if (!error && novoPlano) {
    await sb.from("igr_planos_progresso").insert({ membro_id: state.membro.id, plano_id: novoPlano.id, dias_concluidos: [] });
  }
  btn.disabled = false; btn.textContent = "Criar plano";
  if (error) { alert("Não deu pra criar: " + error.message); return; }
  document.getElementById("plano-novo-titulo").value = "";
  document.getElementById("plano-novo-dias").value = "";
  await carregarPlanos();
}

// ---------- busca por tema / gerador de estudo ----------
function textoCompartilhavelEstudo(estudo) {
  const ch = estudo.contexto_historico || {};
  let txt = `${estudo.titulo}\n\n`;
  txt += `📍 Contexto histórico (${ch.base_referencia || ""})\n`;
  if (ch.autor) txt += `Autor: ${ch.autor}\n`;
  if (ch.publico_original) txt += `Público original: ${ch.publico_original}\n`;
  if (ch.data_aproximada) txt += `Data aproximada: ${ch.data_aproximada}\n`;
  if (ch.local) txt += `Local: ${ch.local}\n`;
  txt += `\n${estudo.introducao}\n\n`;
  if (estudo.curiosidades?.length) {
    txt += `💡 Curiosidades\n`;
    estudo.curiosidades.forEach(c => { txt += `- ${c}\n`; });
    txt += `\n`;
  }
  estudo.pontos.forEach((p, i) => {
    txt += `${i + 1}. ${p.subtitulo} (${p.referencia})\n${p.explicacao}\n`;
    if (p.palavra_original) txt += `No original: ${p.palavra_original}\n`;
    if (p.aplicacao_atual) txt += `Aplicação hoje: ${p.aplicacao_atual}\n`;
    txt += `\n`;
  });
  txt += `Conclusão:\n${estudo.conclusao}`;
  return txt;
}

async function compartilharTexto(titulo, texto) {
  if (navigator.share) {
    try { await navigator.share({ title: titulo, text: texto }); return; } catch { /* usuário cancelou */ }
  }
  try {
    await navigator.clipboard.writeText(texto);
    alert("Copiado! Agora é só colar onde quiser (ex: WhatsApp).");
  } catch {
    alert("Não deu pra copiar automaticamente. Selecione o texto manualmente.");
  }
}

async function buscarPorTema(modo) {
  const tema = document.getElementById("tema-input").value.trim();
  const resultadoEl = document.getElementById("tema-resultado");
  if (!tema) { alert("Digite um tema primeiro."); return; }
  resultadoEl.innerHTML = `<p class="hint"><span class="loading-dot"></span> Pensando...</p>`;

  const { data, error } = await sb.functions.invoke("igr-estudo-biblico", { body: { tema, modo } });
  if (error || !data?.ok) {
    resultadoEl.innerHTML = `<div class="empty">Não deu pra gerar agora. Tente de novo em instantes.</div>`;
    return;
  }

  if (modo === "buscar") {
    resultadoEl.innerHTML = `
      <div class="section-label"><b>Versículos sobre "${tema}"</b></div>
      ${data.versiculos.map(v => `
        <div class="card">
          <b style="font-size:14px;">${v.referencia}</b>
          <p class="hint" style="margin:4px 0 8px;">${v.relacao}</p>
          <button class="btn btn-ghost" data-ver-versiculo="${v.referencia}" style="padding:8px 12px;font-size:12.5px;width:auto;">👁️ Ver texto</button>
          <div class="hint" data-texto-versiculo style="display:none;margin-top:8px;background:var(--bg);padding:10px 12px;border-radius:10px;"></div>
        </div>
      `).join("")}`;
    resultadoEl.querySelectorAll("[data-ver-versiculo]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const alvo = btn.nextElementSibling;
        alvo.style.display = "block";
        alvo.innerHTML = `<span class="loading-dot"></span>`;
        const resultado = await chamarBibliaTexto(btn.dataset.verVersiculo);
        alvo.innerHTML = resultado?.ok ? resultado.texto : "Não consegui carregar o texto.";
      });
    });
  } else {
    const ch = data.contexto_historico || {};
    resultadoEl.innerHTML = `
      <div class="card">
        <b style="font-size:16px;display:block;margin-bottom:10px;">${data.titulo}</b>

        <div style="background:var(--bg);border-radius:10px;padding:12px 14px;margin-bottom:12px;">
          <p class="hint" style="font-weight:700;margin:0 0 6px;color:var(--ink);">📍 Contexto histórico — ${ch.base_referencia || ""}</p>
          ${ch.autor ? `<p class="hint" style="margin:2px 0;">✍️ <b>Autor:</b> ${ch.autor}</p>` : ""}
          ${ch.publico_original ? `<p class="hint" style="margin:2px 0;">👥 <b>Escrito para:</b> ${ch.publico_original}</p>` : ""}
          ${ch.data_aproximada ? `<p class="hint" style="margin:2px 0;">🗓️ <b>Data aproximada:</b> ${ch.data_aproximada}</p>` : ""}
          ${ch.local ? `<p class="hint" style="margin:2px 0;">🗺️ <b>Local:</b> ${ch.local}</p>` : ""}
        </div>

        <p style="font-size:13.5px;margin:0 0 12px;">${data.introducao}</p>

        ${data.curiosidades?.length ? `
          <div style="background:var(--brand-soft);border-radius:10px;padding:12px 14px;margin-bottom:14px;">
            <p class="hint" style="font-weight:700;margin:0 0 6px;color:var(--ink);">💡 Curiosidades</p>
            ${data.curiosidades.map(c => `<p style="font-size:13px;margin:4px 0;">• ${c}</p>`).join("")}
          </div>` : ""}

        ${data.pontos.map((p, i) => `
          <div style="margin-bottom:14px;">
            <b style="font-size:13.5px;">${i + 1}. ${p.subtitulo}</b> <span class="hint">(${p.referencia})</span>
            <p style="font-size:13px;margin:4px 0 0;">${p.explicacao}</p>
            ${p.palavra_original ? `<p class="hint" style="margin:4px 0 0;font-style:italic;">📖 No original: ${p.palavra_original}</p>` : ""}
            ${p.aplicacao_atual ? `<p style="font-size:12.5px;margin:4px 0 0;color:var(--brand);">➡️ Hoje: ${p.aplicacao_atual}</p>` : ""}
          </div>
        `).join("")}
        <p class="hint" style="font-weight:700;margin:10px 0 2px;">Conclusão</p>
        <p style="font-size:13.5px;margin:0;">${data.conclusao}</p>
      </div>
      <button class="btn btn-ghost" id="btn-estudo-compartilhar" style="margin-bottom:8px;">📤 Compartilhar (WhatsApp, etc.)</button>
      <button class="btn btn-ghost" id="btn-estudo-imprimir">🖨️ Salvar como PDF / Imprimir</button>`;
    document.getElementById("btn-estudo-compartilhar").addEventListener("click", () =>
      compartilharTexto(data.titulo, textoCompartilhavelEstudo(data)));
    document.getElementById("btn-estudo-imprimir").addEventListener("click", () => window.print());
  }
}

// ---------- banner de divulgação (líder), gerado por IA (Gemini / Nano Banana Pro) ----------
function carregarImagemEl(src, crossOrigin) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function arquivoParaBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function carregarFontesBanner() {
  await Promise.all([document.fonts.load("700 30px Inter"), document.fonts.load("600 30px Inter")]);
}

// mede a luminosidade de uma faixa do banner, pra escolher cor de texto legível ali
function medirLuminosidadeFaixa(ctx, x, y, w, h) {
  try {
    const dados = ctx.getImageData(x, y, w, h).data;
    let soma = 0, n = 0;
    for (let i = 0; i < dados.length; i += 4 * 37) {
      soma += 0.299 * dados[i] + 0.587 * dados[i + 1] + 0.114 * dados[i + 2];
      n++;
    }
    return n ? soma / n : 128;
  } catch (e) {
    console.error("Não consegui medir a luminosidade do banner, usando padrão:", e);
    return 100;
  }
}

// a logo agora entra direto na arte pela própria IA (como imagem de referência); aqui só garantimos
// que o site da igreja sempre aparece, com um texto discreto e legível, sem caixa/pilula por cima
async function carimbarSiteNoBanner(canvas) {
  try {
    const site = state.igreja?.site_url;
    if (!site) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    await carregarFontesBanner();

    const alturaFaixa = Math.round(H * 0.06);
    const y = H - alturaFaixa;
    const luz = medirLuminosidadeFaixa(ctx, 0, y, W, alturaFaixa);
    const corTexto = luz < 130 ? "rgba(255,255,255,.92)" : "rgba(20,22,35,.88)";
    const corSombra = luz < 130 ? "rgba(0,0,0,.55)" : "rgba(255,255,255,.65)";

    ctx.font = `700 ${Math.round(W * 0.024)}px Inter, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const cx = W / 2, cy = H - H * 0.035;
    ctx.shadowColor = corSombra;
    ctx.shadowBlur = W * 0.01;
    ctx.fillStyle = corTexto;
    ctx.fillText(site, cx, cy);
    ctx.shadowBlur = 0;
    ctx.textAlign = "left";
  } catch (e) {
    console.error("Não consegui carimbar o site no banner:", e);
  }
}

async function arquivoUrlParaBase64(url) {
  const resposta = await fetch(url);
  const blob = await resposta.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function gerarBanners() {
  const tema = document.getElementById("banner-tema").value.trim();
  if (!tema) { alert("Digite pelo menos o tema do evento."); return; }
  const versiculo = document.getElementById("banner-versiculo").value.trim();
  const dataISO = document.getElementById("banner-data").value;
  const horario = document.getElementById("banner-horario").value.trim();
  const endereco = document.getElementById("banner-endereco").value.trim();
  const telefone = document.getElementById("banner-telefone").value.trim();
  const arquivo = document.getElementById("banner-imagem").files[0];

  const btn = document.getElementById("btn-gerar-banners");
  const status = document.getElementById("banner-gerando-status");
  btn.disabled = true; status.style.display = "block";
  try {
    const body = {
      tema, versiculo: versiculo || null,
      dataFormatada: dataISO ? formatarData(dataISO) : null,
      horario: horario || null, endereco: endereco || null, telefone: telefone || null,
      nomeIgreja: state.igreja?.nome || null,
    };
    if (arquivo) { body.fotoBase64 = await arquivoParaBase64(arquivo); body.fotoMimeType = arquivo.type; }
    try {
      body.logoBase64 = await arquivoUrlParaBase64("assets/logo-claro.png");
      body.logoMimeType = "image/png";
    } catch (e) { console.error("Não consegui carregar a logo pra mandar como referência:", e); }

    const { data, error } = await sb.functions.invoke("igr-gerar-banner-ia", { body });
    if (error || !data?.ok) throw new Error(data?.error || error?.message || "erro desconhecido");

    const imagem = await carregarImagemEl(`data:${data.mimeType};base64,${data.imagemBase64}`);
    const canvas = document.getElementById("banner-canvas-preview");
    canvas.width = imagem.naturalWidth; canvas.height = imagem.naturalHeight;
    canvas.getContext("2d").drawImage(imagem, 0, 0);
    await carimbarSiteNoBanner(canvas);

    document.getElementById("banner-view-form").style.display = "none";
    document.getElementById("banner-view-preview").style.display = "block";
  } catch (e) {
    console.error("Erro ao gerar banner:", e);
    alert(e.message && e.message !== "erro desconhecido" ? e.message : "Não deu pra gerar o banner agora. Tenta de novo em instantes.");
  } finally {
    btn.disabled = false; status.style.display = "none";
  }
}

function baixarBanner() {
  const canvas = document.getElementById("banner-canvas-preview");
  canvas.toBlob(blob => {
    if (!blob) { alert("Não deu pra baixar. Tenta de novo."); return; }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `banner-${Date.now()}.jpg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, "image/jpeg", 0.92);
}

async function aprovarBanner() {
  const canvas = document.getElementById("banner-canvas-preview");
  const btn = document.getElementById("btn-banner-aprovar");
  btn.disabled = true; btn.textContent = "Publicando...";
  canvas.toBlob(async blob => {
    if (!blob) { alert("Não deu pra publicar. Tenta de novo."); btn.disabled = false; btn.textContent = "✅ Aprovar e publicar pro grupo"; return; }
    const arquivo = new File([blob], `banner-${Date.now()}.jpg`, { type: "image/jpeg" });
    const imagem_url = await uploadArquivo(arquivo, "avisos");
    const tema = document.getElementById("banner-tema").value.trim();
    const dataISO = document.getElementById("banner-data").value;
    const horario = document.getElementById("banner-horario").value.trim();
    const endereco = document.getElementById("banner-endereco").value.trim();
    const telefone = document.getElementById("banner-telefone").value.trim();
    const partesTexto = [];
    if (dataISO || horario) partesTexto.push(`📅 ${dataISO ? formatarData(dataISO) : ""}${horario ? " • 🕒 " + horario : ""}`.trim());
    if (endereco) partesTexto.push(`📍 ${endereco}`);
    if (telefone) partesTexto.push(`📞 ${telefone}`);
    const texto = partesTexto.join("\n");
    const { error } = await sb.from("igr_avisos").insert({
      igreja_id: state.igreja.id, titulo: tema, texto, imagem_url,
      grupo_id: state.membro.grupo_id, criado_por_membro_id: state.membro.id,
    });
    btn.disabled = false; btn.textContent = "✅ Aprovar e publicar pro grupo";
    if (error) { alert("Não deu pra publicar agora. Tenta de novo."); return; }
    enviarPush({ tipo: "grupo", grupo_id: state.membro.grupo_id }, tema, texto);
    alert("Banner publicado no grupo! 🎉");
    document.getElementById("banner-tema").value = "";
    document.getElementById("banner-data").value = "";
    document.getElementById("banner-horario").value = "";
    document.getElementById("banner-endereco").value = "";
    document.getElementById("banner-telefone").value = "";
    document.getElementById("banner-imagem").value = "";
    document.getElementById("banner-view-preview").style.display = "none";
    document.getElementById("banner-view-form").style.display = "block";
    mostrarTela("tela-membro-home");
  }, "image/jpeg", 0.92);
}

async function carregarCalendario() {
  document.getElementById("calendario-voltar").dataset.nav = state.membro ? "tela-membro-home" : "tela-visitante";
  const btnAdd = document.getElementById("btn-add-calendario");
  const podeAdicionar = !!(state.membro?.eh_lider);
  if (btnAdd) btnAdd.style.display = podeAdicionar ? "block" : "none";

  const { data } = await sb.from("igr_calendario_eventos").select("*, igr_grupos(nome)")
    .eq("igreja_id", state.igreja.id).order("data").order("horario");
  state.calendarioEventos = data || [];

  if (!state.calendarioMesAtual) {
    const hoje = new Date();
    state.calendarioMesAtual = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  }
  document.getElementById("calendario-view-dia").style.display = "none";
  document.getElementById("calendario-view-mes").style.display = "block";
  renderGradeCalendario();
}

function renderGradeCalendario() {
  const mesRef = state.calendarioMesAtual;
  const meses = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  document.getElementById("cal-mes-titulo").textContent = `${meses[mesRef.getMonth()]} ${mesRef.getFullYear()}`;
  document.getElementById("cal-dias-semana").innerHTML = ["D","S","T","Q","Q","S","S"].map(d => `<span>${d}</span>`).join("");

  const eventosPorDia = {};
  (state.calendarioEventos || []).forEach(ev => {
    const inicio = new Date(ev.data + "T00:00:00");
    const fim = ev.data_fim ? new Date(ev.data_fim + "T00:00:00") : inicio;
    for (let d = new Date(inicio); d <= fim; d.setDate(d.getDate() + 1)) {
      const iso = d.toISOString().slice(0, 10);
      if (!diaBateComSemana(iso, ev.dia_semana)) continue; // pula dias que nao sao o dia da semana escolhido
      eventosPorDia[iso] = (eventosPorDia[iso] || 0) + 1;
    }
  });

  const primeiroDia = new Date(mesRef.getFullYear(), mesRef.getMonth(), 1);
  const ultimoDia = new Date(mesRef.getFullYear(), mesRef.getMonth() + 1, 0);
  const offset = primeiroDia.getDay();
  const hojeStr = new Date().toISOString().slice(0, 10);

  const celulas = [];
  for (let i = 0; i < offset; i++) celulas.push("");
  for (let dia = 1; dia <= ultimoDia.getDate(); dia++) celulas.push(dia);

  document.getElementById("cal-grade-mes").innerHTML = celulas.map(dia => {
    if (!dia) return `<div></div>`;
    const dataISO = `${mesRef.getFullYear()}-${String(mesRef.getMonth() + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
    const temEvento = !!eventosPorDia[dataISO];
    const ehHoje = dataISO === hojeStr;
    return `
      <button data-dia-calendario="${dataISO}" style="aspect-ratio:1;border-radius:10px;border:1.5px solid ${ehHoje ? "var(--brand)" : "var(--line)"};background:${temEvento ? "var(--brand-soft)" : "#fff"};font-size:13px;font-weight:${temEvento ? "700" : "400"};color:${temEvento ? "var(--brand)" : "var(--ink)"};cursor:pointer;position:relative;">
        ${dia}
        ${temEvento ? `<span style="position:absolute;bottom:4px;left:50%;transform:translateX(-50%);width:5px;height:5px;border-radius:50%;background:var(--coral);"></span>` : ""}
      </button>
    `;
  }).join("");

  document.querySelectorAll("[data-dia-calendario]").forEach(btn => {
    btn.addEventListener("click", () => abrirDiaCalendario(btn.dataset.diaCalendario));
  });

  // legenda: lista curta do que tem em cada dia marcado nesse mes
  const mesStr = `${mesRef.getFullYear()}-${String(mesRef.getMonth() + 1).padStart(2, "0")}`;
  const itensLegenda = (state.calendarioEventos || [])
    .filter(ev => {
      const fim = ev.data_fim || ev.data;
      // aparece na legenda do mes se o periodo do evento cruza esse mes
      return ev.data.slice(0, 7) <= mesStr && fim.slice(0, 7) >= mesStr;
    })
    .sort((a, b) => a.data.localeCompare(b.data));
  const legendaEl = document.getElementById("cal-legenda-mes");
  legendaEl.innerHTML = itensLegenda.map(ev => {
    const diaExibir = ev.data.slice(0, 7) === mesStr ? new Date(ev.data + "T00:00:00").getDate() : 1;
    const infoDia = ev.dia_semana && DIA_SEMANA_INFO[ev.dia_semana];
    return `<div data-legenda-dia="${ev.data.slice(0, 7) === mesStr ? ev.data : `${mesStr}-01`}" style="display:flex;gap:8px;padding:8px 4px;border-bottom:1px solid var(--line);cursor:pointer;">
      <b style="color:var(--brand);flex:none;width:26px;">${String(diaExibir).padStart(2, "0")}</b>
      <span style="font-size:13px;">${ev.titulo}${infoDia ? ` <span class="hint" style="font-size:11.5px;">(${infoDia.plural})</span>` : ""}</span>
    </div>`;
  }).join("") || `<p class="hint" style="padding:6px 4px;">Nada marcado nesse mês.</p>`;
  legendaEl.querySelectorAll("[data-legenda-dia]").forEach(el => {
    el.addEventListener("click", () => abrirDiaCalendario(el.dataset.legendaDia));
  });
}

function abrirDiaCalendario(dataISO) {
  document.getElementById("calendario-view-mes").style.display = "none";
  document.getElementById("calendario-view-dia").style.display = "block";
  document.getElementById("cal-dia-titulo").textContent = formatarData(dataISO);

  const eventosDoDia = (state.calendarioEventos || []).filter(ev => {
    const fim = ev.data_fim || ev.data;
    return dataISO >= ev.data && dataISO <= fim && diaBateComSemana(dataISO, ev.dia_semana);
  });
  const el = document.getElementById("calendario-lista");
  el.innerHTML = eventosDoDia.map(ev => `
    <div class="card">
      ${ev.imagem_url ? `<img class="capa-thumb" src="${ev.imagem_url}" alt="">` : ""}
      <b style="font-size:14.5px;">${ev.titulo}</b>
      <p style="margin:6px 0 0;font-size:13px;color:var(--ink-soft);">📍 ${ev.local}${ev.horario ? " · " + ev.horario : ""}</p>
      ${(ev.data_fim && ev.data_fim !== ev.data) || ev.dia_semana ? `<p class="hint" style="margin:4px 0 0;">📅 ${formatarPeriodoCalendario(ev.data, ev.data_fim, ev.dia_semana)}</p>` : ""}
      ${ev.igr_grupos?.nome ? `<span class="badge-inline" style="margin-top:6px;">${ev.igr_grupos.nome}</span>` : `<span class="badge-inline" style="margin-top:6px;">Igreja toda</span>`}
      ${ev.observacoes ? `<p style="margin:6px 0 0;font-size:12.5px;">${ev.observacoes}</p>` : ""}
      <button class="btn btn-ghost" data-add-agenda-calendario="${ev.id}" style="width:auto;padding:7px 14px;font-size:12px;margin-top:10px;">📲 Adicionar na minha agenda</button>
    </div>
  `).join("") || `<div class="empty">Nada marcado pra esse dia.</div>`;

  el.querySelectorAll("[data-add-agenda-calendario]").forEach(btn => {
    btn.addEventListener("click", () => {
      const ev = eventosDoDia.find(e => e.id === btn.dataset.addAgendaCalendario);
      if (ev) adicionarCalendarioAgenda(ev.titulo, ev.data, ev.data_fim, ev.horario, ev.local, ev.observacoes);
    });
  });
}

async function enviarCalendario(ev) {
  ev.preventDefault();
  const titulo = document.getElementById("cal-titulo").value.trim();
  const local = document.getElementById("cal-local").value.trim();
  const data = document.getElementById("cal-data").value;
  const data_fim = document.getElementById("cal-data-fim").value || null;
  const dia_semana = document.getElementById("cal-dia-semana").value || null;
  const horario = document.getElementById("cal-horario").value.trim();
  const observacoes = document.getElementById("cal-observacoes").value.trim();
  if (!titulo || !local || !data) return;

  const btn = ev.target.querySelector("button[type=submit]");
  btn.disabled = true; btn.textContent = "Salvando...";
  const arquivo = document.getElementById("cal-imagem").files[0];
  const imagem_url = await uploadArquivo(arquivo, "calendario");
  const { error } = await sb.from("igr_calendario_eventos").insert({
    igreja_id: state.igreja.id, grupo_id: state.membro?.grupo_id || null,
    criado_por_membro_id: state.membro?.id || null, criado_por_nome: state.membro?.nome_completo || null,
    titulo, local, data, data_fim, dia_semana, horario: horario || null, observacoes: observacoes || null, imagem_url,
  });
  btn.disabled = false; btn.textContent = "Salvar no calendário";
  if (error) { alert("Não deu pra salvar: " + error.message); return; }

  ev.target.reset();
  document.getElementById("form-calendario-add").style.display = "none";
  carregarCalendario();

  if (state.membro?.grupo_id) {
    const { data: membrosDoGrupo } = await sb.from("igr_membros").select("id").eq("grupo_id", state.membro.grupo_id);
    const ids = (membrosDoGrupo || []).map(m => m.id).filter(id => id !== state.membro.id);
    if (ids.length) {
      enviarPush({ tipo: "membros", membro_ids: ids }, `Novo compromisso: ${titulo}`, `📍 ${local} · ${formatarData(data)}${horario ? " às " + horario : ""}`);
    }
  }
}

async function enviarCalendarioAdmin() {
  const titulo = document.getElementById("adm-cal-titulo").value.trim();
  const local = document.getElementById("adm-cal-local").value.trim();
  const data = document.getElementById("adm-cal-data").value;
  const data_fim = document.getElementById("adm-cal-data-fim").value || null;
  const dia_semana = document.getElementById("adm-cal-dia-semana").value || null;
  const horario = document.getElementById("adm-cal-horario").value.trim();
  const observacoes = document.getElementById("adm-cal-observacoes").value.trim();
  if (!titulo || !local || !data) { alert("Preencha título, local e data."); return; }

  const btn = document.getElementById("btn-adm-add-calendario");
  btn.disabled = true; btn.textContent = "Publicando...";
  const arquivo = document.getElementById("adm-cal-imagem").files[0];
  const imagem_url = await uploadArquivo(arquivo, "calendario");
  const { error } = await sb.from("igr_calendario_eventos").insert({
    igreja_id: state.igreja.id, grupo_id: null,
    criado_por_nome: state.adminNome || "Administração",
    titulo, local, data, data_fim, dia_semana, horario: horario || null, observacoes: observacoes || null, imagem_url,
  });
  btn.disabled = false; btn.textContent = "Publicar e notificar todo mundo";
  if (error) { alert("Não deu pra publicar: " + error.message); return; }

  document.getElementById("adm-cal-titulo").value = "";
  document.getElementById("adm-cal-local").value = "";
  document.getElementById("adm-cal-data").value = "";
  document.getElementById("adm-cal-data-fim").value = "";
  document.getElementById("adm-cal-dia-semana").value = "";
  document.getElementById("adm-cal-horario").value = "";
  document.getElementById("adm-cal-observacoes").value = "";
  document.getElementById("adm-cal-imagem").value = "";
  enviarPush({ tipo: "todos" }, `Novo compromisso: ${titulo}`, `📍 ${local} · ${formatarData(data)}${horario ? " às " + horario : ""}`);
  alert("Publicado! Notificação enviada a todos os membros.");
}

async function carregarEventos() {
  document.getElementById("eventos-voltar").dataset.nav = state.membro ? "tela-membro-home" : "tela-visitante";
  const btnCriar = document.getElementById("btn-criar-evento");
  if (btnCriar) btnCriar.style.display = podeGerenciarEventos() ? "block" : "none";

  const hoje = new Date().toISOString().slice(0, 10);
  const { data } = await sb.from("igr_eventos").select("*, igr_eventos_inscricoes(count)")
    .eq("igreja_id", state.igreja.id).gte("data", hoje).order("data");
  state.eventosCache = data || [];

  document.getElementById("eventos-lista").innerHTML = (data || []).map(ev => {
    const inscritos = ev.igr_eventos_inscricoes?.[0]?.count || 0;
    const vagasTexto = ev.vagas_maximas ? `${inscritos}/${ev.vagas_maximas} vagas` : `${inscritos} inscritos`;
    return `
    <div class="evento-card" data-evento="${ev.id}">
      <img src="${ev.banner_url || "assets/logo.png"}" alt="">
      <div class="info">
        <b>${ev.titulo}</b>
        <span>${formatarPeriodo(ev.data, ev.data_fim)}${ev.horario ? " · " + ev.horario : ""}</span>
        <span>${ev.local || ""}</span>
        <span>${vagasTexto}</span>
      </div>
    </div>`;
  }).join("") || `<div class="empty">Nenhum evento agendado no momento.</div>`;

  document.querySelectorAll("#eventos-lista [data-evento]").forEach(card => {
    card.addEventListener("click", () => abrirEventoDetalhe(card.dataset.evento));
  });
}

async function abrirEventoDetalhe(eventoId) {
  const { data: evento } = await sb.from("igr_eventos").select("*").eq("id", eventoId).single();
  if (!evento) return;

  if (evento.criado_por_membro_id) {
    const { data: organizador } = await sb.from("igr_membros").select("telefone").eq("id", evento.criado_por_membro_id).maybeSingle();
    evento.telefoneOrganizador = organizador?.telefone || null;
  }
  state.eventoAtual = evento;

  const banner = document.getElementById("evento-detalhe-banner");
  if (evento.banner_url) { banner.src = evento.banner_url; banner.style.display = "block"; } else { banner.style.display = "none"; }
  document.getElementById("evento-detalhe-titulo").textContent = evento.titulo;
  document.getElementById("evento-detalhe-info").textContent = `📅 ${formatarPeriodo(evento.data, evento.data_fim)}${evento.horario ? " às " + evento.horario : ""}${evento.local ? " · 📍 " + evento.local : ""}`;
  document.getElementById("evento-detalhe-descricao").textContent = evento.descricao || "";

  const { count: inscritos } = await sb.from("igr_eventos_inscricoes").select("id", { count: "exact", head: true }).eq("evento_id", eventoId);
  const totalInscritos = inscritos || 0;
  let vagasTexto = `${totalInscritos} inscrito(s)`;
  if (evento.vagas_minimas) vagasTexto += totalInscritos < evento.vagas_minimas ? ` · faltam ${evento.vagas_minimas - totalInscritos} pro mínimo` : " · mínimo atingido ✓";
  if (evento.vagas_maximas) vagasTexto += ` · ${Math.max(evento.vagas_maximas - totalInscritos, 0)} vaga(s) restante(s)`;
  document.getElementById("evento-detalhe-vagas").textContent = vagasTexto;

  const pagBox = document.getElementById("evento-detalhe-pagamento");
  if (evento.gratuito === false) {
    pagBox.style.display = "block";
    document.getElementById("evento-pagamento-valor").textContent = evento.valor || "a combinar";
    const pixEl = document.getElementById("evento-pagamento-pix");
    if (evento.pix_chave) { pixEl.textContent = "🔑 Chave PIX: " + evento.pix_chave; pixEl.style.display = "block"; }
    else { pixEl.style.display = "none"; }
    const linkEl = document.getElementById("evento-pagamento-link");
    if (evento.link_pagamento) { linkEl.href = evento.link_pagamento; linkEl.style.display = "inline-flex"; }
    else { linkEl.style.display = "none"; }
  } else {
    pagBox.style.display = "none";
  }

  document.getElementById("evento-detalhe-gerenciar").style.display = podeEditarEvento(evento) ? "block" : "none";

  const lotado = evento.vagas_maximas && totalInscritos >= evento.vagas_maximas;
  esconderCartoesInscricaoEvento();

  if (lotado) {
    document.getElementById("evento-inscricao-box").innerHTML = `<div class="card empty">Esse evento já está com as vagas esgotadas.</div>`;
    mostrarTela("tela-evento-detalhe");
    return;
  }

  if (state.membro) {
    const { data: jaInscrito, error: erroCheck } = await sb.from("igr_eventos_inscricoes").select("id").eq("evento_id", eventoId).eq("membro_id", state.membro.id).maybeSingle();
    if (erroCheck) {
      // sessão de membro inválida (ex: conta apagada) — trata como visitante
      console.error("Sessão de membro inválida ao checar inscrição:", erroCheck);
    } else if (jaInscrito) {
      mostrarConfirmacaoInscricao(evento);
      mostrarTela("tela-evento-detalhe");
      return;
    }
  }
  document.getElementById("btn-abrir-inscricao").style.display = "block";
  mostrarTela("tela-evento-detalhe");
}

function esconderCartoesInscricaoEvento() {
  ["evento-card-escolha", "evento-card-membro", "evento-card-login-necessario", "evento-card-visitante", "evento-card-confirmado"]
    .forEach(id => { const el = document.getElementById(id); if (el) el.style.display = "none"; });
  document.getElementById("btn-abrir-inscricao").style.display = "none";
}

function abrirEscolhaInscricao() {
  esconderCartoesInscricaoEvento();
  document.getElementById("evento-card-escolha").style.display = "block";
}

function escolherSouMembro() {
  esconderCartoesInscricaoEvento();
  if (state.membro) {
    document.getElementById("evento-card-membro").style.display = "block";
  } else {
    document.getElementById("evento-card-login-necessario").style.display = "block";
  }
}

function escolherSouVisitante() {
  esconderCartoesInscricaoEvento();
  document.getElementById("evento-card-visitante").style.display = "block";
}

function mostrarConfirmacaoInscricao(evento) {
  esconderCartoesInscricaoEvento();
  document.getElementById("evento-card-confirmado").style.display = "block";
  const msg = `Oi! Me inscrevi no evento "${evento.titulo}" (${formatarPeriodo(evento.data, evento.data_fim)}). Confirmando minha presença!${evento.gratuito === false ? " Vou te enviar o comprovante de pagamento por aqui também 💛" : " 💛"}`;
  const destino = evento.telefoneOrganizador || state.igreja?.whatsapp_contato || "";
  document.getElementById("btn-whatsapp-confirmacao").href = linkWhatsapp(destino, msg);
  const tituloConf = document.getElementById("evento-confirmado-titulo");
  const textoConf = document.getElementById("evento-confirmado-texto");
  if (evento.gratuito === false) {
    tituloConf.textContent = "Inscrição registrada! 🎉";
    textoConf.textContent = "Falta só confirmar o pagamento — os dados estão acima. Toque no botão abaixo pra mandar a confirmação e o comprovante pro organizador.";
  } else {
    tituloConf.textContent = "Inscrição confirmada! 🎉";
    textoConf.textContent = "Te esperamos lá.";
  }
}

async function inscreverMembroEvento() {
  const evento = state.eventoAtual;
  const btn = document.getElementById("btn-inscrever-membro");
  btn.disabled = true; btn.textContent = "Inscrevendo...";
  try {
    const { error } = await sb.from("igr_eventos_inscricoes").insert({
      evento_id: evento.id, membro_id: state.membro.id,
      nome: state.membro.nome_completo, telefone: state.membro.telefone,
      data_nascimento: state.membro.data_nascimento || null,
    });
    if (error) {
      if (error.code === "23503") {
        alert("Sua sessão de membro não é mais válida (a conta pode ter sido removida). Saia e entre de novo, ou se inscreva como visitante.");
        sair();
        return;
      }
      alert("Não deu pra inscrever agora: " + error.message);
      return;
    }
    enviarPush({ tipo: "membros", membro_ids: [state.membro.id] }, "Inscrição confirmada! 🎉", `Você está inscrito(a) em "${evento.titulo}" — ${formatarPeriodo(evento.data, evento.data_fim)}.`);
    await avisarLiderPorIdadeEGenero(evento, state.membro.data_nascimento, state.membro.genero, state.membro.nome_completo);
    mostrarConfirmacaoInscricao(evento);
  } catch (e) {
    console.error("Erro ao inscrever membro:", e);
    alert("Não deu pra inscrever agora. Verifique sua conexão e tente de novo.");
  } finally {
    btn.disabled = false; btn.textContent = "Confirmar inscrição";
  }
}

async function inscreverVisitanteEvento(ev) {
  ev.preventDefault();
  const evento = state.eventoAtual;
  const nome = document.getElementById("evi-nome").value.trim();
  const telefone = limparTelefone(document.getElementById("evi-telefone").value);
  const data_nascimento = document.getElementById("evi-nascimento").value || null;
  const genero = document.getElementById("evi-genero").value || null;
  if (!nome || !telefone) return;
  const btn = ev.target.querySelector("button[type=submit]");
  btn.disabled = true; btn.textContent = "Inscrevendo...";
  try {
    const { error } = await sb.from("igr_eventos_inscricoes").insert({ evento_id: evento.id, nome, telefone, data_nascimento });
    if (error) { alert("Não deu pra inscrever agora: " + error.message); return; }
    await avisarLiderPorIdadeEGenero(evento, data_nascimento, genero, nome);
    mostrarConfirmacaoInscricao(evento);
  } catch (e) {
    console.error("Erro ao inscrever visitante:", e);
    alert("Não deu pra inscrever agora. Verifique sua conexão e tente de novo.");
  } finally {
    btn.disabled = false; btn.textContent = "Inscrever-se";
  }
}

async function avisarLiderPorIdadeEGenero(evento, dataNascimento, genero, nomePessoa) {
  if (!dataNascimento) return;
  const idade = calcularIdade(dataNascimento);
  let categoria = null;
  if (idade >= 4 && idade <= 10) categoria = "crianca";
  else if (idade >= 11 && idade <= 13) categoria = "juniores";
  else if (idade >= 14 && idade <= 17) categoria = "jovem";
  else if (idade >= 18 && genero === "M") categoria = "homens";
  else if (idade >= 18 && genero === "F") categoria = "mulheres";
  if (!categoria) return;
  const grupo = state.grupos.find(g => g.categoria === categoria);
  if (!grupo) return;
  const { data: lideres } = await sb.from("igr_membros").select("id").eq("grupo_id", grupo.id).eq("eh_lider", true);
  if (lideres && lideres.length) {
    enviarPush({ tipo: "membros", membro_ids: lideres.map(l => l.id) },
      "Inscrição em evento 🎉", `${nomePessoa.split(" ")[0]} (${idade} anos) se inscreveu em "${evento.titulo}" — talvez valha entrar em contato.`);
  }
}

// ---------- eventos: criar/editar ----------
function abrirFormEvento(evento) {
  state.editandoEvento = evento || null;
  document.getElementById("evento-form-titulo").textContent = evento ? "Editar evento" : "Novo evento";
  document.getElementById("voltar-evento-form").onclick = () => {
    if (state.adminNome) { mostrarTela("tela-admin-painel"); abrirSecaoAdmin("eventos"); }
    else { mostrarTela("tela-eventos"); carregarEventos(); }
  };
  document.getElementById("ev-titulo").value = evento?.titulo || "";
  document.getElementById("ev-descricao").value = evento?.descricao || "";
  document.getElementById("ev-local").value = evento?.local || "";
  definirValorData("ev-data", evento?.data);
  definirValorData("ev-data-fim", evento?.data_fim);
  document.getElementById("ev-horario").value = evento?.horario || "";
  document.getElementById("ev-vagas-min").value = evento?.vagas_minimas || "";
  document.getElementById("ev-vagas-max").value = evento?.vagas_maximas || "";
  const ehGratuito = evento ? evento.gratuito !== false : true;
  document.getElementById("ev-gratuito").value = ehGratuito ? "sim" : "nao";
  document.getElementById("ev-pagamento-detalhes").style.display = ehGratuito ? "none" : "block";
  document.getElementById("ev-valor").value = evento?.valor || "";
  document.getElementById("ev-pix").value = evento?.pix_chave || "";
  document.getElementById("ev-link-pagamento").value = evento?.link_pagamento || "";
  document.getElementById("ev-erro").classList.remove("show");
  mostrarTela("tela-evento-form");
}

async function enviarFormEvento(ev) {
  ev.preventDefault();
  const titulo = document.getElementById("ev-titulo").value.trim();
  const descricao = document.getElementById("ev-descricao").value.trim();
  const local = document.getElementById("ev-local").value.trim();
  const data = document.getElementById("ev-data").value;
  const data_fim = document.getElementById("ev-data-fim").value || null;
  const horario = document.getElementById("ev-horario").value.trim();
  const vagas_minimas = parseInt(document.getElementById("ev-vagas-min").value, 10) || null;
  const vagas_maximas = parseInt(document.getElementById("ev-vagas-max").value, 10) || null;
  const gratuito = document.getElementById("ev-gratuito").value === "sim";
  const valor = gratuito ? null : document.getElementById("ev-valor").value.trim() || null;
  const pix_chave = gratuito ? null : document.getElementById("ev-pix").value.trim() || null;
  const link_pagamento = gratuito ? null : document.getElementById("ev-link-pagamento").value.trim() || null;
  const errEl = document.getElementById("ev-erro");
  errEl.classList.remove("show");

  if (!titulo || !data) {
    errEl.textContent = "Preencha ao menos título e data.";
    errEl.classList.add("show");
    return;
  }
  if (data_fim && data_fim < data) {
    errEl.textContent = "A data de término não pode ser antes da data de início.";
    errEl.classList.add("show");
    return;
  }
  if (!state.igreja) { errEl.textContent = "Ainda carregando os dados da igreja. Tente de novo em instantes."; errEl.classList.add("show"); return; }

  const btn = ev.target.querySelector("button[type=submit]");
  btn.disabled = true; btn.textContent = "Salvando...";
  try {
    const arquivo = document.getElementById("ev-banner").files[0];
    const novoBanner = await uploadArquivo(arquivo, "eventos");
    const editando = state.editandoEvento;
    const campos = { titulo, descricao, local, data, data_fim, horario, vagas_minimas, vagas_maximas, gratuito, valor, pix_chave, link_pagamento };
    let eventoId = editando?.id;
    let bannerFinal = novoBanner;

    if (editando) {
      const banner_url = novoBanner || editando.banner_url || null;
      bannerFinal = banner_url;
      const { error } = await sb.from("igr_eventos").update({ ...campos, banner_url }).eq("id", editando.id);
      if (error) { errEl.textContent = "Não deu pra salvar: " + error.message; errEl.classList.add("show"); return; }
    } else {
      const { data: novoEvento, error } = await sb.from("igr_eventos").insert({
        igreja_id: state.igreja.id, ...campos,
        banner_url: novoBanner,
        criado_por_membro_id: state.membro?.id || null,
        criado_por_nome: state.membro?.nome_completo || state.adminNome || null,
      }).select().single();
      if (error) { errEl.textContent = "Não deu pra criar: " + error.message; errEl.classList.add("show"); return; }
      eventoId = novoEvento?.id;
    }

    // sincroniza automaticamente com o Calendário da Igreja
    if (eventoId) {
      await sb.from("igr_calendario_eventos").upsert({
        evento_id: eventoId, igreja_id: state.igreja.id, grupo_id: null,
        titulo, local: local || "A definir", data, data_fim, horario: horario || null,
        observacoes: descricao || null, imagem_url: bannerFinal || null,
        criado_por_nome: state.membro?.nome_completo || state.adminNome || "Eventos",
      }, { onConflict: "evento_id" });
    }

    ev.target.reset();
    state.editandoEvento = null;
    if (state.adminNome) { mostrarTela("tela-admin-painel"); abrirSecaoAdmin("eventos"); }
    else { mostrarTela("tela-eventos"); await carregarEventos(); }
  } catch (e) {
    console.error("Erro ao salvar evento:", e);
    errEl.textContent = "Não deu pra salvar agora. Verifique sua conexão e tente de novo.";
    errEl.classList.add("show");
  } finally {
    btn.disabled = false; btn.textContent = "Salvar evento";
  }
}

// ---------- eventos: dashboard de inscritos ----------
async function abrirInscritosEvento(evento) {
  document.getElementById("inscritos-titulo-evento").textContent = "Inscritos — " + evento.titulo;
  document.getElementById("voltar-inscritos").onclick = () => {
    if (state.adminNome) { mostrarTela("tela-admin-painel"); abrirSecaoAdmin("eventos"); }
    else { mostrarTela("tela-evento-detalhe"); }
  };
  mostrarTela("tela-evento-inscritos");

  const { data } = await sb.from("igr_eventos_inscricoes").select("*").eq("evento_id", evento.id).order("created_at");
  const total = (data || []).length;
  const faltamMinimo = evento.vagas_minimas ? Math.max(evento.vagas_minimas - total, 0) : null;
  const vagasRestantes = evento.vagas_maximas ? Math.max(evento.vagas_maximas - total, 0) : null;

  document.getElementById("inscritos-dashboard").innerHTML = `
    <div class="dash-stat-row">
      <div class="dash-stat"><b>${total}</b><span>Inscritos</span></div>
      ${faltamMinimo !== null ? `<div class="dash-stat"><b>${faltamMinimo}</b><span>Faltam pro mínimo</span></div>` : ""}
      ${vagasRestantes !== null ? `<div class="dash-stat"><b>${vagasRestantes}</b><span>Vagas restantes</span></div>` : ""}
    </div>`;

  document.getElementById("inscritos-lista").innerHTML = (data || []).map(i => `
    <div class="dash-inscrito-item">
      <div><b>${i.nome}</b>${i.data_nascimento ? ` · ${calcularIdade(i.data_nascimento)} anos` : ""}</div>
      <span>${i.telefone}</span>
    </div>
  `).join("") || `<div class="empty">Ninguém se inscreveu ainda.</div>`;
}

async function carregarEventosAdmin() {
  const { data } = await sb.from("igr_eventos").select("*, igr_eventos_inscricoes(count)").eq("igreja_id", state.igreja.id).order("data", { ascending: false });
  state.eventosAdminCache = data || [];
  document.getElementById("admin-lista-eventos").innerHTML = (data || []).map(ev => {
    const inscritos = ev.igr_eventos_inscricoes?.[0]?.count || 0;
    return `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
        <div><b style="font-size:13.5px;">${ev.titulo}</b><br><span class="hint" style="margin:0;">${formatarPeriodo(ev.data, ev.data_fim)} · ${inscritos} inscritos${ev.criado_por_nome ? " · por " + ev.criado_por_nome : ""}</span></div>
        <div style="display:flex;gap:6px;flex:none;">
          <button class="btn btn-ghost" style="width:auto;padding:7px 12px;font-size:11.5px;" data-editar-evento="${ev.id}">Editar</button>
          <button class="btn btn-ghost" style="width:auto;padding:7px 12px;font-size:11.5px;" data-ver-inscritos-admin="${ev.id}">Inscritos</button>
          <button class="btn btn-ghost" style="width:auto;padding:7px 12px;font-size:11.5px;" data-del-evento="${ev.id}">Excluir</button>
        </div>
      </div>
    </div>`;
  }).join("") || `<div class="empty">Nenhum evento cadastrado.</div>`;

  document.querySelectorAll("[data-del-evento]").forEach(b => b.addEventListener("click", () => excluirRegistro("igr_eventos", b.dataset.delEvento, carregarEventosAdmin)));
  document.querySelectorAll("[data-editar-evento]").forEach(b => b.addEventListener("click", () => {
    const evento = state.eventosAdminCache.find(e => e.id === b.dataset.editarEvento);
    if (evento) abrirFormEvento(evento);
  }));
  document.querySelectorAll("[data-ver-inscritos-admin]").forEach(b => b.addEventListener("click", () => {
    const evento = state.eventosAdminCache.find(e => e.id === b.dataset.verInscritosAdmin);
    if (evento) abrirInscritosEvento(evento);
  }));
}

// ---------- diretório de membros ----------
function configurarDiretorio() {
  const input = document.getElementById("dir-busca");
  if (!input || input.dataset.wired) return;
  input.dataset.wired = "1";
  let timeoutId = null;
  input.addEventListener("input", () => {
    clearTimeout(timeoutId);
    const termo = input.value.trim();
    if (termo.length < 2) { document.getElementById("dir-resultados").innerHTML = ""; return; }
    timeoutId = setTimeout(() => buscarDiretorio(termo), 350);
  });
}
async function buscarDiretorio(termo) {
  const el = document.getElementById("dir-resultados");
  el.innerHTML = `<p class="hint"><span class="loading-dot"></span></p>`;
  const { data } = await sb.from("igr_membros").select("id, nome_completo, foto_url, profissao, telefone")
    .eq("igreja_id", state.igreja.id)
    .or(`nome_completo.ilike.%${termo}%,profissao.ilike.%${termo}%`)
    .neq("id", state.membro?.id || "").limit(20);

  const { data: conexoes } = await sb.from("igr_membros_conexoes").select("conectado_id").eq("membro_id", state.membro.id);
  const jaConectados = new Set((conexoes || []).map(c => c.conectado_id));

  el.innerHTML = (data || []).map(m => {
    const meuNome = state.membro.nome_completo.split(" ")[0];
    const msgWhats = `Oi ${m.nome_completo.split(" ")[0]}! Aqui é ${meuNome}, te encontrei no Diretório de Membros do app da igreja 💛`;
    return `
    <div class="card row-avatar">
      ${m.foto_url ? `<img src="${m.foto_url}" style="width:44px;height:44px;border-radius:50%;object-fit:cover;flex:none;">` : avatarIniciais(m.nome_completo)}
      <div class="row-info"><b>${m.nome_completo}</b><span>${m.profissao || "Membro da igreja"}</span></div>
      ${jaConectados.has(m.id)
        ? `<a class="btn btn-primary" style="width:auto;padding:8px 14px;font-size:12px;flex:none;" href="${linkWhatsapp(m.telefone, msgWhats)}" target="_blank" rel="noopener">Chamar no WhatsApp</a>`
        : `<button class="btn btn-ghost" style="width:auto;padding:8px 14px;font-size:12px;flex:none;" data-conectar="${m.id}" data-nome="${m.nome_completo}" data-telefone="${m.telefone || ""}">Conectar</button>`}
    </div>`;
  }).join("") || `<div class="empty">Ninguém encontrado com esse termo.</div>`;

  el.querySelectorAll("[data-conectar]").forEach(btn => {
    btn.addEventListener("click", async () => {
      btn.disabled = true; btn.textContent = "Conectando...";
      const outroId = btn.dataset.conectar;
      const { error } = await sb.from("igr_membros_conexoes").insert({ membro_id: state.membro.id, conectado_id: outroId });
      if (error) { alert("Não deu pra conectar agora."); btn.disabled = false; btn.textContent = "Conectar"; return; }
      await sb.from("igr_membros_conexoes").insert({ membro_id: outroId, conectado_id: state.membro.id });
      const meuNome = state.membro.nome_completo.split(" ")[0];
      enviarPush({ tipo: "membros", membro_ids: [outroId] }, "Nova conexão 🤝", `${meuNome} se conectou com você no Diretório de Membros.`);
      const msgWhats = `Oi ${btn.dataset.nome.split(" ")[0]}! Aqui é ${meuNome}, te encontrei no Diretório de Membros do app da igreja 💛`;
      btn.outerHTML = `<a class="btn btn-primary" style="width:auto;padding:8px 14px;font-size:12px;flex:none;" href="${linkWhatsapp(btn.dataset.telefone, msgWhats)}" target="_blank" rel="noopener">Chamar no WhatsApp</a>`;
    });
  });
}

// ---------- fotos ----------
async function carregarAlbuns() {
  document.getElementById("fotos-voltar").onclick = () => mostrarTela(state.membro ? "tela-membro-home" : "tela-visitante");
  document.getElementById("btn-ver-minhas-fotos").style.display = state.membro ? "block" : "none";
  const { data } = await sb.from("igr_fotos_albuns").select("*").eq("igreja_id", state.igreja.id).order("created_at", { ascending: false });
  state.albunsPublicoCache = data || [];
  const el = document.getElementById("lista-albuns");
  el.innerHTML = `<div class="albuns-lista">${(data || []).map(a => `
    <div class="album-card" data-album="${a.id}">
      <img src="${a.capa_url || "assets/logo.png"}" alt="">
      <div class="info"><b>${a.titulo}</b><span>${a.data ? formatarData(a.data) : ""}</span></div>
    </div>
  `).join("") || `<div class="empty">Nenhum álbum publicado ainda.</div>`}</div>`;
  el.querySelectorAll("[data-album]").forEach(card => {
    card.addEventListener("click", () => abrirAlbum(card.dataset.album));
  });
}
async function carregarFotosPreviewVisitante() {
  const el = document.getElementById("visitante-fotos-preview");
  if (!el) return;
  const { data } = await sb.from("igr_fotos_albuns").select("*").eq("igreja_id", state.igreja.id).order("created_at", { ascending: false }).limit(1);
  const album = (data || [])[0];
  if (!album) { el.innerHTML = `<div class="empty">Nenhuma foto publicada ainda.</div>`; return; }
  el.innerHTML = `
    <div class="album-card" data-album="${album.id}">
      <img src="${album.capa_url || "assets/logo.png"}" alt="">
      <div class="info"><b>${album.titulo}</b><span>${album.data ? formatarData(album.data) : ""}</span></div>
    </div>`;
  el.querySelector("[data-album]").addEventListener("click", async () => {
    mostrarTela("tela-fotos");
    await carregarAlbuns();
    abrirAlbum(album.id);
  });
}
async function abrirAlbum(albumId) {
  const album = (state.albunsPublicoCache || []).find(a => a.id === albumId) || {};
  document.getElementById("album-titulo-detalhe").textContent = album.titulo || "";
  document.getElementById("album-data-detalhe").textContent = album.data ? formatarData(album.data) : "";
  mostrarTela("tela-fotos-album");
  const { data: fotos } = await sb.from("igr_fotos").select("*").eq("album_id", albumId).order("created_at");
  state.fotosAlbumAtual = fotos || [];
  document.getElementById("grid-fotos-album").innerHTML = (fotos || []).map((f, i) => `
    <div class="foto-item" data-foto-idx="${i}">
      <img src="${f.url}" alt="">
    </div>
  `).join("") || `<div class="empty">Nenhuma foto neste álbum ainda.</div>`;
  document.querySelectorAll("[data-foto-idx]").forEach(el => {
    el.addEventListener("click", () => abrirLightbox(parseInt(el.dataset.fotoIdx, 10)));
  });
}

// ---------- fotos: minhas fotos marcadas ----------
async function carregarMinhasFotos() {
  const el = document.getElementById("grid-minhas-fotos");
  if (!state.membro) { el.innerHTML = `<div class="empty">Entre como membro pra ver suas fotos marcadas.</div>`; return; }
  el.innerHTML = `<p class="hint"><span class="loading-dot"></span> carregando...</p>`;
  const { data } = await sb.from("igr_fotos_marcacoes").select("igr_fotos(id, url, album_id)").eq("membro_id", state.membro.id);
  const fotos = (data || []).map(d => d.igr_fotos).filter(Boolean);
  state.fotosAlbumAtual = fotos;
  el.innerHTML = fotos.map((f, i) => `
    <div class="foto-item" data-foto-idx="${i}"><img src="${f.url}" alt=""></div>
  `).join("") || `<div class="empty">Nenhuma foto marcada com você ainda.</div>`;
  el.querySelectorAll("[data-foto-idx]").forEach(elx => {
    elx.addEventListener("click", () => abrirLightbox(parseInt(elx.dataset.fotoIdx, 10)));
  });
}

// ---------- admin: marcar pessoas nas fotos ----------
function popularAlbunsParaMarcacao() {
  const select = document.getElementById("mf-album-selecionado");
  if (!select) return;
  const selecionadoAntes = select.value;
  select.innerHTML = `<option value="">Selecione um álbum</option>` +
    (state.albunsCache || []).map(a => `<option value="${a.id}">${a.titulo}</option>`).join("");
  if (selecionadoAntes) select.value = selecionadoAntes;
}
async function carregarFotosParaMarcacao(albumId) {
  const grid = document.getElementById("mf-fotos-grid");
  document.getElementById("mf-marcar-painel").style.display = "none";
  if (!albumId) { grid.innerHTML = ""; return; }
  grid.innerHTML = `<p class="hint"><span class="loading-dot"></span></p>`;
  const { data } = await sb.from("igr_fotos").select("*").eq("album_id", albumId).order("created_at");
  state.mfFotosCache = data || [];
  grid.innerHTML = state.mfFotosCache.map((f, i) => `
    <div class="foto-item" data-mf-foto-idx="${i}"><img src="${f.url}" alt=""></div>
  `).join("") || `<div class="empty">Nenhuma foto neste álbum ainda.</div>`;
  grid.querySelectorAll("[data-mf-foto-idx]").forEach(elx => {
    elx.addEventListener("click", () => abrirPainelMarcacao(parseInt(elx.dataset.mfFotoIdx, 10)));
  });
}
async function abrirPainelMarcacao(idx) {
  const foto = state.mfFotosCache?.[idx];
  if (!foto) return;
  state.mfFotoAtual = foto;
  document.getElementById("mf-marcar-painel").style.display = "block";
  document.getElementById("mf-foto-preview").src = foto.url;
  document.getElementById("mf-busca-pessoa").value = "";
  document.getElementById("mf-sugestoes").style.display = "none";
  await carregarPessoasMarcadasNaFoto();
}
async function carregarPessoasMarcadasNaFoto() {
  const { data } = await sb.from("igr_fotos_marcacoes").select("id, igr_membros(nome_completo)").eq("foto_id", state.mfFotoAtual.id);
  const el = document.getElementById("mf-pessoas-marcadas");
  el.innerHTML = (data || []).map(m => `
    <span class="chip-pessoa" data-marcacao-id="${m.id}">${m.igr_membros?.nome_completo || "?"} <button type="button" data-remover-marcacao="${m.id}">×</button></span>
  `).join("") || `<p class="hint" style="margin:4px 0 0;">Ninguém marcado nesta foto ainda.</p>`;
  el.querySelectorAll("[data-remover-marcacao]").forEach(btn => {
    btn.addEventListener("click", async () => {
      await sb.from("igr_fotos_marcacoes").delete().eq("id", btn.dataset.removerMarcacao);
      carregarPessoasMarcadasNaFoto();
    });
  });
}
function configurarBuscaMarcacaoFoto() {
  const input = document.getElementById("mf-busca-pessoa");
  const sugestoesEl = document.getElementById("mf-sugestoes");
  if (!input) return;
  let timeoutId = null;
  input.addEventListener("input", () => {
    clearTimeout(timeoutId);
    const termo = input.value.trim();
    if (termo.length < 2) { sugestoesEl.style.display = "none"; return; }
    timeoutId = setTimeout(async () => {
      const { data } = await sb.from("igr_membros").select("id, nome_completo")
        .eq("igreja_id", state.igreja.id).ilike("nome_completo", `%${termo}%`).limit(6);
      sugestoesEl.innerHTML = (data || []).map(m => `<div class="autocomplete-item" data-id="${m.id}">${m.nome_completo}</div>`).join("");
      sugestoesEl.style.display = data?.length ? "block" : "none";
      sugestoesEl.querySelectorAll("[data-id]").forEach(item => {
        item.addEventListener("click", async () => {
          const { error } = await sb.from("igr_fotos_marcacoes").insert({ foto_id: state.mfFotoAtual.id, membro_id: item.dataset.id });
          input.value = "";
          sugestoesEl.style.display = "none";
          if (!error) carregarPessoasMarcadasNaFoto();
        });
      });
    }, 300);
  });
  document.addEventListener("click", (ev) => {
    if (!sugestoesEl.contains(ev.target) && ev.target !== input) sugestoesEl.style.display = "none";
  });
}

// ---------- visualizador de fotos em tela cheia (lightbox) ----------
function abrirLightbox(indice) {
  state.lightboxIndice = indice;
  atualizarLightbox();
  document.getElementById("lightbox-overlay").classList.add("open");
}
function fecharLightbox() {
  document.getElementById("lightbox-overlay").classList.remove("open");
}
function atualizarLightbox() {
  const fotos = state.fotosAlbumAtual || [];
  const foto = fotos[state.lightboxIndice];
  if (!foto) return;
  document.getElementById("lightbox-img").src = foto.url;
  document.getElementById("lightbox-baixar").href = foto.url;
  document.getElementById("lightbox-contador").textContent = `${state.lightboxIndice + 1} / ${fotos.length}`;
}
function lightboxProxima(delta) {
  const fotos = state.fotosAlbumAtual || [];
  if (!fotos.length) return;
  state.lightboxIndice = (state.lightboxIndice + delta + fotos.length) % fotos.length;
  atualizarLightbox();
}

// ---------- ministério de louvor: gerenciar (líder) ----------
async function enviarEscalaLouvor(ev) {
  ev.preventDefault();
  const data = document.getElementById("le-data").value;
  const culto_titulo = document.getElementById("le-titulo").value.trim();
  const observacoes = document.getElementById("le-obs").value.trim();
  if (!data || !culto_titulo) return;
  if (!state.igreja) { alert("Ainda carregando os dados da igreja. Aguarde um instante e tente de novo."); return; }
  const btn = ev.target.querySelector("button[type=submit]");
  btn.disabled = true; btn.textContent = "Enviando...";
  try {
    const { error } = await sb.from("igr_louvor_escalas").insert({
      igreja_id: state.igreja.id, data, culto_titulo, observacoes,
      criado_por: state.membro?.nome_completo || null,
    });
    if (error) { alert("Não deu pra criar a escala: " + error.message); return; }
    ev.target.reset();
    await carregarLouvor();
  } catch (e) {
    console.error("Erro ao criar escala:", e);
    alert("Não deu pra criar agora. Verifique sua conexão e tente de novo.");
  } finally {
    btn.disabled = false; btn.textContent = "Criar escala";
  }
}
async function enviarParticipanteLouvor(ev) {
  ev.preventDefault();
  if (!state.louvorEscalaAtualId) { alert("Crie uma escala primeiro."); return; }
  const membroSelect = document.getElementById("lp-membro");
  const membro_id = membroSelect.value || null;
  const nomeDigitado = document.getElementById("lp-nome").value.trim();
  const funcao = document.getElementById("lp-funcao").value.trim();
  const nome = membro_id ? membroSelect.selectedOptions[0].textContent : nomeDigitado;
  if (!nome || !funcao) return;
  const btn = ev.target.querySelector("button[type=submit]");
  btn.disabled = true; btn.textContent = "Enviando...";
  try {
    const { error } = await sb.from("igr_louvor_participantes").insert({ escala_id: state.louvorEscalaAtualId, nome, funcao, membro_id });
    if (error) { alert("Não deu pra adicionar: " + error.message); return; }
    ev.target.reset();
    await carregarLouvor();
  } catch (e) {
    console.error("Erro ao adicionar participante:", e);
    alert("Não deu pra adicionar agora. Verifique sua conexão e tente de novo.");
  } finally {
    btn.disabled = false; btn.textContent = "Adicionar";
  }
}
async function carregarMembrosGrupoLouvor() {
  const select = document.getElementById("lp-membro");
  if (!select || !state.membro?.grupo_id) return;
  const { data } = await sb.from("igr_membros").select("id, nome_completo").eq("grupo_id", state.membro.grupo_id).order("nome_completo");
  select.innerHTML = `<option value="">— Sem vincular a um membro —</option>` +
    (data || []).map(m => `<option value="${m.id}">${m.nome_completo}</option>`).join("");
}
async function enviarMusicaLouvor(ev) {
  ev.preventDefault();
  if (!state.louvorEscalaAtualId) { alert("Crie uma escala primeiro."); return; }
  const titulo = document.getElementById("lm-titulo").value.trim();
  const artista = document.getElementById("lm-artista").value.trim();
  const tom = document.getElementById("lm-tom").value.trim();
  const link_youtube = document.getElementById("lm-youtube").value.trim();
  let link = document.getElementById("lm-link").value.trim();
  if (!titulo) return;
  const btn = ev.target.querySelector("button[type=submit]");
  btn.disabled = true; btn.textContent = "Enviando...";
  try {
    const arquivo = document.getElementById("lm-cifra-arquivo").files[0];
    const cifraUpload = await uploadArquivo(arquivo, "cifras");
    if (cifraUpload) link = cifraUpload;
    const { error } = await sb.from("igr_louvor_musicas").insert({ escala_id: state.louvorEscalaAtualId, titulo, artista, tom, link, link_youtube, ordem: Date.now() });
    if (error) { alert("Não deu pra adicionar a música: " + error.message); return; }
    ev.target.reset();
    await carregarLouvor();
  } catch (e) {
    console.error("Erro ao adicionar música:", e);
    alert("Não deu pra adicionar agora. Verifique sua conexão e tente de novo.");
  } finally {
    btn.disabled = false; btn.textContent = "Adicionar música";
  }
}
async function enviarEventoLouvor(ev) {
  ev.preventDefault();
  const titulo = document.getElementById("lev-titulo").value.trim();
  const data = document.getElementById("lev-data").value;
  const horario = document.getElementById("lev-horario").value.trim();
  const local = document.getElementById("lev-local").value.trim();
  if (!titulo || !data) return;
  if (!state.igreja) { alert("Ainda carregando os dados da igreja. Aguarde um instante e tente de novo."); return; }
  const btn = ev.target.querySelector("button[type=submit]");
  btn.disabled = true; btn.textContent = "Enviando...";
  try {
    const { error } = await sb.from("igr_louvor_eventos").insert({ igreja_id: state.igreja.id, titulo, data, horario, local });
    if (error) { alert("Não deu pra adicionar: " + error.message); return; }
    ev.target.reset();
    await carregarLouvor();
  } catch (e) {
    console.error("Erro ao adicionar evento:", e);
    alert("Não deu pra adicionar agora. Verifique sua conexão e tente de novo.");
  } finally {
    btn.disabled = false; btn.textContent = "Adicionar";
  }
}

// ---------- administrador ----------
async function enviarLoginAdmin(ev) {
  ev.preventDefault();
  const senha = document.getElementById("admin-senha").value;
  const errEl = document.getElementById("admin-erro");
  errEl.classList.remove("show");
  if (!senha) return;
  if (!state.igreja) {
    errEl.textContent = "Ainda carregando os dados da igreja. Aguarde um instante e tente de novo.";
    errEl.classList.add("show");
    return;
  }
  const hash = await sha256(senha + ":" + state.igreja.id);
  const { data: contas } = await sb.from("igr_admin_senhas").select("*").eq("igreja_id", state.igreja.id);
  const conta = (contas || []).find(c => c.senha_hash === hash);
  if (!conta) {
    errEl.textContent = "Senha incorreta.";
    errEl.classList.add("show");
    return;
  }
  state.adminPapel = conta.papel;
  state.adminNome = conta.nome;
  state.entrouPainelComoMembro = false;
  document.getElementById("btn-sair-admin").dataset.nav = "tela-visitante";
  document.getElementById("admin-senha").value = "";
  montarGridAdmin();
  mostrarTela("tela-admin-painel");
}

async function carregarPainelAdmin() {
  const el = document.getElementById("admin-lideres-pendentes");
  const { data } = await sb.from("igr_membros").select("*, igr_grupos(nome)")
    .eq("igreja_id", state.igreja.id).eq("lider_status", "pendente").order("created_at");
  el.innerHTML = (data || []).map(m => `
    <div class="card" data-membro-id="${m.id}">
      <div class="row-avatar">
        ${avatarIniciais(m.nome_completo)}
        <div class="row-info"><b>${m.nome_completo}</b><span>${m.igr_grupos?.nome || "grupo não informado"} · ${m.telefone}</span></div>
      </div>
      <label style="display:block;font-size:12px;font-weight:600;color:var(--ink-soft);margin:10px 0 6px;">O que ela pode acessar como líder?</label>
      <div class="interesses-grid" style="margin-bottom:10px;">
        <label class="interesse-item"><input type="checkbox" value="editar_grupo" checked> Editar capa/descrição</label>
        <label class="interesse-item"><input type="checkbox" value="postar_avisos" checked> Postar avisos</label>
        <label class="interesse-item"><input type="checkbox" value="gerenciar_oracao" checked> Ver pedidos de oração</label>
        <label class="interesse-item"><input type="checkbox" value="gerenciar_louvor"> Gerenciar Louvor</label>
      </div>
      <div style="display:flex;gap:8px;margin-top:4px;">
        <button class="btn btn-primary" style="width:auto;padding:9px 16px;font-size:12.5px;" data-acao="aprovar" data-id="${m.id}">Aprovar</button>
        <button class="btn btn-ghost" style="width:auto;padding:9px 16px;font-size:12.5px;" data-acao="recusar" data-id="${m.id}">Recusar</button>
      </div>
    </div>
  `).join("") || `<div class="empty">Nenhum pedido pendente no momento.</div>`;

  el.querySelectorAll("[data-acao]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const aprovar = btn.dataset.acao === "aprovar";
      const card = btn.closest("[data-membro-id]");
      const permissoes = aprovar ? Array.from(card.querySelectorAll('input[type=checkbox]:checked')).map(c => c.value) : [];
      btn.disabled = true;
      await sb.from("igr_membros").update({
        lider_status: aprovar ? "aprovado" : "recusado",
        eh_lider: aprovar,
        permissoes,
      }).eq("id", id);
      await carregarPainelAdmin();
    });
  });

  // popula o select de grupo do formulário "adicionar líder diretamente"
  const selectGrupo = document.getElementById("anl-grupo");
  if (selectGrupo) {
    selectGrupo.innerHTML = `<option value="">Selecione</option>` +
      (state.grupos || []).map(g => `<option value="${g.id}">${g.nome}</option>`).join("");
  }
  const selectGrupoPromo = document.getElementById("promo-lider-grupo");
  if (selectGrupoPromo) {
    selectGrupoPromo.innerHTML = `<option value="">Selecione</option>` +
      (state.grupos || []).map(g => `<option value="${g.id}">${g.nome}</option>`).join("");
  }

  await carregarLideresAtivos();
}

let membroSelecionadoPromoLider = null;
function configurarBuscaPromoverLider() {
  const input = document.getElementById("promo-lider-busca");
  const sugestoesEl = document.getElementById("promo-lider-sugestoes");
  if (!input) return;
  let timeoutId = null;
  input.addEventListener("input", () => {
    clearTimeout(timeoutId);
    const termo = input.value.trim();
    membroSelecionadoPromoLider = null;
    document.getElementById("btn-promover-lider").disabled = true;
    if (termo.length < 2) { sugestoesEl.style.display = "none"; return; }
    timeoutId = setTimeout(async () => {
      const { data } = await sb.from("igr_membros").select("id, nome_completo, grupo_id")
        .eq("igreja_id", state.igreja.id).ilike("nome_completo", `%${termo}%`).limit(6);
      sugestoesEl.innerHTML = (data || []).map(m => `<div class="autocomplete-item" data-id="${m.id}" data-nome="${m.nome_completo}" data-grupo="${m.grupo_id || ""}">${m.nome_completo}</div>`).join("");
      sugestoesEl.style.display = data?.length ? "block" : "none";
      sugestoesEl.querySelectorAll("[data-id]").forEach(item => {
        item.addEventListener("click", () => {
          membroSelecionadoPromoLider = { id: item.dataset.id, nome: item.dataset.nome };
          document.getElementById("promo-lider-nome-selecionado").textContent = item.dataset.nome;
          document.getElementById("promo-lider-selecionado").style.display = "block";
          if (item.dataset.grupo) document.getElementById("promo-lider-grupo").value = item.dataset.grupo;
          input.value = "";
          sugestoesEl.style.display = "none";
          document.getElementById("btn-promover-lider").disabled = false;
        });
      });
    }, 300);
  });
  document.addEventListener("click", (ev) => {
    if (!sugestoesEl.contains(ev.target) && ev.target !== input) sugestoesEl.style.display = "none";
  });
}

async function promoverMembroALider() {
  if (!membroSelecionadoPromoLider) return;
  const grupo_id = document.getElementById("promo-lider-grupo").value;
  if (!grupo_id) { alert("Escolha o grupo/departamento."); return; }
  const permissoes = Array.from(document.querySelectorAll("#promo-lider-permissoes input:checked")).map(c => c.value);
  const btn = document.getElementById("btn-promover-lider");
  btn.disabled = true; btn.textContent = "Salvando...";
  const { error } = await sb.from("igr_membros").update({
    eh_lider: true, lider_status: "aprovado", grupo_id, permissoes,
  }).eq("id", membroSelecionadoPromoLider.id);
  btn.disabled = false; btn.textContent = "Tornar líder";
  if (error) { alert("Não deu pra promover: " + error.message); return; }
  enviarPush({ tipo: "membros", membro_ids: [membroSelecionadoPromoLider.id] }, "Você agora é líder! 🎉", "Você foi promovido(a) a líder de grupo. Acesse o app pra começar.");
  document.getElementById("promo-lider-selecionado").style.display = "none";
  membroSelecionadoPromoLider = null;
  carregarPainelAdmin();
}

const LABELS_PERMISSOES = {
  editar_grupo: "Editar grupo", postar_avisos: "Postar avisos",
  gerenciar_oracao: "Ver oração", gerenciar_louvor: "Gerenciar Louvor",
};

async function carregarLideresAtivos() {
  const el = document.getElementById("admin-lideres-ativos");
  if (!el) return;
  const { data } = await sb.from("igr_membros").select("*, igr_grupos(nome)")
    .eq("igreja_id", state.igreja.id).eq("eh_lider", true).order("nome_completo");

  el.innerHTML = (data || []).map(m => {
    const tagsPermissoes = (m.permissoes || []).map(p => LABELS_PERMISSOES[p] || p).join(" · ") || "nenhuma permissão marcada";
    return `
    <div class="card" data-lider-id="${m.id}">
      <div class="row-avatar">
        ${avatarIniciais(m.nome_completo)}
        <div class="row-info"><b>${m.nome_completo}</b><span>${m.igr_grupos?.nome || "sem grupo"} · ${tagsPermissoes}</span></div>
      </div>
      <div id="editar-lider-${m.id}" style="display:none;margin-top:12px;">
        <div class="field"><label>Grupo/Departamento</label>
          <select class="editar-lider-grupo">${(state.grupos || []).map(g => `<option value="${g.id}" ${g.id === m.grupo_id ? "selected" : ""}>${g.nome}</option>`).join("")}</select>
        </div>
        <label style="display:block;font-size:12px;font-weight:600;color:var(--ink-soft);margin:8px 0 6px;">Permissões</label>
        <div class="interesses-grid" style="margin-bottom:12px;">
          <label class="interesse-item"><input type="checkbox" value="editar_grupo" ${(m.permissoes || []).includes("editar_grupo") ? "checked" : ""}> Editar capa/descrição</label>
          <label class="interesse-item"><input type="checkbox" value="postar_avisos" ${(m.permissoes || []).includes("postar_avisos") ? "checked" : ""}> Postar avisos</label>
          <label class="interesse-item"><input type="checkbox" value="gerenciar_oracao" ${(m.permissoes || []).includes("gerenciar_oracao") ? "checked" : ""}> Ver pedidos de oração</label>
          <label class="interesse-item"><input type="checkbox" value="gerenciar_louvor" ${(m.permissoes || []).includes("gerenciar_louvor") ? "checked" : ""}> Gerenciar Louvor</label>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-primary" style="flex:1;" data-salvar-lider="${m.id}">Salvar</button>
          <button class="btn btn-ghost" style="flex:1;" data-remover-lider="${m.id}">Remover liderança</button>
        </div>
      </div>
      <button class="btn btn-ghost" style="width:auto;padding:8px 14px;font-size:12px;margin-top:10px;" data-toggle-editar-lider="${m.id}">Editar</button>
    </div>`;
  }).join("") || `<div class="empty">Nenhum líder ativo no momento.</div>`;

  el.querySelectorAll("[data-toggle-editar-lider]").forEach(btn => {
    btn.addEventListener("click", () => {
      const box = document.getElementById("editar-lider-" + btn.dataset.toggleEditarLider);
      box.style.display = box.style.display === "none" ? "block" : "none";
    });
  });
  el.querySelectorAll("[data-salvar-lider]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.salvarLider;
      const card = btn.closest("[data-lider-id]");
      const grupo_id = card.querySelector(".editar-lider-grupo").value;
      const permissoes = Array.from(card.querySelectorAll('input[type=checkbox]:checked')).map(c => c.value);
      btn.disabled = true; btn.textContent = "Salvando...";
      await sb.from("igr_membros").update({ grupo_id, permissoes }).eq("id", id);
      await carregarLideresAtivos();
    });
  });
  el.querySelectorAll("[data-remover-lider]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Remover a liderança dessa pessoa? Ela continua como membro normal.")) return;
      btn.disabled = true;
      await sb.from("igr_membros").update({ eh_lider: false, permissoes: [], lider_status: "nenhum" }).eq("id", btn.dataset.removerLider);
      await carregarLideresAtivos();
    });
  });
}

async function enviarNovoLiderAdmin(ev) {
  ev.preventDefault();
  const nome_completo = document.getElementById("anl-nome").value.trim();
  const telefone = limparTelefone(document.getElementById("anl-telefone").value);
  const grupo_id = document.getElementById("anl-grupo").value;
  const pin = document.getElementById("anl-senha").value.trim();
  const permissoes = Array.from(ev.target.querySelectorAll('input[type=checkbox]:checked')).map(c => c.value);
  if (!nome_completo || !telefone || !grupo_id || !/^\d{4}$/.test(pin)) {
    alert("Preencha nome, telefone, grupo e uma senha de 4 números.");
    return;
  }
  if (!state.igreja) { alert("Ainda carregando os dados da igreja. Aguarde um instante e tente de novo."); return; }
  const btn = ev.target.querySelector("button[type=submit]");
  btn.disabled = true; btn.textContent = "Criando...";
  try {
    const pin_hash = await sha256(pin + ":" + telefone);
    const { error } = await sb.from("igr_membros").insert({
      igreja_id: state.igreja.id, nome_completo, telefone, grupo_id, pin_hash,
      lider_status: "aprovado", eh_lider: true, permissoes,
    });
    if (error) {
      alert(error.code === "23505" ? "Já existe um cadastro com esse telefone." : "Não deu pra criar: " + error.message);
      return;
    }
    const resultado = document.getElementById("anl-resultado");
    const nomeGrupo = (state.grupos || []).find(g => g.id === grupo_id)?.nome || "";
    resultado.innerHTML = `✅ Líder criado! Passa isso pra <b>${nome_completo}</b> entrar (menu → Entrar / Cadastro):<br><b>Telefone:</b> ${telefone}<br><b>Senha:</b> ${pin}<br><span class="hint" style="margin:6px 0 0;display:block;">Acesso liberado no grupo ${nomeGrupo}, só no que foi marcado acima.</span>`;
    resultado.style.display = "block";
    ev.target.reset();
  } catch (e) {
    console.error("Erro ao criar líder:", e);
    alert("Não deu pra criar agora. Verifique sua conexão e tente de novo.");
  } finally {
    btn.disabled = false; btn.textContent = "Criar acesso de líder";
  }
}

async function carregarVisitantesAdmin() {
  const el = document.getElementById("admin-visitantes");
  const { data } = await sb.from("igr_visitantes").select("*, igr_grupos(nome)")
    .eq("igreja_id", state.igreja.id).order("created_at", { ascending: false }).limit(30);

  const agora = new Date();
  const doMes = (data || []).filter(v => {
    const d = new Date(v.created_at);
    return d.getMonth() === agora.getMonth() && d.getFullYear() === agora.getFullYear();
  }).length;
  const totalContatados = (data || []).filter(v => v.contatado).length;

  document.getElementById("admin-dashboard-visitantes").innerHTML = `
    <div class="dash-stat-row">
      <div class="dash-stat"><b>${doMes}</b><span>Visitantes este mês</span></div>
      <div class="dash-stat"><b>${totalContatados}/${(data || []).length}</b><span>Já contatados</span></div>
    </div>`;

  el.innerHTML = (data || []).map(v => {
    const idade = v.data_nascimento ? calcularIdade(v.data_nascimento) : null;
    const nomeGrupo = v.igr_grupos?.nome || "nossa igreja";
    const assinatura = state.adminNome ? `Aqui é ${state.adminNome}, do` : "Aqui é do";
    const msg = `Oi ${v.nome.split(" ")[0]}! ${assinatura} ${nomeGrupo} da ${state.igreja.nome}. Que alegria que você nos visitou! 💛`;
    return `
    <div class="card">
      <div class="row-avatar">
        ${avatarIniciais(v.nome)}
        <div class="row-info"><b>${v.nome}${idade ? " · " + idade + " anos" : ""}</b><span>${v.igr_grupos?.nome || "sem grupo definido"} · ${tempoRelativo(v.created_at)}${v.contatado ? " · já contatado" : ""}</span></div>
      </div>
      <div style="display:flex;gap:8px;margin-top:8px;">
        <a class="btn btn-primary" style="width:auto;padding:9px 16px;font-size:12.5px;" href="${linkWhatsapp(v.telefone, msg)}" target="_blank" rel="noopener">Chamar no WhatsApp</a>
        ${!v.contatado ? `<button class="btn btn-ghost" style="width:auto;padding:9px 16px;font-size:12.5px;" data-marcar-contatado-admin="${v.id}">Marcar contatado</button>` : ""}
      </div>
    </div>`;
  }).join("") || `<div class="empty">Nenhum visitante registrado ainda.</div>`;

  el.querySelectorAll("[data-marcar-contatado-admin]").forEach(btn => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      await sb.from("igr_visitantes").update({ contatado: true }).eq("id", btn.dataset.marcarContatadoAdmin);
      carregarVisitantesAdmin();
    });
  });
}

// ---------- admin: membros por grupo ----------
let estadoMembrosAdmin = { grupoId: null, grupoNome: "", membroId: null };

async function carregarMembrosAdminGrupos() {
  document.getElementById("admin-membros-view-ficha").style.display = "none";
  document.getElementById("admin-membros-view-lista").style.display = "none";
  document.getElementById("admin-membros-view-grupos").style.display = "block";

  const grid = document.getElementById("admin-membros-grupos-grid");
  grid.innerHTML = `<p class="hint"><span class="loading-dot"></span></p>`;

  const { data } = await sb.from("igr_membros").select("grupo_id").eq("igreja_id", state.igreja.id);
  const contagem = {};
  (data || []).forEach(m => { if (m.grupo_id) contagem[m.grupo_id] = (contagem[m.grupo_id] || 0) + 1; });

  grid.innerHTML = (state.grupos || []).map(g => `
    <div class="admin-grid-card" style="position:relative;cursor:default;" data-grupo-membros="${g.id}" data-grupo-nome="${g.nome}">
      <button type="button" class="editar-grupo-icone" data-editar-grupo="${g.id}" aria-label="Editar grupo" title="Editar grupo">✏️</button>
      <div data-abrir-grupo="${g.id}" data-grupo-nome-abrir="${g.nome}" style="cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:8px;">
        <svg class="icon"><use href="#i-user"/></svg>
        ${g.nome}
        <span style="font-weight:400;font-size:11.5px;color:var(--ink-soft);">${contagem[g.id] || 0} membro(s)</span>
      </div>
    </div>
  `).join("") || `<div class="empty">Nenhum grupo cadastrado ainda.</div>`;

  grid.querySelectorAll("[data-abrir-grupo]").forEach(el => {
    el.addEventListener("click", () => abrirGrupoDeMembros(el.dataset.abrirGrupo, el.dataset.grupoNomeAbrir));
  });
  grid.querySelectorAll("[data-editar-grupo]").forEach(btn => {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      abrirEdicaoGrupoAdmin(btn.dataset.editarGrupo);
    });
  });
}

async function abrirEdicaoGrupoAdmin(grupoId) {
  const grupo = (state.grupos || []).find(g => g.id === grupoId);
  if (!grupo) return;
  estadoMembrosAdmin.grupoEditando = grupo;
  document.getElementById("admin-membros-view-grupos").style.display = "none";
  document.getElementById("admin-membros-view-editar-grupo").style.display = "block";
  document.getElementById("eg-nome").value = grupo.nome || "";
  document.getElementById("eg-descricao").value = grupo.descricao || "";
  carregarCelulasDoGrupo(grupo.id, "adm-");
}

async function salvarEdicaoGrupoAdmin(ev) {
  ev.preventDefault();
  const grupo = estadoMembrosAdmin.grupoEditando;
  if (!grupo) return;
  const btn = ev.target.querySelector("button[type=submit]");
  btn.disabled = true; btn.textContent = "Salvando...";
  try {
    const nome = document.getElementById("eg-nome").value.trim();
    const descricao = document.getElementById("eg-descricao").value.trim();
    const arquivo = document.getElementById("eg-capa").files[0];
    const novaCapa = arquivo ? await uploadArquivo(arquivo, "grupos") : null;
    const payload = { nome, descricao };
    if (novaCapa) payload.capa_url = novaCapa;
    const { error } = await sb.from("igr_grupos").update(payload).eq("id", grupo.id);
    if (error) { alert("Não deu pra salvar: " + error.message); return; }
    Object.assign(grupo, payload);
    document.getElementById("admin-membros-view-editar-grupo").style.display = "none";
    await carregarMembrosAdminGrupos();
  } catch (e) {
    console.error("Erro ao salvar grupo:", e);
    alert("Não deu pra salvar agora. Verifique sua conexão e tente de novo.");
  } finally {
    btn.disabled = false; btn.textContent = "Salvar grupo";
  }
}

async function abrirGrupoDeMembros(grupoId, grupoNome) {
  estadoMembrosAdmin.grupoId = grupoId;
  estadoMembrosAdmin.grupoNome = grupoNome;

  document.getElementById("admin-membros-view-grupos").style.display = "none";
  document.getElementById("admin-membros-view-ficha").style.display = "none";
  document.getElementById("admin-membros-view-lista").style.display = "block";
  document.getElementById("admin-membros-lista-titulo").textContent = `Membros · ${grupoNome}`;

  const el = document.getElementById("admin-membros-lista");
  el.innerHTML = `<p class="hint"><span class="loading-dot"></span></p>`;

  const { data } = await sb.from("igr_membros").select("*").eq("igreja_id", state.igreja.id).eq("grupo_id", grupoId).order("nome_completo");

  el.innerHTML = (data || []).map(m => `
    <div class="card" data-abrir-ficha="${m.id}" style="cursor:pointer;">
      <div class="row-avatar">
        ${avatarIniciais(m.nome_completo)}
        <div class="row-info"><b>${m.nome_completo}</b><span>${m.telefone}${m.eh_lider ? " · líder" : ""}</span></div>
      </div>
    </div>
  `).join("") || `<div class="empty">Nenhum membro cadastrado neste grupo ainda.</div>`;

  el.querySelectorAll("[data-abrir-ficha]").forEach(card => {
    card.addEventListener("click", () => abrirFichaMembro(card.dataset.abrirFicha));
  });
}

async function abrirFichaMembro(membroId) {
  estadoMembrosAdmin.membroId = membroId;
  const { data: m, error } = await sb.from("igr_membros").select("*").eq("id", membroId).single();
  if (error || !m) { alert("Não deu pra carregar esse membro."); return; }

  document.getElementById("admin-membros-view-lista").style.display = "none";
  document.getElementById("admin-membros-view-ficha").style.display = "block";

  document.getElementById("fm-nome").value = m.nome_completo || "";
  document.getElementById("fm-telefone").value = m.telefone || "";
  document.getElementById("fm-email").value = m.email || "";
  document.getElementById("fm-endereco").value = m.endereco || "";
  definirValorData("fm-nascimento", m.data_nascimento);
  document.getElementById("fm-profissao").value = m.profissao || "";

  const selectGrupo = document.getElementById("fm-grupo");
  selectGrupo.innerHTML = (state.grupos || []).map(g => `<option value="${g.id}" ${g.id === m.grupo_id ? "selected" : ""}>${g.nome}</option>`).join("");

  const ehLider = document.getElementById("fm-eh-lider");
  ehLider.checked = !!m.eh_lider;
  const blocoPermissoes = document.getElementById("fm-bloco-permissoes");
  blocoPermissoes.style.display = m.eh_lider ? "block" : "none";
  blocoPermissoes.querySelectorAll('input[type=checkbox]').forEach(cb => {
    cb.checked = (m.permissoes || []).includes(cb.value);
  });
  ehLider.onchange = () => { blocoPermissoes.style.display = ehLider.checked ? "block" : "none"; };

  const batizado = document.getElementById("fm-batizado");
  batizado.checked = !!m.batizado;
  const blocoBatismo = document.getElementById("fm-bloco-batismo");
  blocoBatismo.style.display = m.batizado ? "block" : "none";
  definirValorData("fm-data-batismo", m.data_batismo);
  document.getElementById("fm-pastor-batismo").value = m.pastor_batismo || "";
  batizado.onchange = () => { blocoBatismo.style.display = batizado.checked ? "block" : "none"; };

  document.getElementById("fm-autoriza-fotos").checked = m.autoriza_fotos !== false;

  renderInteresses("fm-interesses-lista", m.interesses || []);
}

async function resetarPinMembro() {
  const id = estadoMembrosAdmin.membroId;
  const nome = document.getElementById("fm-nome").value.trim();
  const telefone = limparTelefone(document.getElementById("fm-telefone").value);
  if (!id || !telefone) return;
  if (!confirm(`Resetar o PIN de ${nome || "este membro"}? A senha atual dele(a) para de funcionar.`)) return;

  const novoPin = String(Math.floor(1000 + Math.random() * 9000));
  const pin_hash = await sha256(novoPin + ":" + telefone);
  const btn = document.getElementById("btn-resetar-pin-membro");
  btn.disabled = true; btn.textContent = "Resetando...";
  const { error } = await sb.from("igr_membros").update({ pin_hash }).eq("id", id);
  btn.disabled = false; btn.textContent = "🔑 Resetar PIN deste membro";
  if (error) { alert("Não deu pra resetar: " + error.message); return; }
  alert(`PIN novo de ${nome || "este membro"}: ${novoPin}\n\nPasse esse número pra pessoa — ela pode trocar depois no próprio perfil dela.`);
}

async function salvarFichaMembro(ev) {
  ev.preventDefault();
  const id = estadoMembrosAdmin.membroId;
  const btn = ev.target.querySelector("button[type=submit]");
  btn.disabled = true; btn.textContent = "Salvando...";

  const ehLider = document.getElementById("fm-eh-lider").checked;
  const batizado = document.getElementById("fm-batizado").checked;
  const permissoes = ehLider ? Array.from(document.querySelectorAll("#fm-permissoes-lista input:checked")).map(c => c.value) : [];

  const payload = {
    nome_completo: document.getElementById("fm-nome").value.trim(),
    telefone: limparTelefone(document.getElementById("fm-telefone").value),
    email: document.getElementById("fm-email").value.trim() || null,
    endereco: document.getElementById("fm-endereco").value.trim() || null,
    data_nascimento: document.getElementById("fm-nascimento").value || null,
    profissao: document.getElementById("fm-profissao").value.trim() || null,
    grupo_id: document.getElementById("fm-grupo").value,
    eh_lider: ehLider,
    permissoes,
    lider_status: ehLider ? "aprovado" : "nenhum",
    batizado,
    data_batismo: batizado ? (document.getElementById("fm-data-batismo").value || null) : null,
    pastor_batismo: batizado ? (document.getElementById("fm-pastor-batismo").value.trim() || null) : null,
    autoriza_fotos: document.getElementById("fm-autoriza-fotos").checked,
    interesses: coletarInteresses("fm-interesses-lista"),
  };

  const { error } = await sb.from("igr_membros").update(payload).eq("id", id);
  btn.disabled = false; btn.textContent = "Salvar alterações";
  if (error) { alert("Não deu pra salvar: " + error.message); return; }
  await abrirGrupoDeMembros(estadoMembrosAdmin.grupoId, estadoMembrosAdmin.grupoNome);
}

async function excluirMembroAdmin() {
  const id = estadoMembrosAdmin.membroId;
  if (!id) return;
  if (!confirm("Tem certeza que quer excluir esse cadastro? Essa ação não pode ser desfeita.")) return;
  const btn = document.getElementById("btn-excluir-membro");
  btn.disabled = true; btn.textContent = "Excluindo...";
  const { error } = await sb.from("igr_membros").delete().eq("id", id);
  btn.disabled = false; btn.textContent = "🗑 Excluir cadastro deste membro";
  if (error) { alert("Não deu pra excluir: " + error.message); return; }
  await abrirGrupoDeMembros(estadoMembrosAdmin.grupoId, estadoMembrosAdmin.grupoNome);
}

async function exportarGrupoMembrosCSV() {
  const btn = document.getElementById("btn-exportar-grupo-membros");
  btn.disabled = true; btn.textContent = "Gerando arquivo...";
  try {
    const { data, error } = await sb.from("igr_membros").select("*, igr_grupos(nome)")
      .eq("igreja_id", state.igreja.id).eq("grupo_id", estadoMembrosAdmin.grupoId).order("nome_completo");
    if (error) { alert("Não deu pra exportar: " + error.message); return; }

    const colunas = [
      "Nome completo", "Telefone", "E-mail", "Data de nascimento", "Idade", "Endereço", "Profissão",
      "Grupo/Departamento", "É líder", "Status de liderança", "Permissões",
      "Batizado", "Data do batismo", "Pastor do batismo", "Autoriza fotos", "Interesses/talentos", "Cadastrado em",
    ];
    const linhas = (data || []).map(m => [
      m.nome_completo, m.telefone, m.email || "",
      m.data_nascimento ? formatarData(m.data_nascimento) : "",
      m.data_nascimento ? calcularIdade(m.data_nascimento) : "",
      m.endereco || "", m.profissao || "",
      m.igr_grupos?.nome || "",
      m.eh_lider ? "Sim" : "Não",
      m.lider_status || "",
      (m.permissoes || []).join("; "),
      m.batizado === true ? "Sim" : m.batizado === false ? "Não" : "",
      m.data_batismo ? formatarData(m.data_batismo) : "",
      m.pastor_batismo || "",
      m.autoriza_fotos === false ? "Não" : "Sim",
      (m.interesses || []).join("; "),
      m.created_at ? formatarData(m.created_at) : "",
    ].map(escaparCSV).join(","));

    const csv = "\uFEFF" + colunas.join(",") + "\n" + linhas.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `membros-${estadoMembrosAdmin.grupoNome.replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch (e) {
    console.error("Erro ao exportar membros do grupo:", e);
    alert("Não deu pra exportar agora. Verifique sua conexão e tente de novo.");
  } finally {
    btn.disabled = false; btn.textContent = "📥 Exportar este grupo (CSV)";
  }
}

// ---------- admin: exportar membros (CSV) ----------
function escaparCSV(valor) {
  const texto = (valor === null || valor === undefined) ? "" : String(valor);
  if (texto.includes(",") || texto.includes('"') || texto.includes("\n")) {
    return `"${texto.replace(/"/g, '""')}"`;
  }
  return texto;
}
async function exportarMembrosCSV() {
  const btn = document.getElementById("btn-exportar-membros");
  btn.disabled = true; btn.textContent = "Gerando arquivo...";
  try {
    const { data, error } = await sb.from("igr_membros").select("*, igr_grupos(nome)").eq("igreja_id", state.igreja.id).order("nome_completo");
    if (error) { alert("Não deu pra exportar: " + error.message); return; }

    const colunas = [
      "Nome completo", "Telefone", "Data de nascimento", "Idade", "Gênero", "Estado civil",
      "Endereço", "Grupo/Departamento", "É líder", "Status de liderança",
      "Batizado", "Data do batismo", "Pastor do batismo", "Autoriza fotos", "Interesses/talentos", "Cadastrado em",
    ];
    const linhas = (data || []).map(m => [
      m.nome_completo, m.telefone,
      m.data_nascimento ? formatarData(m.data_nascimento) : "",
      m.data_nascimento ? calcularIdade(m.data_nascimento) : "",
      m.genero === "M" ? "Masculino" : m.genero === "F" ? "Feminino" : "",
      m.estado_civil || "",
      m.endereco || "",
      m.igr_grupos?.nome || "",
      m.eh_lider ? "Sim" : "Não",
      m.lider_status || "",
      m.batizado === true ? "Sim" : m.batizado === false ? "Não" : "",
      m.data_batismo ? formatarData(m.data_batismo) : "",
      m.pastor_batismo || "",
      m.autoriza_fotos === false ? "Não" : "Sim",
      (m.interesses || []).join("; "),
      m.created_at ? formatarData(m.created_at) : "",
    ].map(escaparCSV).join(","));

    const csv = "\uFEFF" + colunas.join(",") + "\n" + linhas.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `membros-${state.igreja.nome.replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch (e) {
    console.error("Erro ao exportar membros:", e);
    alert("Não deu pra exportar agora. Verifique sua conexão e tente de novo.");
  } finally {
    btn.disabled = false; btn.textContent = "📥 Exportar todos os membros (CSV)";
  }
}

// nomes amigaveis das secoes do painel admin, usados na tela de Acessos especiais
const SECOES_ADMIN_INFO = {
  lideres: "👤 Líderes", membros: "👤 Membros", visitantes: "❤️ Visitantes",
  cultos: "📖 Cultos", avisos: "🔔 Avisos", pastor: "🎙️ Pastor", estudos: "✨ Estudos",
  fotos: "📷 Fotos", igreja: "⚙️ Igreja", oracao: "🙏 Oração", eventos: "➕ Eventos", calendario: "📅 Calendário",
};

// ---------- admin: alternador de abas ----------
function montarGridAdmin() {
  const secoesPermitidas = state.adminPapel === "geral" ? null : (state.adminSecoes || []);
  document.querySelectorAll("#admin-grid [data-secao]").forEach(card => {
    card.style.display = (secoesPermitidas === null || secoesPermitidas.includes(card.dataset.secao)) ? "flex" : "none";
  });
  document.querySelectorAll(".admin-painel-aba").forEach(sec => sec.style.display = "none");
  document.getElementById("admin-grid").style.display = "grid";
  document.getElementById("admin-titulo-painel").textContent = state.adminNome ? `Olá, ${state.adminNome}` : "Painel do administrador";
  // pra quem entrou pela senha master, oferece um jeito rápido de ir pra área do membro sem sair do app;
  // pra quem já entrou vindo da própria área do membro (acesso concedido), o botão de sair já leva de volta pra lá
  document.getElementById("btn-admin-area-membro").style.display = state.entrouPainelComoMembro ? "none" : "flex";
}

// entrada de acesso especial pro MEMBRO (sem senha separada — usa o proprio login dele),
// so enxerga as secoes especificas que o admin master concedeu
function abrirPainelEspecial(secoes) {
  state.adminPapel = "custom";
  state.adminSecoes = secoes || [];
  state.adminNome = state.membro?.nome_completo?.split(" ")[0] || "";
  state.entrouPainelComoMembro = true;
  document.getElementById("btn-sair-admin").dataset.nav = "tela-membro-home";
  montarGridAdmin();
  mostrarTela("tela-admin-painel");
}

// ---------- admin: conceder/revogar acessos especiais ----------
let membroSelecionadoAcesso = null;

function configurarBuscaAcessos() {
  const input = document.getElementById("acesso-busca-membro");
  const sugestoesEl = document.getElementById("acesso-sugestoes");
  if (!input) return;
  let timeoutId = null;
  input.addEventListener("input", () => {
    clearTimeout(timeoutId);
    const termo = input.value.trim();
    membroSelecionadoAcesso = null;
    document.getElementById("btn-salvar-acesso").disabled = true;
    if (termo.length < 2) { sugestoesEl.style.display = "none"; return; }
    timeoutId = setTimeout(async () => {
      const { data } = await sb.from("igr_membros").select("id, nome_completo, papeis_especiais")
        .eq("igreja_id", state.igreja.id).ilike("nome_completo", `%${termo}%`).limit(6);
      sugestoesEl.innerHTML = (data || []).map(m => `<div class="autocomplete-item" data-id="${m.id}" data-nome="${m.nome_completo}" data-papeis='${JSON.stringify(m.papeis_especiais || [])}'>${m.nome_completo}</div>`).join("");
      sugestoesEl.style.display = data?.length ? "block" : "none";
      sugestoesEl.querySelectorAll("[data-id]").forEach(item => {
        item.addEventListener("click", () => {
          membroSelecionadoAcesso = { id: item.dataset.id, nome: item.dataset.nome };
          const secoesAtuais = JSON.parse(item.dataset.papeis || "[]");
          document.getElementById("acesso-nome-selecionado").textContent = item.dataset.nome;
          document.getElementById("acesso-membro-selecionado").style.display = "block";
          document.querySelectorAll(".acesso-check-secao").forEach(chk => {
            chk.checked = secoesAtuais.includes(chk.value);
          });
          input.value = "";
          sugestoesEl.style.display = "none";
          document.getElementById("btn-salvar-acesso").disabled = false;
        });
      });
    }, 300);
  });
  document.addEventListener("click", (ev) => {
    if (!sugestoesEl.contains(ev.target) && ev.target !== input) sugestoesEl.style.display = "none";
  });
}

async function salvarAcessoEspecial() {
  if (!membroSelecionadoAcesso) return;
  const secoes = Array.from(document.querySelectorAll(".acesso-check-secao:checked")).map(chk => chk.value);
  const btn = document.getElementById("btn-salvar-acesso");
  btn.disabled = true; btn.textContent = "Salvando...";
  const { error } = await sb.from("igr_membros").update({
    papeis_especiais: secoes, papeis_especiais_novo: secoes.length > 0,
  }).eq("id", membroSelecionadoAcesso.id);
  btn.disabled = false; btn.textContent = "Salvar acesso";
  if (error) { alert("Não deu pra salvar: " + error.message); return; }
  document.getElementById("acesso-membro-selecionado").style.display = "none";
  document.querySelectorAll(".acesso-check-secao").forEach(chk => chk.checked = false);
  membroSelecionadoAcesso = null;
  carregarAcessosAtuais();
}

async function carregarAcessosAtuais() {
  const el = document.getElementById("acessos-lista-atual");
  const { data } = await sb.from("igr_membros").select("id, nome_completo, papeis_especiais")
    .eq("igreja_id", state.igreja.id);
  const comAcesso = (data || []).filter(m => (m.papeis_especiais || []).length);
  el.innerHTML = comAcesso.map(m => `
    <div class="card row-avatar">
      ${avatarIniciais(m.nome_completo)}
      <div class="row-info"><b>${m.nome_completo}</b><span>${(m.papeis_especiais || []).map(p => SECOES_ADMIN_INFO[p] || p).join(", ")}</span></div>
      <button class="btn-icone-remover" data-revogar="${m.id}" title="Revogar acesso">✕</button>
    </div>
  `).join("") || `<p class="hint">Ninguém com acesso ao painel no momento.</p>`;
  el.querySelectorAll("[data-revogar]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Remover o acesso dessa pessoa ao painel?")) return;
      await sb.from("igr_membros").update({ papeis_especiais: [] }).eq("id", btn.dataset.revogar);
      carregarAcessosAtuais();
    });
  });
}


function abrirSecaoAdmin(secao) {
  document.getElementById("admin-grid").style.display = "none";
  document.querySelectorAll(".admin-painel-aba").forEach(sec => {
    sec.style.display = sec.dataset.adminPainel === secao ? "block" : "none";
  });
  const cargas = {
    lideres: carregarPainelAdmin, membros: carregarMembrosAdminGrupos, visitantes: carregarVisitantesAdmin,
    acessos: carregarAcessosAtuais,
    cultos: carregarCultosAdmin, avisos: carregarAvisosAdmin,
    pastor: carregarPastorAdmin, estudos: carregarEsbocosAdmin,
    fotos: carregarAlbunsAdmin,
    igreja: () => { preencherFormIgrejaAdmin(); carregarPastoresPerfilAdmin(); },
    oracao: () => carregarOracaoAdmin("todos"),
    eventos: carregarEventosAdmin,
  };
  cargas[secao]?.();
}

function configurarAbasAdmin() {
  document.querySelectorAll("#admin-grid [data-secao]").forEach(card => {
    card.addEventListener("click", () => abrirSecaoAdmin(card.dataset.secao));
  });
  document.querySelectorAll("[data-voltar-admin]").forEach(b => {
    b.addEventListener("click", montarGridAdmin);
  });
  document.querySelectorAll("[data-filtro-oracao]").forEach(chip => {
    chip.addEventListener("click", () => carregarOracaoAdmin(chip.dataset.filtroOracao));
  });
}

// ---------- admin: pedidos de oração ----------
async function carregarOracaoAdmin(filtro) {
  document.querySelectorAll("[data-filtro-oracao]").forEach(c => c.classList.toggle("on", c.dataset.filtroOracao === filtro));
  let query = sb.from("igr_pedidos_oracao").select("*, igr_membros(nome_completo, telefone)")
    .eq("igreja_id", state.igreja.id).order("created_at", { ascending: false });
  if (filtro && filtro !== "todos") query = query.eq("status", filtro);
  const { data } = await query;
  const el = document.getElementById("admin-lista-oracao");
  el.innerHTML = (data || []).map(p => `
    <div class="card">
      <div class="row-avatar">
        ${avatarIniciais(p.igr_membros?.nome_completo || "?")}
        <div class="row-info"><b>${p.igr_membros?.nome_completo || "Membro"}</b><span>${tempoRelativo(p.created_at)}</span></div>
      </div>
      <p style="margin:10px 0;font-size:13.5px;">${p.texto}</p>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <button class="chip ${p.status === "novo" ? "on" : ""}" data-status-oracao="${p.id}" data-status="novo">Novo</button>
        <button class="chip ${p.status === "orando" ? "on" : ""}" data-status-oracao="${p.id}" data-status="orando">Orando</button>
        <button class="chip ${p.status === "respondido" ? "on" : ""}" data-status-oracao="${p.id}" data-status="respondido">Respondido</button>
      </div>
    </div>
  `).join("") || `<div class="empty">Nenhum pedido de oração por aqui.</div>`;

  el.querySelectorAll("[data-status-oracao]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const pedido = (data || []).find(p => p.id === btn.dataset.statusOracao);
      await sb.from("igr_pedidos_oracao").update({ status: btn.dataset.status }).eq("id", btn.dataset.statusOracao);
      if (pedido?.membro_id) {
        if (btn.dataset.status === "orando") {
          enviarPush({ tipo: "membros", membro_ids: [pedido.membro_id] }, "Estamos orando por você 🙏", "Seu pedido de oração está sendo levado ao Senhor.");
        } else if (btn.dataset.status === "respondido") {
          enviarPush({ tipo: "membros", membro_ids: [pedido.membro_id] }, "Seu pedido foi respondido! 🙌", "Que alegria — seu pedido de oração foi marcado como respondido. Deus é fiel!");
        }
      }
      const filtroAtivo = document.querySelector("[data-filtro-oracao].on")?.dataset.filtroOracao || "todos";
      carregarOracaoAdmin(filtroAtivo);
    });
  });
}

// pequeno helper: excluir um registro e recarregar a lista
async function excluirRegistro(tabela, id, recarregarFn) {
  if (!confirm("Excluir este item?")) return;
  await sb.from(tabela).delete().eq("id", id);
  recarregarFn();
}

// ---------- admin: cultos ----------
async function carregarCultosAdmin() {
  const el = document.getElementById("admin-lista-cultos");
  const { data } = await sb.from("igr_cultos").select("*").eq("igreja_id", state.igreja.id).order("ordem");
  el.innerHTML = (data || []).map(c => `
    <div class="card">
      ${c.imagem_url ? `<img class="capa-thumb" src="${c.imagem_url}" alt="">` : ""}
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
        <div><b style="font-size:13.5px;">${c.titulo}</b><br><span class="hint" style="margin:0;">${c.data ? formatarData(c.data) + " (especial)" : c.dia_semana} · ${c.horario}${c.local ? " · " + c.local : ""}</span></div>
        <div style="display:flex;gap:6px;flex:none;">
          <button class="btn btn-ghost" style="width:auto;padding:7px 12px;font-size:11.5px;" data-edit="${c.id}">Editar</button>
          <button class="btn btn-ghost" style="width:auto;padding:7px 12px;font-size:11.5px;" data-del="${c.id}">Excluir</button>
        </div>
      </div>
    </div>
  `).join("") || `<div class="empty">Nenhum culto cadastrado.</div>`;
  el.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", () => excluirRegistro("igr_cultos", b.dataset.del, carregarCultosAdmin)));
  el.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", () => {
    const item = (data || []).find(x => x.id === b.dataset.edit);
    if (item) iniciarEdicaoCulto(item);
  }));
}
function iniciarEdicaoCulto(item) {
  state.editando.culto = item;
  document.getElementById("ac-titulo").value = item.titulo || "";
  document.getElementById("ac-dia").value = item.dia_semana || "";
  document.getElementById("ac-horario").value = item.horario || "";
  document.getElementById("ac-local").value = item.local || "";
  definirValorData("ac-data", item.data);
  definirValorData("ac-data-inicio", item.data_inicio);
  definirValorData("ac-data-fim", item.data_fim);
  const btn = document.querySelector("#form-admin-culto button[type=submit]");
  btn.textContent = "Salvar alterações";
  document.getElementById("ac-cancelar-edicao").style.display = "inline-block";
  document.getElementById("form-admin-culto").scrollIntoView({ behavior: "smooth", block: "start" });
}
function cancelarEdicaoCulto() {
  state.editando.culto = null;
  document.getElementById("form-admin-culto").reset();
  document.querySelector("#form-admin-culto button[type=submit]").textContent = "Adicionar culto";
  document.getElementById("ac-cancelar-edicao").style.display = "none";
}
async function enviarCultoAdmin(ev) {
  ev.preventDefault();
  const titulo = document.getElementById("ac-titulo").value.trim();
  const dia_semana = document.getElementById("ac-dia").value.trim();
  const horario = document.getElementById("ac-horario").value.trim();
  const local = document.getElementById("ac-local").value.trim();
  const data_especifica = document.getElementById("ac-data").value || null;
  const data_inicio = document.getElementById("ac-data-inicio").value || null;
  const data_fim = document.getElementById("ac-data-fim").value || null;
  if (!titulo || !horario || (!dia_semana && !data_especifica)) {
    alert("Preencha o título, o horário, e o dia da semana (ou uma data específica).");
    return;
  }
  if (!state.igreja) { alert("Ainda carregando os dados da igreja. Aguarde um instante e tente de novo."); return; }
  const btn = ev.target.querySelector("button[type=submit]");
  const editando = state.editando.culto;
  btn.disabled = true; btn.textContent = "Enviando...";
  try {
    const arquivo = document.getElementById("ac-imagem").files[0];
    const novaImagem = await uploadArquivo(arquivo, "cultos");
    if (editando) {
      const imagem_url = novaImagem || editando.imagem_url || null;
      const { error } = await sb.from("igr_cultos").update({ titulo, dia_semana, horario, local, imagem_url, data: data_especifica, data_inicio, data_fim }).eq("id", editando.id);
      if (error) { alert("Não deu pra salvar as alterações: " + error.message); return; }
      cancelarEdicaoCulto();
    } else {
      const { error } = await sb.from("igr_cultos").insert({ igreja_id: state.igreja.id, titulo, dia_semana, horario, local, imagem_url: novaImagem, data: data_especifica, data_inicio, data_fim, ordem: Date.now() });
      if (error) { alert("Não deu pra salvar o culto: " + error.message); return; }
      ev.target.reset();
    }
    carregarCultosAdmin();
  } catch (e) {
    console.error("Erro ao salvar culto:", e);
    alert("Não deu pra salvar agora. Verifique sua conexão e tente de novo.");
  } finally {
    btn.disabled = false;
    if (!state.editando.culto) btn.textContent = "Adicionar culto";
  }
}

// ---------- admin: avisos gerais ----------
async function carregarAvisosAdmin() {
  const el = document.getElementById("admin-lista-avisos");
  const { data } = await sb.from("igr_avisos").select("*, igr_grupos(nome)").eq("igreja_id", state.igreja.id).order("publicado_em", { ascending: false });
  el.innerHTML = (data || []).map(a => `
    <div class="card">
      ${a.imagem_url ? `<img class="capa-thumb" src="${a.imagem_url}" alt="">` : ""}
      ${a.video_url ? `<video class="capa-thumb" src="${a.video_url}" controls playsinline></video>` : ""}
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
        <div><b style="font-size:13.5px;">${a.titulo}</b><br><span class="hint" style="margin:0;">${a.igr_grupos?.nome || "Geral"}</span></div>
        <div style="display:flex;gap:6px;flex:none;">
          <button class="btn btn-ghost" style="width:auto;padding:7px 12px;font-size:11.5px;" data-edit="${a.id}">Editar</button>
          <button class="btn btn-ghost" style="width:auto;padding:7px 12px;font-size:11.5px;" data-del="${a.id}">Excluir</button>
        </div>
      </div>
    </div>
  `).join("") || `<div class="empty">Nenhum aviso cadastrado.</div>`;
  el.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", () => excluirRegistro("igr_avisos", b.dataset.del, carregarAvisosAdmin)));
  el.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", () => {
    const item = (data || []).find(x => x.id === b.dataset.edit);
    if (item) iniciarEdicaoAviso(item);
  }));
}
function iniciarEdicaoAviso(item) {
  state.editando.aviso = item;
  document.getElementById("aa-titulo").value = item.titulo || "";
  document.getElementById("aa-texto").value = item.texto || "";
  const btn = document.querySelector("#form-admin-aviso button[type=submit]");
  btn.textContent = "Salvar alterações";
  document.getElementById("aa-cancelar-edicao").style.display = "inline-block";
  document.getElementById("form-admin-aviso").scrollIntoView({ behavior: "smooth", block: "start" });
}
function cancelarEdicaoAviso() {
  state.editando.aviso = null;
  document.getElementById("form-admin-aviso").reset();
  document.querySelector("#form-admin-aviso button[type=submit]").textContent = "Publicar aviso";
  document.getElementById("aa-cancelar-edicao").style.display = "none";
}
async function enviarAvisoAdmin(ev) {
  ev.preventDefault();
  const titulo = document.getElementById("aa-titulo").value.trim();
  const texto = document.getElementById("aa-texto").value.trim();
  if (!titulo) return;
  if (!state.igreja) { alert("Ainda carregando os dados da igreja. Aguarde um instante e tente de novo."); return; }
  const btn = ev.target.querySelector("button[type=submit]");
  const editando = state.editando.aviso;
  btn.disabled = true; btn.textContent = "Enviando...";
  try {
    const arquivo = document.getElementById("aa-imagem").files[0];
    const arquivoVideo = document.getElementById("aa-video").files[0];
    const novaImagem = await uploadArquivo(arquivo, "avisos");
    const novoVideo = await uploadArquivo(arquivoVideo, "avisos");
    if (editando) {
      const imagem_url = novaImagem || editando.imagem_url || null;
      const video_url = novoVideo || editando.video_url || null;
      const { error } = await sb.from("igr_avisos").update({ titulo, texto, imagem_url, video_url }).eq("id", editando.id);
      if (error) { alert("Não deu pra salvar as alterações: " + error.message); return; }
      cancelarEdicaoAviso();
    } else {
      const { error } = await sb.from("igr_avisos").insert({ igreja_id: state.igreja.id, titulo, texto, imagem_url: novaImagem, video_url: novoVideo, publicado_em: new Date().toISOString() });
      if (error) { alert("Não deu pra publicar o aviso: " + error.message); return; }
      ev.target.reset();
      enviarPush({ tipo: "todos" }, titulo, texto);
    }
    carregarAvisosAdmin();
  } catch (e) {
    console.error("Erro ao publicar aviso:", e);
    alert("Não deu pra publicar agora. Verifique sua conexão e tente de novo.");
  } finally {
    btn.disabled = false;
    if (!state.editando.aviso) btn.textContent = "Publicar aviso";
  }
}

// ---------- admin: mensagens do pastor ----------
async function carregarPastorAdmin() {
  const el = document.getElementById("admin-lista-pastor");
  const { data } = await sb.from("igr_mensagens_pastor").select("*").eq("igreja_id", state.igreja.id).order("publicado_em", { ascending: false });
  el.innerHTML = (data || []).map(m => `
    <div class="card">
      ${m.capa_url ? `<img class="capa-thumb" src="${m.capa_url}" alt="">` : ""}
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
        <div><b style="font-size:13.5px;">${m.titulo}</b><br><span class="hint" style="margin:0;">${m.autor || ""}</span></div>
        <div style="display:flex;gap:6px;flex:none;">
          <button class="btn btn-ghost" style="width:auto;padding:7px 12px;font-size:11.5px;" data-edit="${m.id}">Editar</button>
          <button class="btn btn-ghost" style="width:auto;padding:7px 12px;font-size:11.5px;" data-del="${m.id}">Excluir</button>
        </div>
      </div>
    </div>
  `).join("") || `<div class="empty">Nenhuma mensagem cadastrada.</div>`;
  el.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", () => excluirRegistro("igr_mensagens_pastor", b.dataset.del, carregarPastorAdmin)));
  el.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", () => {
    const item = (data || []).find(x => x.id === b.dataset.edit);
    if (item) iniciarEdicaoPastor(item);
  }));
}
function iniciarEdicaoPastor(item) {
  state.editando.pastor = item;
  document.getElementById("ap-titulo").value = item.titulo || "";
  document.getElementById("ap-autor").value = item.autor || "";
  document.getElementById("ap-resumo").value = item.resumo || "";
  document.getElementById("ap-video").value = item.video_url || "";
  const btn = document.querySelector("#form-admin-pastor button[type=submit]");
  btn.textContent = "Salvar alterações";
  document.getElementById("ap-cancelar-edicao").style.display = "inline-block";
  document.getElementById("form-admin-pastor").scrollIntoView({ behavior: "smooth", block: "start" });
}
function cancelarEdicaoPastor() {
  state.editando.pastor = null;
  document.getElementById("form-admin-pastor").reset();
  document.querySelector("#form-admin-pastor button[type=submit]").textContent = "Publicar mensagem";
  document.getElementById("ap-cancelar-edicao").style.display = "none";
}
async function enviarPastorAdmin(ev) {
  ev.preventDefault();
  const titulo = document.getElementById("ap-titulo").value.trim();
  const autor = document.getElementById("ap-autor").value.trim();
  const resumo = document.getElementById("ap-resumo").value.trim();
  const video_url = document.getElementById("ap-video").value.trim();
  if (!titulo || !resumo) return;
  if (!state.igreja) { alert("Ainda carregando os dados da igreja. Aguarde um instante e tente de novo."); return; }
  const btn = ev.target.querySelector("button[type=submit]");
  const editando = state.editando.pastor;
  btn.disabled = true; btn.textContent = "Enviando...";
  try {
    const arquivo = document.getElementById("ap-capa").files[0];
    const novaCapa = await uploadArquivo(arquivo, "pastor");
    if (editando) {
      const capa_url = novaCapa || editando.capa_url || null;
      const { error } = await sb.from("igr_mensagens_pastor").update({ titulo, autor, resumo, video_url, capa_url }).eq("id", editando.id);
      if (error) { alert("Não deu pra salvar as alterações: " + error.message); return; }
      cancelarEdicaoPastor();
    } else {
      const { error } = await sb.from("igr_mensagens_pastor").insert({ igreja_id: state.igreja.id, titulo, autor, resumo, video_url, capa_url: novaCapa, publicado_em: new Date().toISOString() });
      if (error) { alert("Não deu pra publicar a mensagem: " + error.message); return; }
      ev.target.reset();
    }
    carregarPastorAdmin();
  } catch (e) {
    console.error("Erro ao publicar mensagem do pastor:", e);
    alert("Não deu pra publicar agora. Verifique sua conexão e tente de novo.");
  } finally {
    btn.disabled = false;
    if (!state.editando.pastor) btn.textContent = "Publicar mensagem";
  }
}

// ---------- admin: esboços ----------
async function carregarEsbocosAdmin() {
  const el = document.getElementById("admin-lista-esbocos");
  const { data } = await sb.from("igr_esbocos").select("*").eq("igreja_id", state.igreja.id).order("created_at", { ascending: false });
  el.innerHTML = (data || []).map(e => `
    <div class="card">
      ${e.capa_url ? `<img class="capa-thumb" src="${e.capa_url}" alt="">` : ""}
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
        <div><b style="font-size:13.5px;">${e.titulo}</b><br><span class="hint" style="margin:0;">${e.autor || ""}</span></div>
        <div style="display:flex;gap:6px;flex:none;">
          <button class="btn btn-ghost" style="width:auto;padding:7px 12px;font-size:11.5px;" data-edit="${e.id}">Editar</button>
          <button class="btn btn-ghost" style="width:auto;padding:7px 12px;font-size:11.5px;" data-del="${e.id}">Excluir</button>
        </div>
      </div>
    </div>
  `).join("") || `<div class="empty">Nenhum esboço cadastrado.</div>`;
  el.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", () => excluirRegistro("igr_esbocos", b.dataset.del, carregarEsbocosAdmin)));
  el.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", () => {
    const item = (data || []).find(x => x.id === b.dataset.edit);
    if (item) iniciarEdicaoEsboco(item);
  }));
}
function iniciarEdicaoEsboco(item) {
  state.editando.esboco = item;
  document.getElementById("ae-titulo").value = item.titulo || "";
  document.getElementById("ae-pregador").value = item.autor || "";
  const btn = document.querySelector("#form-admin-esboco button[type=submit]");
  btn.textContent = "Salvar alterações";
  document.getElementById("ae-cancelar-edicao").style.display = "inline-block";
  document.getElementById("form-admin-esboco").scrollIntoView({ behavior: "smooth", block: "start" });
}
function cancelarEdicaoEsboco() {
  state.editando.esboco = null;
  document.getElementById("form-admin-esboco").reset();
  document.querySelector("#form-admin-esboco button[type=submit]").textContent = "Publicar esboço";
  document.getElementById("ae-cancelar-edicao").style.display = "none";
}
async function enviarEsbocoAdmin(ev) {
  ev.preventDefault();
  const titulo = document.getElementById("ae-titulo").value.trim();
  const autor = document.getElementById("ae-pregador").value.trim();
  if (!titulo) return;
  if (!state.igreja) { alert("Ainda carregando os dados da igreja. Aguarde um instante e tente de novo."); return; }
  const btn = ev.target.querySelector("button[type=submit]");
  const editando = state.editando.esboco;
  btn.disabled = true; btn.textContent = "Enviando...";
  try {
    const [novaCapa, novoArquivo] = await Promise.all([
      uploadArquivo(document.getElementById("ae-capa").files[0], "esbocos"),
      uploadArquivo(document.getElementById("ae-arquivo").files[0], "esbocos"),
    ]);
    if (editando) {
      const capa_url = novaCapa || editando.capa_url || null;
      const arquivo_url = novoArquivo || editando.arquivo_url || null;
      const { error } = await sb.from("igr_esbocos").update({ titulo, autor, capa_url, arquivo_url }).eq("id", editando.id);
      if (error) { alert("Não deu pra salvar as alterações: " + error.message); return; }
      cancelarEdicaoEsboco();
    } else {
      const { error } = await sb.from("igr_esbocos").insert({ igreja_id: state.igreja.id, titulo, autor, capa_url: novaCapa, arquivo_url: novoArquivo });
      if (error) { alert("Não deu pra publicar o esboço: " + error.message); return; }
      ev.target.reset();
      enviarPush({ tipo: "todos" }, "Novo estudo disponível 📖", titulo);
    }
    carregarEsbocosAdmin();
  } catch (e) {
    console.error("Erro ao publicar esboço:", e);
    alert("Não deu pra publicar agora. Verifique sua conexão e tente de novo.");
  } finally {
    btn.disabled = false;
    if (!state.editando.esboco) btn.textContent = "Publicar esboço";
  }
}

// ---------- admin: álbuns de fotos ----------
async function carregarAlbunsAdmin() {
  const { data } = await sb.from("igr_fotos_albuns").select("*").eq("igreja_id", state.igreja.id).order("created_at", { ascending: false });
  state.albunsCache = data || [];

  const select = document.getElementById("af-album-selecionado");
  const selecionadoAntes = select.value;
  select.innerHTML = `<option value="">Selecione um álbum</option>` +
    state.albunsCache.map(a => `<option value="${a.id}">${a.titulo}</option>`).join("");
  if (selecionadoAntes) select.value = selecionadoAntes;
  popularAlbunsParaMarcacao();

  const el = document.getElementById("admin-lista-albuns");
  el.innerHTML = state.albunsCache.map(a => `
    <div class="card">
      ${a.capa_url ? `<img class="capa-thumb" src="${a.capa_url}" alt="">` : ""}
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
        <div><b style="font-size:13.5px;">${a.titulo}</b><br><span class="hint" style="margin:0;">${a.data ? formatarData(a.data) : ""}</span></div>
        <div style="display:flex;gap:6px;flex:none;">
          <button class="btn btn-ghost" style="width:auto;padding:7px 12px;font-size:11.5px;" data-edit-album="${a.id}">Editar</button>
          <button class="btn btn-ghost" style="width:auto;padding:7px 12px;font-size:11.5px;" data-del-album="${a.id}">Excluir</button>
        </div>
      </div>
    </div>
  `).join("") || `<div class="empty">Nenhum álbum criado ainda.</div>`;
  el.querySelectorAll("[data-del-album]").forEach(b => b.addEventListener("click", () => excluirRegistro("igr_fotos_albuns", b.dataset.delAlbum, carregarAlbunsAdmin)));
  el.querySelectorAll("[data-edit-album]").forEach(b => b.addEventListener("click", () => {
    const item = state.albunsCache.find(a => a.id === b.dataset.editAlbum);
    if (item) iniciarEdicaoAlbum(item);
  }));
}
function iniciarEdicaoAlbum(item) {
  state.editando.album = item;
  document.getElementById("af-titulo").value = item.titulo || "";
  definirValorData("af-data", item.data);
  const btn = document.querySelector("#form-admin-album button[type=submit]");
  btn.textContent = "Salvar alterações";
  document.getElementById("af-cancelar-edicao").style.display = "inline-block";
  document.getElementById("form-admin-album").scrollIntoView({ behavior: "smooth", block: "start" });
}
function cancelarEdicaoAlbum() {
  state.editando.album = null;
  document.getElementById("form-admin-album").reset();
  document.querySelector("#form-admin-album button[type=submit]").textContent = "Criar álbum";
  document.getElementById("af-cancelar-edicao").style.display = "none";
}

async function enviarAlbumAdmin(ev) {
  ev.preventDefault();
  const titulo = document.getElementById("af-titulo").value.trim();
  const data = document.getElementById("af-data").value || null;
  if (!titulo) return;
  if (!state.igreja) { alert("Ainda carregando os dados da igreja. Aguarde um instante e tente de novo."); return; }
  const btn = ev.target.querySelector("button[type=submit]");
  const editando = state.editando.album;
  btn.disabled = true; btn.textContent = editando ? "Salvando..." : "Criando...";
  try {
    const arquivo = document.getElementById("af-capa").files[0];
    const novaCapa = await uploadArquivo(arquivo, "fotos-capas");
    if (editando) {
      const capa_url = novaCapa || editando.capa_url || null;
      const { error } = await sb.from("igr_fotos_albuns").update({ titulo, data, capa_url }).eq("id", editando.id);
      if (error) { alert("Não deu pra salvar as alterações: " + error.message); return; }
      cancelarEdicaoAlbum();
    } else {
      const { error } = await sb.from("igr_fotos_albuns").insert({ igreja_id: state.igreja.id, titulo, data, capa_url: novaCapa });
      if (error) { alert("Não deu pra criar o álbum: " + error.message); return; }
      ev.target.reset();
    }
    carregarAlbunsAdmin();
  } catch (e) {
    console.error("Erro ao criar álbum:", e);
    alert("Não deu pra salvar agora. Verifique sua conexão e tente de novo.");
  } finally {
    btn.disabled = false;
    if (!state.editando.album) btn.textContent = "Criar álbum";
  }
}

async function enviarFotosAlbum() {
  const albumId = document.getElementById("af-album-selecionado").value;
  const arquivos = Array.from(document.getElementById("af-fotos").files);
  if (!albumId) { alert("Escolha um álbum primeiro."); return; }
  if (!arquivos.length) { alert("Escolha pelo menos uma foto."); return; }

  const btn = document.getElementById("btn-enviar-fotos");
  const progresso = document.getElementById("af-progresso");
  btn.disabled = true;
  progresso.style.display = "block";
  const logoUrl = state.igreja?.logo_url || "assets/logo.png";

  try {
    let enviadas = 0;
    let primeiraUrl = null;
    for (const arquivo of arquivos) {
      progresso.textContent = `Enviando foto ${enviadas + 1} de ${arquivos.length}...`;
      const comMarca = await aplicarMarcaDagua(arquivo, logoUrl);
      const url = await uploadArquivo(comMarca, "fotos/" + albumId);
      if (url) {
        await sb.from("igr_fotos").insert({ album_id: albumId, url });
        if (!primeiraUrl) primeiraUrl = url;
        enviadas++;
      }
    }
    if (primeiraUrl) {
      const album = (state.albunsCache || []).find(a => a.id === albumId);
      if (album && !album.capa_url) {
        await sb.from("igr_fotos_albuns").update({ capa_url: primeiraUrl }).eq("id", albumId);
      }
    }
    progresso.textContent = `${enviadas} de ${arquivos.length} fotos enviadas com sucesso 💛`;
    document.getElementById("af-fotos").value = "";
    carregarAlbunsAdmin();
  } catch (e) {
    console.error("Erro ao enviar fotos:", e);
    progresso.textContent = "Algo deu errado no envio. Tente de novo.";
  } finally {
    btn.disabled = false;
  }
}

// ---------- admin: dados da igreja (endereço/redes) ----------
function preencherFormIgrejaAdmin() {
  const ig = state.igreja || {};
  document.getElementById("ai-sobre").value = ig.sobre_texto || "";
  document.getElementById("ai-endereco").value = ig.endereco || "";
  document.getElementById("ai-instagram").value = ig.instagram_url || "";
  document.getElementById("ai-facebook").value = ig.facebook_url || "";
  document.getElementById("ai-whatsapp").value = ig.whatsapp_contato || "";
}
async function enviarIgrejaAdmin(ev) {
  ev.preventDefault();
  if (!state.igreja) { alert("Ainda carregando os dados da igreja. Aguarde um instante e tente de novo."); return; }
  const sobre_texto = document.getElementById("ai-sobre").value.trim();
  const endereco = document.getElementById("ai-endereco").value.trim();
  const instagram_url = document.getElementById("ai-instagram").value.trim();
  const facebook_url = document.getElementById("ai-facebook").value.trim();
  const whatsapp_contato = document.getElementById("ai-whatsapp").value.trim();
  const btn = ev.target.querySelector("button[type=submit]");
  btn.disabled = true; btn.textContent = "Salvando...";
  try {
    const { error } = await sb.from("igr_igrejas").update({ sobre_texto, endereco, instagram_url, facebook_url, whatsapp_contato }).eq("id", state.igreja.id);
    if (error) { alert("Não deu pra salvar: " + error.message); return; }
    Object.assign(state.igreja, { sobre_texto, endereco, instagram_url, facebook_url, whatsapp_contato });
    aplicarMarca(state.igreja);
    alert("Salvo com sucesso 💛");
  } catch (e) {
    console.error("Erro ao salvar dados da igreja:", e);
    alert("Não deu pra salvar agora. Verifique sua conexão e tente de novo.");
  } finally {
    btn.disabled = false; btn.textContent = "Salvar";
  }
}

// ---------- admin: liderança (pastores) ----------
async function carregarPastoresPerfilAdmin() {
  const { data } = await sb.from("igr_pastores").select("*").eq("igreja_id", state.igreja.id).order("ordem");
  state.pastoresCache = data || [];
  const el = document.getElementById("admin-lista-pastores-perfil");
  el.innerHTML = state.pastoresCache.map(p => `
    <div class="card">
      ${p.foto_url ? `<img class="capa-thumb" style="height:90px;" src="${p.foto_url}" alt="">` : ""}
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
        <div><b style="font-size:13.5px;">${p.nome}</b><br><span class="hint" style="margin:0;">${p.cargo || ""}</span></div>
        <div style="display:flex;gap:6px;flex:none;">
          <button class="btn btn-ghost" style="width:auto;padding:7px 12px;font-size:11.5px;" data-edit-pastor="${p.id}">Editar</button>
          <button class="btn btn-ghost" style="width:auto;padding:7px 12px;font-size:11.5px;" data-del-pastor="${p.id}">Excluir</button>
        </div>
      </div>
    </div>
  `).join("") || `<div class="empty">Nenhuma liderança cadastrada.</div>`;
  el.querySelectorAll("[data-del-pastor]").forEach(b => b.addEventListener("click", () => excluirRegistro("igr_pastores", b.dataset.delPastor, carregarPastoresPerfilAdmin)));
  el.querySelectorAll("[data-edit-pastor]").forEach(b => b.addEventListener("click", () => {
    const item = state.pastoresCache.find(p => p.id === b.dataset.editPastor);
    if (item) iniciarEdicaoPastorPerfil(item);
  }));
}
function iniciarEdicaoPastorPerfil(item) {
  state.editando.pastorPerfil = item;
  document.getElementById("app-nome").value = item.nome || "";
  document.getElementById("app-cargo").value = item.cargo || "";
  const btn = document.querySelector("#form-admin-pastor-perfil button[type=submit]");
  btn.textContent = "Salvar alterações";
  document.getElementById("app-cancelar-edicao").style.display = "inline-block";
  document.getElementById("form-admin-pastor-perfil").scrollIntoView({ behavior: "smooth", block: "start" });
}
function cancelarEdicaoPastorPerfil() {
  state.editando.pastorPerfil = null;
  document.getElementById("form-admin-pastor-perfil").reset();
  document.querySelector("#form-admin-pastor-perfil button[type=submit]").textContent = "Adicionar";
  document.getElementById("app-cancelar-edicao").style.display = "none";
}
async function enviarPastorPerfilAdmin(ev) {
  ev.preventDefault();
  const nome = document.getElementById("app-nome").value.trim();
  const cargo = document.getElementById("app-cargo").value.trim();
  if (!nome) return;
  if (!state.igreja) { alert("Ainda carregando os dados da igreja. Aguarde um instante e tente de novo."); return; }
  const btn = ev.target.querySelector("button[type=submit]");
  const editando = state.editando.pastorPerfil;
  btn.disabled = true; btn.textContent = "Enviando...";
  try {
    const arquivo = document.getElementById("app-foto").files[0];
    const novaFoto = await uploadArquivo(arquivo, "pastores");
    if (editando) {
      const foto_url = novaFoto || editando.foto_url || null;
      const { error } = await sb.from("igr_pastores").update({ nome, cargo, foto_url }).eq("id", editando.id);
      if (error) { alert("Não deu pra salvar as alterações: " + error.message); return; }
      cancelarEdicaoPastorPerfil();
    } else {
      const { error } = await sb.from("igr_pastores").insert({ igreja_id: state.igreja.id, nome, cargo, foto_url: novaFoto, ordem: Date.now() });
      if (error) { alert("Não deu pra adicionar: " + error.message); return; }
      ev.target.reset();
    }
    carregarPastoresPerfilAdmin();
  } catch (e) {
    console.error("Erro ao salvar liderança:", e);
    alert("Não deu pra salvar agora. Verifique sua conexão e tente de novo.");
  } finally {
    btn.disabled = false;
    if (!state.editando.pastorPerfil) btn.textContent = "Adicionar";
  }
}

// ---------- add to home screen ----------
// ---------- notificações push ----------
const VAPID_PUBLIC_KEY = "BMq_lW6h3iwNZ5RICFE-zjLqdUxRCyIIHpbDQA65WqUp-rBkBmiCxDnC--sPNdNIXvm0vcFpj_n1ActS7V_v2Co";

function base64ParaUint8Array(base64) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Seguro = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Seguro);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

async function registrarServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("sw.js");
  } catch (e) {
    console.error("Erro ao registrar service worker:", e);
    return null;
  }
}

async function configurarCaixaPush() {
  const box = document.getElementById("push-ativar-box");
  if (!box || !state.membro) return;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) { box.style.display = "none"; return; }
  if (Notification.permission === "denied") { box.style.display = "none"; return; }

  const reg = await navigator.serviceWorker.getRegistration();
  const inscricaoAtual = reg ? await reg.pushManager.getSubscription() : null;
  box.style.display = inscricaoAtual ? "none" : "block";
}

async function ativarPush() {
  const btn = document.getElementById("btn-ativar-push");
  btn.disabled = true; btn.textContent = "Ativando...";
  try {
    const permissao = await Notification.requestPermission();
    if (permissao !== "granted") {
      alert("Sem a permissão de notificações não conseguimos te avisar. Você pode ativar depois nas configurações do navegador.");
      return;
    }
    const reg = await registrarServiceWorker();
    if (!reg) { alert("Seu navegador não suporta notificações push."); return; }
    const inscricao = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64ParaUint8Array(VAPID_PUBLIC_KEY),
    });
    const json = inscricao.toJSON();
    const { error } = await sb.from("igr_push_subscricoes").upsert({
      membro_id: state.membro.id,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    }, { onConflict: "membro_id,endpoint" });
    if (error) { alert("Não deu pra ativar agora: " + error.message); return; }
    document.getElementById("push-ativar-box").style.display = "none";
  } catch (e) {
    console.error("Erro ao ativar push:", e);
    alert("Não deu pra ativar agora. Tente de novo em instantes.");
  } finally {
    btn.disabled = false; btn.textContent = "Ativar";
  }
}

async function enviarPush(filtro, titulo, texto, url) {
  try {
    await sb.functions.invoke("igr-enviar-push", {
      body: { igreja_id: state.igreja.id, titulo, texto, url: url || "./", filtro },
    });
  } catch (e) {
    console.error("Erro ao enviar push:", e);
  }
}

// Android/Chrome permitem disparar o instalador nativo com 1 toque via essa API.
// iOS Safari não tem NENHUMA API pra isso — a Apple só deixa a própria pessoa
// fazer manualmente pelo menu de Compartilhar. Isso é uma limitação da Apple,
// não uma coisa que dê pra contornar em código.
let promptInstalacaoAdiado = null;
window.addEventListener("beforeinstallprompt", (ev) => {
  ev.preventDefault();
  promptInstalacaoAdiado = ev;
  const btn = document.getElementById("btn-instalar-agora");
  if (btn) btn.style.display = "inline-flex";
});

function configurarBannerA2HS() {
  if (localStorage.getItem("igr_a2hs_fechado")) return;
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua);
  document.querySelectorAll(".a2hs-texto").forEach(el => {
    el.textContent = isIOS
      ? 'No iPhone, a Apple só permite fazer manualmente: toque em Compartilhar (□↑) e depois em "Adicionar à Tela de Início".'
      : 'Toque no botão abaixo pra instalar com 1 toque.';
  });
  document.querySelectorAll(".a2hs").forEach(el => el.style.display = "flex");
  const btn = document.getElementById("btn-instalar-agora");
  if (btn) btn.style.display = (!isIOS && promptInstalacaoAdiado) ? "inline-flex" : "none";
}
async function instalarAgora(ev) {
  ev.stopPropagation();
  if (!promptInstalacaoAdiado) return;
  promptInstalacaoAdiado.prompt();
  await promptInstalacaoAdiado.userChoice;
  promptInstalacaoAdiado = null;
  fecharA2HS();
}
function fecharA2HS() {
  localStorage.setItem("igr_a2hs_fechado", "1");
  document.querySelectorAll(".a2hs").forEach(el => el.style.display = "none");
}

// ---------- inicialização ----------
async function iniciar() {
  // Os botões são ligados PRIMEIRO, antes de qualquer chamada à rede.
  // Assim, mesmo que carregarIgreja/carregarCultos/carregarAvisos falhem
  // (rede instável, etc.), os botões continuam funcionando.
  document.getElementById("form-visitante").addEventListener("submit", enviarContatoVisitante);
  document.getElementById("form-cadastro").addEventListener("submit", concluirCadastro);
  document.getElementById("cad-batizado")?.addEventListener("change", (ev) => {
    document.getElementById("cad-batismo-detalhes").style.display = ev.target.value === "sim" ? "block" : "none";
  });
  document.getElementById("cad-tem-parentes")?.addEventListener("change", (ev) => {
    document.getElementById("cad-parentes-detalhes").style.display = ev.target.value === "sim" ? "block" : "none";
  });
  configurarBuscaParentes("cad-busca-parente", "cad-parente-sugestoes", "cad-parentes-selecionados", "parentesSelecionados");
  renderInteresses("cad-interesses-lista");
  document.getElementById("form-editar-perfil")?.addEventListener("submit", enviarEditarPerfil);
  document.getElementById("form-trocar-senha")?.addEventListener("submit", enviarTrocarSenha);
  document.getElementById("btn-meu-perfil")?.addEventListener("click", abrirEditarPerfil);
  document.getElementById("link-trocar-senha")?.addEventListener("click", () => {
    const form = document.getElementById("form-trocar-senha");
    form.style.display = form.style.display === "none" ? "block" : "none";
  });
  document.getElementById("ep-batizado")?.addEventListener("change", (ev) => {
    document.getElementById("ep-batismo-detalhes").style.display = ev.target.value === "sim" ? "block" : "none";
  });
  document.getElementById("ep-tem-parentes")?.addEventListener("change", (ev) => {
    document.getElementById("ep-parentes-detalhes").style.display = ev.target.value === "sim" ? "block" : "none";
  });
  configurarBuscaParentes("ep-busca-parente", "ep-parente-sugestoes", "ep-parentes-selecionados", "parentesSelecionadosPerfil");
  renderInteresses("ep-interesses-lista");
  document.getElementById("form-admin-login").addEventListener("submit", enviarLoginAdmin);
  document.getElementById("form-admin-culto")?.addEventListener("submit", enviarCultoAdmin);
  document.getElementById("form-admin-novo-lider")?.addEventListener("submit", enviarNovoLiderAdmin);
  document.getElementById("btn-exportar-membros")?.addEventListener("click", exportarMembrosCSV);
  document.getElementById("btn-exportar-grupo-membros")?.addEventListener("click", exportarGrupoMembrosCSV);
  document.getElementById("form-ficha-membro")?.addEventListener("submit", salvarFichaMembro);
  document.getElementById("btn-excluir-membro")?.addEventListener("click", excluirMembroAdmin);
  document.getElementById("btn-resetar-pin-membro")?.addEventListener("click", resetarPinMembro);
  document.getElementById("btn-admin-area-membro")?.addEventListener("click", () => {
    mostrarTela(state.membro ? "tela-membro-home" : "tela-login");
  });
  document.querySelector("[data-voltar-lista-membros]")?.addEventListener("click", () => carregarMembrosAdminGrupos());
  document.querySelector("[data-voltar-editar-grupo]")?.addEventListener("click", () => carregarMembrosAdminGrupos());
  document.getElementById("form-editar-grupo")?.addEventListener("submit", salvarEdicaoGrupoAdmin);
  document.querySelector("[data-voltar-ficha-membro]")?.addEventListener("click", () => abrirGrupoDeMembros(estadoMembrosAdmin.grupoId, estadoMembrosAdmin.grupoNome));
  document.getElementById("form-admin-aviso")?.addEventListener("submit", enviarAvisoAdmin);
  document.getElementById("form-admin-pastor")?.addEventListener("submit", enviarPastorAdmin);
  document.getElementById("form-admin-esboco")?.addEventListener("submit", enviarEsbocoAdmin);
  document.getElementById("form-admin-album")?.addEventListener("submit", enviarAlbumAdmin);
  document.getElementById("btn-enviar-fotos")?.addEventListener("click", enviarFotosAlbum);
  document.getElementById("form-admin-igreja")?.addEventListener("submit", enviarIgrejaAdmin);
  document.getElementById("form-admin-pastor-perfil")?.addEventListener("submit", enviarPastorPerfilAdmin);
  document.getElementById("form-grupo-info")?.addEventListener("submit", enviarGrupoInfo);
  document.getElementById("form-grupo-aviso")?.addEventListener("submit", enviarAvisoGrupoDetalhe);
  document.getElementById("form-louvor-escala")?.addEventListener("submit", enviarEscalaLouvor);
  document.getElementById("form-louvor-participante")?.addEventListener("submit", enviarParticipanteLouvor);
  document.getElementById("form-louvor-musica")?.addEventListener("submit", enviarMusicaLouvor);
  document.getElementById("form-louvor-evento")?.addEventListener("submit", enviarEventoLouvor);
  configurarAbasAdmin();
  estilizarInputsArquivo();
  estilizarInputsData();
  configurarEditorFoto();
  document.getElementById("ep-foto")?.addEventListener("change", async (ev) => {
    const arquivo = ev.target.files[0];
    if (!arquivo) return;
    const url = URL.createObjectURL(arquivo);
    const resultado = await abrirEditorFoto(url);
    if (resultado) {
      state.fotoPerfilRecortada = resultado;
      document.getElementById("ep-foto-preview").src = URL.createObjectURL(resultado);
    }
    URL.revokeObjectURL(url);
  });
  document.getElementById("ep-foto-preview")?.addEventListener("click", async () => {
    const semFotoAinda = !state.fotoPerfilRecortada && !state.membro?.foto_url;
    if (semFotoAinda) { alert("Escolha uma foto primeiro, com o botão acima."); return; }
    const fonte = state.fotoPerfilRecortada ? URL.createObjectURL(state.fotoPerfilRecortada) : document.getElementById("ep-foto-preview").src;
    const resultado = await abrirEditorFoto(fonte);
    if (resultado) {
      state.fotoPerfilRecortada = resultado;
      document.getElementById("ep-foto-preview").src = URL.createObjectURL(resultado);
    }
  });
  document.getElementById("btn-ativar-push")?.addEventListener("click", ativarPush);
  registrarServiceWorker();
  document.getElementById("form-lider-aviso")?.addEventListener("submit", enviarAvisoLider);
  configurarPinBoxes();
  document.getElementById("login-form-telefone").addEventListener("submit", enviarLoginTelefone);
  document.getElementById("login-form-pin").addEventListener("submit", enviarLoginPin);
  document.getElementById("form-novo-pedido").addEventListener("submit", enviarPedidoOracao);

  document.querySelectorAll("[data-nav]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const alvo = btn.dataset.nav;
      mostrarTela(alvo);
      if (alvo === "tela-membro-estudos") await carregarEsbocos();
      if (alvo === "tela-membro-louvor") await carregarLouvor();
      if (alvo === "tela-membro-pastor") await carregarMensagensPastor();
      if (alvo === "tela-fotos") await carregarAlbuns();
      if (alvo === "tela-calendario") await carregarCalendario();
      if (alvo === "tela-biblia") await abrirBibliaLivros();
      if (alvo === "tela-minhas-fotos") await carregarMinhasFotos();
      if (alvo === "tela-contatos") carregarContatos();
      if (alvo === "tela-sobre-igreja") await carregarSobreIgreja();
      if (alvo === "tela-grupos-lista") await carregarGruposLista();
      if (alvo === "tela-diretorio") { configurarDiretorio(); document.getElementById("diretorio-voltar").dataset.nav = state.membro ? "tela-membro-home" : "tela-visitante"; }
      if (alvo === "tela-eventos") await carregarEventos();
      if (alvo === "tela-diario-historico") await carregarHistoricoDiario();
      if (alvo === "tela-diario-planos") await carregarPlanos();
    });
  });
  document.querySelectorAll("[data-close-a2hs]").forEach(b => b.addEventListener("click", fecharA2HS));
  document.getElementById("btn-instalar-agora")?.addEventListener("click", instalarAgora);
  document.getElementById("btn-criar-evento")?.addEventListener("click", () => abrirFormEvento(null));
  document.getElementById("btn-add-calendario")?.addEventListener("click", () => {
    const form = document.getElementById("form-calendario-add");
    form.style.display = form.style.display === "none" ? "block" : "none";
  });
  configurarAutocompleteLivroDiario();
  document.getElementById("btn-ver-texto-diario")?.addEventListener("click", verTextoDiario);
  document.getElementById("btn-salvar-diario")?.addEventListener("click", salvarLeituraDiario);
  document.getElementById("diario-busca-historico")?.addEventListener("input", renderHistoricoDiario);
  document.getElementById("btn-criar-plano")?.addEventListener("click", () => {
    document.getElementById("planos-view-lista").style.display = "none";
    document.getElementById("planos-view-criar").style.display = "block";
  });
  document.getElementById("plano-criar-voltar")?.addEventListener("click", carregarPlanos);
  document.getElementById("plano-voltar-lista")?.addEventListener("click", carregarPlanos);
  document.getElementById("btn-salvar-plano-novo")?.addEventListener("click", criarPlanoPersonalizado);
  document.getElementById("btn-tema-buscar")?.addEventListener("click", () => buscarPorTema("buscar"));
  document.getElementById("btn-tema-estudo")?.addEventListener("click", () => buscarPorTema("estudo"));
  document.getElementById("btn-abrir-aviso-lider")?.addEventListener("click", () => mostrarTela("tela-lider-aviso"));
  document.getElementById("btn-abrir-banner-lider")?.addEventListener("click", () => {
    document.getElementById("banner-view-form").style.display = "block";
    document.getElementById("banner-view-preview").style.display = "none";
    mostrarTela("tela-lider-banner");
  });
  document.getElementById("btn-gerar-banners")?.addEventListener("click", gerarBanners);
  document.getElementById("banner-voltar-form")?.addEventListener("click", () => {
    document.getElementById("banner-view-preview").style.display = "none";
    document.getElementById("banner-view-form").style.display = "block";
  });
  document.getElementById("btn-banner-gerar-novo")?.addEventListener("click", gerarBanners);
  document.getElementById("btn-banner-baixar")?.addEventListener("click", baixarBanner);
  document.getElementById("btn-banner-aprovar")?.addEventListener("click", aprovarBanner);
  document.getElementById("form-calendario-add")?.addEventListener("submit", enviarCalendario);
  document.getElementById("cal-mes-anterior")?.addEventListener("click", () => {
    state.calendarioMesAtual = new Date(state.calendarioMesAtual.getFullYear(), state.calendarioMesAtual.getMonth() - 1, 1);
    renderGradeCalendario();
  });
  document.getElementById("cal-mes-proximo")?.addEventListener("click", () => {
    state.calendarioMesAtual = new Date(state.calendarioMesAtual.getFullYear(), state.calendarioMesAtual.getMonth() + 1, 1);
    renderGradeCalendario();
  });
  document.getElementById("cal-voltar-mes")?.addEventListener("click", () => {
    document.getElementById("calendario-view-dia").style.display = "none";
    document.getElementById("calendario-view-mes").style.display = "block";
  });
  document.getElementById("btn-adm-add-calendario")?.addEventListener("click", enviarCalendarioAdmin);
  document.getElementById("biblia-voltar")?.addEventListener("click", () => mostrarTela(state.membro ? "tela-membro-home" : "tela-visitante"));
  configurarAutocompleteLivroBiblia();
  document.getElementById("btn-biblia-ir")?.addEventListener("click", irParaReferenciaBiblia);
  document.getElementById("btn-biblia-marcar-salvar")?.addEventListener("click", salvarMarcarVersiculo);
  document.getElementById("btn-biblia-marcar-cancelar")?.addEventListener("click", () => {
    document.getElementById("biblia-marcar-painel").style.display = "none";
  });
  document.getElementById("biblia-voltar-livros")?.addEventListener("click", () => abrirBibliaLivros());
  document.getElementById("biblia-voltar-capitulos")?.addEventListener("click", () => {
    document.getElementById("biblia-view-texto").style.display = "none";
    document.getElementById("biblia-view-capitulos").style.display = "block";
    document.getElementById("biblia-subtitulo").textContent = "Escolha um capítulo.";
  });
  document.getElementById("mf-album-selecionado")?.addEventListener("change", (ev) => carregarFotosParaMarcacao(ev.target.value));
  configurarBuscaMarcacaoFoto();
  configurarBuscaAcessos();
  document.getElementById("btn-salvar-acesso")?.addEventListener("click", salvarAcessoEspecial);
  configurarBuscaMonitor("");
  configurarBuscaMonitor("adm-");
  configurarBuscaPromoverLider();
  document.getElementById("btn-promover-lider")?.addEventListener("click", promoverMembroALider);
  configurarBuscaMonitorEdicaoAdmin();
  configurarBuscaMembroCelula();
  document.getElementById("btn-criar-celula")?.addEventListener("click", () => criarCelula(state.grupoDetalheAtual?.id, ""));
  document.getElementById("adm-btn-criar-celula")?.addEventListener("click", () => criarCelula(estadoMembrosAdmin.grupoEditando?.id, "adm-"));
  document.getElementById("form-editar-celula-admin")?.addEventListener("submit", salvarEdicaoCelulaAdmin);
  document.getElementById("adm-btn-excluir-celula")?.addEventListener("click", excluirCelulaAdmin);
  document.querySelector("[data-voltar-editar-celula]")?.addEventListener("click", () => {
    document.getElementById("admin-membros-view-editar-celula").style.display = "none";
    document.getElementById("admin-membros-view-editar-grupo").style.display = "block";
  });
  document.getElementById("btn-salvar-nome-celula")?.addEventListener("click", salvarNomeCelula);
  document.getElementById("form-celula-post")?.addEventListener("submit", enviarPostCelula);
  document.getElementById("quicklink-celula")?.addEventListener("click", () => {
    if (state.minhaCelulaId) abrirCelula(state.minhaCelulaId);
  });
  document.getElementById("btn-admin-novo-evento")?.addEventListener("click", () => abrirFormEvento(null));
  document.getElementById("form-evento")?.addEventListener("submit", enviarFormEvento);
  document.getElementById("ev-gratuito")?.addEventListener("change", (ev) => {
    document.getElementById("ev-pagamento-detalhes").style.display = ev.target.value === "nao" ? "block" : "none";
  });
  document.getElementById("btn-abrir-inscricao")?.addEventListener("click", abrirEscolhaInscricao);
  document.getElementById("btn-sou-membro")?.addEventListener("click", escolherSouMembro);
  document.getElementById("btn-sou-visitante")?.addEventListener("click", escolherSouVisitante);
  document.getElementById("btn-ir-login-evento")?.addEventListener("click", () => mostrarTela("tela-login"));
  document.getElementById("btn-inscrever-membro")?.addEventListener("click", inscreverMembroEvento);
  document.getElementById("form-inscricao-visitante")?.addEventListener("submit", inscreverVisitanteEvento);
  document.getElementById("btn-editar-evento")?.addEventListener("click", () => abrirFormEvento(state.eventoAtual));
  document.getElementById("btn-ver-inscritos")?.addEventListener("click", () => abrirInscritosEvento(state.eventoAtual));
  document.getElementById("btn-sair")?.addEventListener("click", sair);

  // ---- menu lateral (drawer) ----
  const drawer = document.getElementById("drawer");
  const drawerOverlay = document.getElementById("drawer-overlay");
  const abrirDrawer = () => {
    document.getElementById("drawer-inicio").dataset.nav = state.membro ? "tela-membro-home" : "tela-visitante";
    drawer.classList.add("open"); drawerOverlay.classList.add("open");
  };
  const fecharDrawer = () => { drawer.classList.remove("open"); drawerOverlay.classList.remove("open"); };
  document.getElementById("btn-abrir-drawer").addEventListener("click", abrirDrawer);
  drawerOverlay.addEventListener("click", fecharDrawer);
  document.querySelectorAll("[data-close-drawer]").forEach(el => el.addEventListener("click", fecharDrawer));
  document.getElementById("btn-abrir-perfil").addEventListener("click", () => {
    if (state.membro) { abrirEditarPerfil(); } else { mostrarTela("tela-login"); }
  });

  // ---- lightbox de fotos ----
  document.getElementById("lightbox-fechar").addEventListener("click", fecharLightbox);
  document.getElementById("aniv-modal-fechar").addEventListener("click", fecharModalAniversariante);
  document.getElementById("modal-aniversariante").addEventListener("click", (ev) => {
    if (ev.target.id === "modal-aniversariante") fecharModalAniversariante();
  });
  document.getElementById("lightbox-prev").addEventListener("click", () => lightboxProxima(-1));
  document.getElementById("lightbox-next").addEventListener("click", () => lightboxProxima(1));
  document.getElementById("lightbox-overlay").addEventListener("click", (ev) => {
    if (ev.target.id === "lightbox-overlay") fecharLightbox();
  });

  // Carregamento de dados: cada etapa isolada, uma falha não derruba as outras.
  try { await carregarIgreja(); } catch (e) { console.error("Falha ao carregar igreja:", e); }
  try { await carregarCultos(); } catch (e) { console.error("Falha ao carregar cultos:", e); }
  try { await carregarAvisos("visitante-avisos"); } catch (e) { console.error("Falha ao carregar avisos:", e); }
  try { await carregarFotosPreviewVisitante(); } catch (e) { console.error("Falha ao carregar preview de fotos:", e); }
  try { configurarBannerA2HS(); } catch (e) { console.error("Falha no banner A2HS:", e); }

  if (state.membro) {
    // valida se o membro ainda existe (evita sessão presa após limpeza de dados de teste)
    try {
      const { data } = await sb.from("igr_membros").select("*").eq("id", state.membro.id).maybeSingle();
      if (data) { state.membro = data; atualizarVisibilidadeLouvor(); await montarHomeMembro(); mostrarTela("tela-membro-home"); return; }
      localStorage.removeItem("igr_membro");
    } catch (e) { console.error("Falha ao validar sessão:", e); }
  }
  mostrarTela("tela-visitante");
}

iniciar();
