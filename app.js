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

// Upload de arquivo (imagem/pdf) pro Storage do Supabase, retorna a URL pública
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
function gerarICS({ titulo, descricao, local, inicio, duracaoMin, semanal }) {
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

function formatarData(dataIso) {
  if (!dataIso) return "";
  const d = new Date(dataIso + "T00:00:00");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });
}

function tempoRelativo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const dias = Math.floor(diffMs / 86400000);
  if (dias <= 0) return "Enviado hoje";
  if (dias === 1) return "Enviado ontem";
  return `Enviado há ${dias} dias`;
}

const TELAS_SEM_RODAPE = new Set([
  "tela-login", "tela-cadastro", "tela-admin-login", "tela-admin-painel", "tela-fotos-album",
  "tela-sobre-igreja", "tela-contatos",
]);
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
  inserirRodapeEndereco(id);
}

function inserirRodapeEndereco(id) {
  if (TELAS_SEM_RODAPE.has(id)) return;
  const endereco = state.igreja?.endereco;
  if (!endereco) return;
  const tela = document.getElementById(id);
  const scrollEl = tela?.querySelector(".scroll");
  if (!scrollEl || scrollEl.querySelector(".rodape-endereco")) return;
  const rodape = document.createElement("p");
  rodape.className = "rodape-endereco hint";
  rodape.style.cssText = "text-align:center;margin:28px 0 6px;padding-top:14px;border-top:1px solid var(--line);";
  rodape.textContent = "📍 " + endereco;
  scrollEl.appendChild(rodape);
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
  const el = document.getElementById("lista-cultos");
  el.innerHTML = (data || []).map(c => `
    <div class="card">
      ${c.imagem_url ? `<img class="capa-thumb" src="${c.imagem_url}" alt="">` : ""}
      <h3>${c.titulo}</h3>
      <p>${c.data ? formatarData(c.data) + " (especial)" : (c.dia_semana || "")} · ${c.horario || ""} · ${c.local || ""}</p>
      <button class="btn btn-ghost" style="width:auto;padding:8px 14px;font-size:12px;margin-top:8px;" data-add-agenda-culto="${c.id}">📅 Adicionar à agenda</button>
    </div>
  `).join("") || `<div class="empty">Nenhum culto cadastrado ainda.</div>`;
  el.querySelectorAll("[data-add-agenda-culto]").forEach(btn => {
    const c = (data || []).find(x => x.id === btn.dataset.addAgendaCulto);
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

function renderGrupos() {
  const el = document.getElementById("lista-grupos-cadastro");
  el.innerHTML = state.grupos.map(g => `
    <div class="grouppick" data-id="${g.id}">
      <div><p>${g.nome}</p><small>${g.encontro_info || ""}</small></div>
    </div>
  `).join("") || `<div class="empty">Nenhum grupo cadastrado ainda — pode concluir sem escolher.</div>`;
  el.querySelectorAll(".grouppick").forEach(el2 => {
    el2.addEventListener("click", () => {
      el.querySelectorAll(".grouppick").forEach(g => g.classList.remove("sel"));
      el2.classList.add("sel");
      state.grupoSelecionado = el2.dataset.id;
    });
  });
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
  else if (idade >= 14 && idade <= 17) categoria = "adolescente";
  else if (idade >= 18 && idade <= 32 && estadoCivil === "solteiro") categoria = "jovem";
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
    const querLider = document.getElementById("cad-quero-lider").checked && !!state.grupoSelecionado;
    const { data, error } = await sb.from("igr_membros").insert({
      igreja_id: state.igreja.id, nome_completo, telefone, endereco,
      data_nascimento: data_nascimento || null,
      grupo_id: state.grupoSelecionado || null,
      pin_hash,
      lider_status: querLider ? "pendente" : "nenhum",
    }).select().single();

    if (error) {
      errEl.textContent = error.code === "23505"
        ? "Já existe um cadastro com esse telefone. Tente entrar em vez de cadastrar."
        : "Não deu pra concluir agora. Tente de novo em instantes.";
      errEl.classList.add("show");
      return;
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
  const { data: membros } = await sb.from("igr_membros").select("nome_completo,data_nascimento")
    .eq("igreja_id", state.igreja.id).not("data_nascimento", "is", null);
  const aniversariantes = (membros || [])
    .filter(x => x.data_nascimento && (new Date(x.data_nascimento + "T00:00:00").getMonth() + 1) === mesAtual)
    .sort((a, b) => new Date(a.data_nascimento).getDate() - new Date(b.data_nascimento).getDate());
  const bdayEl = document.getElementById("home-aniversariantes");
  bdayEl.innerHTML = aniversariantes.map(a => {
    const iniciais = a.nome_completo.split(" ").filter(Boolean).slice(0, 2).map(p => p[0]).join("").toUpperCase();
    const dia = new Date(a.data_nascimento + "T00:00:00").getDate();
    const primeiro = a.nome_completo.split(" ")[0];
    return `<div class="bday"><div class="circle">${iniciais}</div><span>${primeiro} · ${dia}</span></div>`;
  }).join("") || `<div class="empty" style="padding:14px;">Ninguém faz aniversário este mês.</div>`;

  await carregarAvisos("home-avisos");
  await carregarPedidosOracao();

  const liderBox = document.getElementById("lider-postar-box");
  if (liderBox) liderBox.style.display = m.eh_lider ? "block" : "none";
  const liderVisitantesBox = document.getElementById("lider-visitantes-box");
  if (liderVisitantesBox) {
    liderVisitantesBox.style.display = m.eh_lider ? "block" : "none";
    if (m.eh_lider) await carregarVisitantesLider();
  }
}

async function carregarVisitantesLider() {
  const { data } = await sb.from("igr_visitantes").select("*")
    .eq("grupo_id", state.membro.grupo_id).order("created_at", { ascending: false }).limit(15);
  const el = document.getElementById("lider-visitantes-lista");
  el.innerHTML = (data || []).map(v => {
    const idade = v.data_nascimento ? calcularIdade(v.data_nascimento) : null;
    const msg = `Oi ${v.nome.split(" ")[0]}! Aqui é da ${state.igreja.termo_grupo || "equipe"} da ${state.igreja.nome}. Que alegria que você nos visitou! 💛`;
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
    const { error } = await sb.from("igr_avisos").insert({
      igreja_id: state.igreja.id, titulo, texto,
      grupo_id: state.membro.grupo_id, criado_por_membro_id: state.membro.id,
    });
    if (error) { alert("Não deu pra publicar agora. Tente de novo."); return; }
    document.getElementById("lider-aviso-titulo").value = "";
    document.getElementById("lider-aviso-texto").value = "";
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
async function configurarCheckinDiario() {
  const box = document.getElementById("checkin-diario-box");
  if (!box || !state.membro) return;
  const hoje = new Date().toISOString().slice(0, 10);
  const { data: existente } = await sb.from("igr_checkins_diarios").select("humor")
    .eq("membro_id", state.membro.id).eq("data", hoje).maybeSingle();

  const botoes = box.querySelectorAll(".reacao-btn");
  if (existente) {
    box.querySelector(".checkin-pergunta").textContent = "Obrigado por compartilhar como você está hoje 💛";
    botoes.forEach(b => b.classList.toggle("on", b.dataset.reacao === existente.humor));
  } else {
    box.querySelector(".checkin-pergunta").textContent = "Como você está hoje?";
    botoes.forEach(b => b.classList.remove("on"));
  }

  botoes.forEach(btn => {
    btn.onclick = async () => {
      botoes.forEach(b => b.classList.remove("on"));
      btn.classList.add("on");
      await sb.from("igr_checkins_diarios")
        .upsert({ membro_id: state.membro.id, humor: btn.dataset.reacao, data: hoje }, { onConflict: "membro_id,data" });
      box.querySelector(".checkin-pergunta").textContent = "Obrigado por compartilhar como você está hoje 💛";
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
  if (gerBox) gerBox.style.display = state.membro?.eh_lider ? "block" : "none";
  if (state.membro?.eh_lider) await carregarMembrosGrupoLouvor();

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
    document.getElementById("gi-descricao").value = grupo.descricao || "";
    carregarOracaoDoGrupo(grupo.id);
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

async function carregarAvisosDoGrupoDetalhe(grupoId) {
  const { data } = await sb.from("igr_avisos").select("*").eq("grupo_id", grupoId).order("publicado_em", { ascending: false }).limit(10);
  const el = document.getElementById("grupo-detalhe-avisos");
  el.innerHTML = (data || []).map(a => `
    <div class="card row-avatar">
      ${seloData(a.publicado_em)}
      <div class="row-info"><b>${a.titulo}</b><p style="margin:4px 0 0;font-size:12.5px;color:var(--ink-soft);">${a.texto || ""}</p></div>
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
    const { error } = await sb.from("igr_avisos").insert({
      igreja_id: state.igreja.id, titulo, texto, grupo_id: grupo.id, criado_por_membro_id: state.membro.id,
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

// ---------- fotos ----------
async function carregarAlbuns() {
  document.getElementById("fotos-voltar").onclick = () => mostrarTela(state.membro ? "tela-membro-home" : "tela-visitante");
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
      <div style="display:flex;gap:8px;margin-top:10px;">
        <button class="btn btn-primary" style="width:auto;padding:9px 16px;font-size:12.5px;" data-acao="aprovar" data-id="${m.id}">Aprovar</button>
        <button class="btn btn-ghost" style="width:auto;padding:9px 16px;font-size:12.5px;" data-acao="recusar" data-id="${m.id}">Recusar</button>
      </div>
    </div>
  `).join("") || `<div class="empty">Nenhum pedido pendente no momento.</div>`;

  el.querySelectorAll("[data-acao]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const aprovar = btn.dataset.acao === "aprovar";
      btn.disabled = true;
      await sb.from("igr_membros").update({
        lider_status: aprovar ? "aprovado" : "recusado",
        eh_lider: aprovar,
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
}

async function enviarNovoLiderAdmin(ev) {
  ev.preventDefault();
  const nome_completo = document.getElementById("anl-nome").value.trim();
  const telefone = limparTelefone(document.getElementById("anl-telefone").value);
  const grupo_id = document.getElementById("anl-grupo").value;
  const pin = document.getElementById("anl-senha").value.trim();
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
      lider_status: "aprovado", eh_lider: true,
    });
    if (error) {
      alert(error.code === "23505" ? "Já existe um cadastro com esse telefone." : "Não deu pra criar: " + error.message);
      return;
    }
    const resultado = document.getElementById("anl-resultado");
    const nomeGrupo = (state.grupos || []).find(g => g.id === grupo_id)?.nome || "";
    resultado.innerHTML = `✅ Líder criado! Passa isso pra <b>${nome_completo}</b> entrar (menu → Entrar / Sou membro):<br><b>Telefone:</b> ${telefone}<br><b>Senha:</b> ${pin}<br><span class="hint" style="margin:6px 0 0;display:block;">Ela já entra direto gerenciando o grupo ${nomeGrupo}.</span>`;
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
    const msg = `Oi ${v.nome.split(" ")[0]}! Aqui é da ${state.igreja.nome}. Que alegria que você nos visitou! 💛`;
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

// ---------- admin: alternador de abas ----------
function montarGridAdmin() {
  const papel = state.adminPapel || "geral";
  document.querySelectorAll("#admin-grid [data-secao]").forEach(card => {
    const papeisPermitidos = card.dataset.papel.split(",");
    card.style.display = papeisPermitidos.includes(papel) ? "flex" : "none";
  });
  document.querySelectorAll(".admin-painel-aba").forEach(sec => sec.style.display = "none");
  document.getElementById("admin-grid").style.display = "grid";
  document.getElementById("admin-titulo-painel").textContent = state.adminNome ? `Olá, ${state.adminNome}` : "Painel do administrador";
}

function abrirSecaoAdmin(secao) {
  document.getElementById("admin-grid").style.display = "none";
  document.querySelectorAll(".admin-painel-aba").forEach(sec => {
    sec.style.display = sec.dataset.adminPainel === secao ? "block" : "none";
  });
  const cargas = {
    lideres: carregarPainelAdmin, visitantes: carregarVisitantesAdmin,
    cultos: carregarCultosAdmin, avisos: carregarAvisosAdmin,
    pastor: carregarPastorAdmin, estudos: carregarEsbocosAdmin,
    fotos: carregarAlbunsAdmin,
    igreja: () => { preencherFormIgrejaAdmin(); carregarPastoresPerfilAdmin(); },
    oracao: () => carregarOracaoAdmin("todos"),
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
  document.getElementById("ac-data").value = item.data || "";
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
      const { error } = await sb.from("igr_cultos").update({ titulo, dia_semana, horario, local, imagem_url, data: data_especifica }).eq("id", editando.id);
      if (error) { alert("Não deu pra salvar as alterações: " + error.message); return; }
      cancelarEdicaoCulto();
    } else {
      const { error } = await sb.from("igr_cultos").insert({ igreja_id: state.igreja.id, titulo, dia_semana, horario, local, imagem_url: novaImagem, data: data_especifica, ordem: Date.now() });
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
    const novaImagem = await uploadArquivo(arquivo, "avisos");
    if (editando) {
      const imagem_url = novaImagem || editando.imagem_url || null;
      const { error } = await sb.from("igr_avisos").update({ titulo, texto, imagem_url }).eq("id", editando.id);
      if (error) { alert("Não deu pra salvar as alterações: " + error.message); return; }
      cancelarEdicaoAviso();
    } else {
      const { error } = await sb.from("igr_avisos").insert({ igreja_id: state.igreja.id, titulo, texto, imagem_url: novaImagem, publicado_em: new Date().toISOString() });
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
  document.getElementById("af-data").value = item.data || "";
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

function configurarBannerA2HS() {
  if (localStorage.getItem("igr_a2hs_fechado")) return;
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua);
  document.querySelectorAll(".a2hs-texto").forEach(el => {
    el.textContent = isIOS
      ? 'Toque em Compartilhar (□↑) e depois em "Adicionar à Tela de Início".'
      : 'Toque no menu (⋮) do navegador e depois em "Adicionar à tela inicial".';
  });
  document.querySelectorAll(".a2hs").forEach(el => el.style.display = "flex");
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
  document.getElementById("form-admin-login").addEventListener("submit", enviarLoginAdmin);
  document.getElementById("form-admin-culto")?.addEventListener("submit", enviarCultoAdmin);
  document.getElementById("form-admin-novo-lider")?.addEventListener("submit", enviarNovoLiderAdmin);
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
      if (alvo === "tela-contatos") carregarContatos();
      if (alvo === "tela-sobre-igreja") await carregarSobreIgreja();
      if (alvo === "tela-grupos-lista") await carregarGruposLista();
    });
  });
  document.querySelectorAll("[data-close-a2hs]").forEach(b => b.addEventListener("click", fecharA2HS));
  document.getElementById("btn-sair")?.addEventListener("click", sair);

  // ---- menu lateral (drawer) ----
  const drawer = document.getElementById("drawer");
  const drawerOverlay = document.getElementById("drawer-overlay");
  const abrirDrawer = () => { drawer.classList.add("open"); drawerOverlay.classList.add("open"); };
  const fecharDrawer = () => { drawer.classList.remove("open"); drawerOverlay.classList.remove("open"); };
  document.getElementById("btn-abrir-drawer").addEventListener("click", abrirDrawer);
  drawerOverlay.addEventListener("click", fecharDrawer);
  document.querySelectorAll("[data-close-drawer]").forEach(el => el.addEventListener("click", fecharDrawer));
  document.getElementById("btn-abrir-perfil").addEventListener("click", () => {
    if (state.membro) { mostrarTela("tela-membro-home"); } else { mostrarTela("tela-login"); }
  });

  // ---- lightbox de fotos ----
  document.getElementById("lightbox-fechar").addEventListener("click", fecharLightbox);
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
  try { renderGrupos(); } catch (e) { console.error("Falha ao montar grupos:", e); }
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
