/* V8: "Palavra para você" — fluxo personalizado que leva o membro ao devocional.
   Usa a lógica real do app: check-in de humor (igr_checkins_diarios), pontos e abrirDevocional(). */
(function () {
  const reduz = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const MSG = {
    grato: ["{n}, que bonito chegar assim ao fim do dia. Gratidão é a porta que Deus mais gosta de abrir — deixe a Palavra de hoje transformar esse sentimento em adoração.", "Deem graças ao Senhor, porque ele é bom; o seu amor dura para sempre.", "Salmo 107:1"],
    esperancoso: ["{n}, essa esperança não é por acaso: foi Deus quem plantou. Hoje a Palavra vem regar o que já começou a crescer em você.", "Que o Deus da esperança os encha de toda alegria e paz, por sua confiança nele.", "Romanos 15:13"],
    em_paz: ["{n}, paz assim é presente. Fique um pouco nela — a Palavra de hoje vai te ajudar a guardar o que Deus te deu.", "E a paz de Deus, que excede todo o entendimento, guardará o coração e a mente de vocês em Cristo Jesus.", "Filipenses 4:7"],
    fortalecido: ["{n}, você está de pé, e isso também é obra dele. Use essa força: a Palavra de hoje é alimento para a próxima caminhada.", "Tudo posso naquele que me fortalece.", "Filipenses 4:13"],
    cansado: ["{n}, o dia pesou, eu sei. Você não precisa dar conta de tudo hoje. Existe uma palavra escrita para esse exato cansaço.", "Venham a mim, todos os que estão cansados e sobrecarregados, e eu darei descanso a vocês.", "Mateus 11:28"],
    ansioso: ["{n}, respire. Você não carrega isso sozinho. Antes de ler, saiba que a igreja pode orar por você — e a Palavra de hoje foi separada para este momento.", "Não andem ansiosos por coisa alguma; em tudo, pela oração, apresentem seus pedidos a Deus.", "Filipenses 4:6"],
  };
  const MOODS = [["grato", "🙏", "Grato"], ["esperancoso", "✨", "Esperançoso"], ["em_paz", "🕊️", "Em paz"], ["fortalecido", "💪", "Fortalecido"], ["cansado", "😮‍💨", "Cansado"], ["ansioso", "😟", "Ansioso"]];

  let aberto = false, digitando = 0, fx = null, respondido = null;
  const nomeAtual = () => (state.membro?.nome_completo || "").split(" ")[0] || "amigo";
  const hoje = () => new Date().toISOString().slice(0, 10);

  /* ---------- fundo líquido (WebGL, baixa resolução) ---------- */
  function aurora(cv) {
    const gl = cv.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" });
    if (!gl) { cv.style.background = "radial-gradient(80% 80% at 70% 20%,#1a2a8f,#05070f)"; return { play() {}, stop() {} }; }
    const vs = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
    const fs = `precision mediump float;uniform vec2 r;uniform float t;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1.,0.)),u.x),mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),u.x),u.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*n(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}
void main(){vec2 p=(gl_FragCoord.xy-.5*r)/min(r.x,r.y);float tt=t*.12;
vec2 q=vec2(fbm(p*1.5+tt),fbm(p*1.5+vec2(5.2,1.3)-tt));
vec2 w=vec2(fbm(p*1.5+2.*q+vec2(1.7,9.2)+tt*1.3),fbm(p*1.5+2.*q+vec2(8.3,2.8)-tt));
float v=fbm(p*1.3+2.4*w);
vec3 B=vec3(.012,.02,.07),c1=vec3(.08,.16,.78),c2=vec3(.98,.72,.02),c3=vec3(.42,.27,.9);
vec3 col=mix(B,c1,smoothstep(.25,.8,v));
col=mix(col,c3,smoothstep(.45,.95,length(w))*.55);
col+=c2*pow(smoothstep(.55,.95,v+.15*sin(tt*3.+p.x*3.)),3.)*.55;
col*=1.-.55*length(p*.7);
gl_FragColor=vec4(col,1.);}`;
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); return o; };
    const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pr); gl.useProgram(pr);
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const ur = gl.getUniformLocation(pr, "r"), ut = gl.getUniformLocation(pr, "t");
    let on = false, raf = 0; const t0 = performance.now();
    const size = () => { const s = .5; cv.width = Math.max(2, cv.clientWidth * s | 0); cv.height = Math.max(2, cv.clientHeight * s | 0); gl.viewport(0, 0, cv.width, cv.height); };
    const draw = () => { if (!on) return; gl.uniform2f(ur, cv.width, cv.height); gl.uniform1f(ut, (performance.now() - t0) / 1000); gl.drawArrays(gl.TRIANGLES, 0, 3); raf = requestAnimationFrame(draw); };
    addEventListener("resize", () => { if (on) size(); });
    return { play() { if (!on && !document.hidden) { on = true; size(); draw(); } }, stop() { on = false; cancelAnimationFrame(raf); } };
  }

  window.v8Aurora = aurora;

  /* ---------- overlay ---------- */
  function montarOverlay() {
    if ($("#palavra")) return;
    const el = document.createElement("div");
    el.id = "palavra"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", "Minha palavra de hoje");
    el.innerHTML = `
      <canvas id="palavra-cv"></canvas>
      <button class="w-close" id="palavra-fechar" aria-label="Fechar">✕</button>
      <div class="w-in">
        <div class="w-step on" data-p="0">
          <div class="seal" id="palavra-selo"><svg viewBox="0 0 24 24"><path d="M12 3v18M6 9h12"/></svg></div>
          <span class="w-eyebrow">Para você</span>
          <h2 class="w-h"><span class="nm"></span>, Deus guardou <em>uma palavra</em> pra você hoje.</h2>
          <p class="w-p">Antes de abrir, respire fundo. Ela foi separada para o dia que você teve.</p>
          <button class="w-btn" id="palavra-quebrar">Quebrar o selo</button>
        </div>
        <div class="w-step" data-p="1">
          <span class="w-eyebrow">Primeiro, conte pra gente</span>
          <h2 class="w-h">Como foi o <em>seu dia,</em> <span class="nm"></span>?</h2>
          <p class="w-p">Sem resposta certa. Escolha o que mais se parece com você agora.</p>
          <div class="moods">${MOODS.map(([k, e, l]) => `<button class="mood" data-m="${k}"><span>${e}</span>${l}</button>`).join("")}</div>
        </div>
        <div class="w-step" data-p="2">
          <span class="w-eyebrow">Uma palavra direta pra você</span>
          <p class="msg" id="palavra-msg"></p>
          <div class="vcard" id="palavra-vcard"><q id="palavra-vtxt"></q><b id="palavra-vref"></b></div>
          <div class="w-extra" id="palavra-extra">
            <button class="w-btn" id="palavra-ler">Ler meu devocional de hoje</button>
            <button class="w-link" id="palavra-orar" style="display:none">🙏 Pedir oração à igreja</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(el);
    fx = aurora($("#palavra-cv"));
    $("#palavra-fechar").onclick = fechar;
    addEventListener("keydown", e => { if (e.key === "Escape" && aberto) fechar(); });
    $("#palavra-quebrar").onclick = () => { $("#palavra-selo").classList.add("quebra"); setTimeout(() => passo(1), 550); };
    $$(".mood", el).forEach(b => b.onclick = () => escolher(b.dataset.m));
    $("#palavra-ler").onclick = lerDevocional;
    $("#palavra-orar").onclick = () => { fechar(); mostrarTela("tela-membro-home"); setTimeout(() => { const t = $("#novo-pedido-texto"); if (t) { t.scrollIntoView({ behavior: "smooth", block: "center" }); t.focus({ preventScroll: true }); } }, 350); };
  }

  function passo(i) {
    $$("#palavra .w-step").forEach(s => s.classList.toggle("on", +s.dataset.p === i));
    $("#palavra").scrollTop = 0;
    if (window.gsap && !reduz) gsap.fromTo(`#palavra .w-step[data-p="${i}"] > *`, { y: 26, opacity: 0 }, { y: 0, opacity: 1, duration: .9, stagger: .09, ease: "expo.out", overwrite: true });
  }

  function abrir() {
    montarOverlay();
    const o = $("#palavra");
    $$(".nm", o).forEach(n => n.textContent = nomeAtual());
    $("#palavra-selo").classList.remove("quebra");
    aberto = true; o.classList.add("on"); document.body.classList.add("palavra-aberta");
    fx && fx.play();
    if (respondido) { mostrarMensagem(respondido, true); } else passo(0);
  }
  function fechar() {
    aberto = false; clearInterval(digitando);
    const o = $("#palavra"); o && o.classList.remove("on");
    document.body.classList.remove("palavra-aberta");
    fx && fx.stop();
  }

  async function escolher(humor) {
    respondido = humor;
    mostrarMensagem(humor, false);
    // lógica real do app: registra o humor do dia e dá os pontos (uma vez por dia)
    try {
      if (state.membro) {
        const { data: ja } = await sb.from("igr_checkins_diarios").select("humor").eq("membro_id", state.membro.id).eq("data", hoje()).maybeSingle();
        await sb.from("igr_checkins_diarios").upsert({ membro_id: state.membro.id, humor, data: hoje() }, { onConflict: "membro_id,data" });
        if (!ja) darPontos("checkin_humor");
        const box = document.getElementById("checkin-diario-box"); if (box) box.style.display = "none";
        atualizarCard();
      }
    } catch (e) { console.warn("palavra: checkin", e); }
  }

  function mostrarMensagem(humor, instantaneo) {
    const [t, v, r] = MSG[humor] || MSG.grato;
    const txt = t.replace("{n}", nomeAtual());
    passo(2);
    const m = $("#palavra-msg"); m.textContent = ""; m.classList.remove("fim");
    $("#palavra-vcard").classList.remove("on"); $("#palavra-extra").classList.remove("on");
    $("#palavra-vtxt").textContent = "“" + v + "”"; $("#palavra-vref").textContent = r;
    $("#palavra-orar").style.display = (humor === "cansado" || humor === "ansioso") ? "block" : "none";
    const fim = () => { m.textContent = txt; m.classList.add("fim"); $("#palavra-vcard").classList.add("on"); $("#palavra-extra").classList.add("on"); };
    clearInterval(digitando);
    if (instantaneo || reduz) { fim(); return; }
    let i = 0;
    digitando = setInterval(() => { i += 2; m.textContent = txt.slice(0, i); if (i >= txt.length) { clearInterval(digitando); fim(); } }, 26);
  }

  function lerDevocional() {
    if (!state.devocionalGerado) { mostrarToast("Seu devocional ainda está sendo preparado… tente em instantes 🙏"); return; }
    fechar();
    confete();
    abrirDevocional();
  }

  function confete() {
    if (reduz) return;
    const cs = ["#F9BD00", "#3355ff", "#ff6a5c", "#27d19b", "#9a7bff"];
    for (let i = 0; i < 46; i++) {
      const p = document.createElement("i"); p.className = "conf-v8"; p.style.left = Math.random() * 100 + "vw"; p.style.background = cs[i % 5];
      p.style.animationDuration = (1.8 + Math.random() * 1.4) + "s"; p.style.animationDelay = (Math.random() * .3) + "s"; p.style.setProperty("--dx", ((Math.random() - .5) * 240) + "px");
      document.body.appendChild(p); setTimeout(() => p.remove(), 3600);
    }
  }

  /* ---------- cartão na Home ---------- */
  function garantirCard() {
    let c = $("#palavra-card");
    if (c) return c;
    const sub = $("#tela-membro-home .greet-sub");
    if (!sub) return null;
    c = document.createElement("button");
    c.id = "palavra-card"; c.type = "button"; c.className = "pal-card";
    sub.after(c);
    c.addEventListener("click", abrir);
    return c;
  }
  function atualizarCard() {
    const c = garantirCard(); if (!c) return;
    const feito = !!respondido;
    c.classList.toggle("feito", feito);
    c.innerHTML = feito
      ? `<span class="pc-eye">Sua palavra de hoje</span><span class="pc-t">Releia o que Deus <em>separou</em> pra você.</span><span class="pc-go">Abrir <svg class="icon"><use href="#k-chevron"/></svg></span>`
      : `<span class="pc-eye"><i></i>Para você</span><span class="pc-t">Deus guardou <em>uma palavra</em> pra você hoje.</span><span class="pc-s">Conte como foi o seu dia e receba uma mensagem direta pra ti.</span><span class="pc-go">Abrir minha palavra <svg class="icon"><use href="#k-chevron"/></svg></span>`;
  }

  window.v8Home = async function (m) {
    try { localStorage.setItem("igr_user_nome", (m.nome_completo || "").split(" ")[0]); } catch (e) {}
    atualizarCard();
    try {
      const { data } = await sb.from("igr_checkins_diarios").select("humor").eq("membro_id", m.id).eq("data", hoje()).maybeSingle();
      respondido = data?.humor || null;
      atualizarCard();
    } catch (e) {}
  };
})();

/* brilho dourado que segue o mouse/dedo nos cartões */
(function () {
  document.addEventListener("pointermove", e => {
    const c = e.target.closest && e.target.closest(".card,.evento-card,.album-card,.contato-item,.admin-grid-card,.prayer-item");
    if (!c) return;
    const r = c.getBoundingClientRect();
    c.style.setProperty("--mx", (e.clientX - r.left) + "px");
    c.style.setProperty("--my", (e.clientY - r.top) + "px");
  }, { passive: true });
})();

/* palavra final dos títulos de página em itálico dourado */
(function () {
  function destacar() {
    document.querySelectorAll('.screen span[style*="Montserrat"]').forEach(s => {
      if (s.dataset.v8 || s.children.length) return;
      const t = s.textContent.trim(); const p = t.split(/\s+/);
      s.dataset.v8 = 1;
      if (p.length > 1 && t.length < 40) { const u = p.pop(); s.innerHTML = p.join(" ") + " <em>" + u + "</em>"; }
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", destacar); else destacar();
})();

/* ---------- Criar em passos, com pré-visualização ao vivo ---------- */
(function () {
  const $ = id => document.getElementById(id);
  const MESES = ["JAN","FEV","MAR","ABR","MAI","JUN","JUL","AGO","SET","OUT","NOV","DEZ"];
  function filhoDireto(form, id) { let e = $(id); while (e && e.parentElement !== form) e = e.parentElement; return e; }

  function wizard(cfg) {
    const form = $(cfg.form); if (!form || form.dataset.wz) return; form.dataset.wz = 1;
    const kids = Array.from(form.children);
    const marcas = cfg.passos.map(p => kids.indexOf(filhoDireto(form, p.inicio)));
    const passos = cfg.passos.map((p, i) => {
      const box = document.createElement("div"); box.className = "wz-step";
      const fim = i + 1 < marcas.length ? marcas[i + 1] : kids.length;
      kids.slice(marcas[i], fim).forEach(k => box.appendChild(k));
      return box;
    });
    const trilho = document.createElement("div"); trilho.className = "wz-trilho";
    trilho.innerHTML = cfg.passos.map((p, i) => `<span class="wz-p"><i>${i + 1}</i><b>${p.titulo}</b></span>`).join("");
    const prev = document.createElement("div"); prev.className = "wz-prev"; prev.innerHTML = `<span class="wz-prev-eye">Assim vai aparecer</span><div class="wz-prev-card"><div class="dt c0"><b class="pd">--</b><small class="pm">DATA</small></div><div class="tx"><b class="pt"></b><span class="ps"></span><img class="pi" alt=""></div></div>`;
    const nav = document.createElement("div"); nav.className = "wz-nav";
    nav.innerHTML = `<button type="button" class="btn btn-ghost wz-voltar">Voltar</button><button type="button" class="btn btn-primary wz-seguir">Continuar</button>`;
    const alvo = form.closest(".card") ? form.closest(".card") : form;
    alvo.parentElement.insertBefore(trilho, alvo); alvo.parentElement.insertBefore(prev, alvo);
    passos.forEach(b => form.appendChild(b)); form.appendChild(nav);
    // o botão de enviar fica no último passo; a navegação fica abaixo
    let atual = 0;
    const submit = form.querySelector('button[type="submit"]');
    function ir(n) {
      atual = Math.max(0, Math.min(passos.length - 1, n));
      passos.forEach((b, i) => b.classList.toggle("on", i === atual));
      trilho.querySelectorAll(".wz-p").forEach((p, i) => { p.classList.toggle("on", i === atual); p.classList.toggle("ok", i < atual); });
      nav.querySelector(".wz-voltar").style.visibility = atual ? "visible" : "hidden";
      nav.querySelector(".wz-seguir").style.display = atual === passos.length - 1 ? "none" : "flex";
      if (submit) submit.style.display = atual === passos.length - 1 ? "flex" : "none";
      const sc = form.closest(".scroll"); if (sc) sc.scrollTop = 0;
    }
    function valido() { return Array.from(passos[atual].querySelectorAll("input,select,textarea")).every(i => i.reportValidity()); }
    nav.querySelector(".wz-seguir").onclick = () => { if (valido()) ir(atual + 1); };
    nav.querySelector(".wz-voltar").onclick = () => ir(atual - 1);
    form.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.tagName === "INPUT" && atual < passos.length - 1) { e.preventDefault(); nav.querySelector(".wz-seguir").click(); } });
    trilho.querySelectorAll(".wz-p").forEach((p, i) => p.onclick = () => { if (i <= atual || valido()) ir(i); });
    // pré-visualização
    const q = s => prev.querySelector(s);
    function atualizar() {
      q(".pt").textContent = ($(cfg.prev.titulo).value || "").trim() || cfg.vazio;
      const d = $(cfg.prev.data).value;
      if (d) { const dt = new Date(d + "T00:00:00"); q(".pd").textContent = dt.getDate(); q(".pm").textContent = MESES[dt.getMonth()]; } else { q(".pd").textContent = "--"; q(".pm").textContent = "DATA"; }
      q(".ps").textContent = [$(cfg.prev.hora).value, $(cfg.prev.local).value].filter(Boolean).join(" · ");
      const f = $(cfg.prev.img).files && $(cfg.prev.img).files[0];
      const im = q(".pi");
      if (f) { im.src = URL.createObjectURL(f); im.style.display = "block"; } else im.style.display = "none";
    }
    form.addEventListener("input", atualizar); form.addEventListener("change", atualizar);
    // volta ao passo 1 sempre que a tela abre
    const tela = form.closest(".screen");
    new MutationObserver(() => { if (tela.classList.contains("active")) { ir(0); atualizar(); } }).observe(tela, { attributes: true, attributeFilter: ["class"] });
    form.addEventListener("reset", () => setTimeout(() => { ir(0); atualizar(); })); ir(0); atualizar();
  }

  function iniciar() {
    // banner e leitura por IA pertencem ao primeiro passo (o quê)
    const fe = $("form-evento");
    if (fe && !fe.dataset.wz) { const ref = filhoDireto(fe, "ev-local"); ["ev-banner", "btn-ev-ler-banner", "ev-status-ia"].forEach(id => { const n = filhoDireto(fe, id); if (n && ref) fe.insertBefore(n, ref); }); }
    wizard({ form: "form-evento", vazio: "Nome do seu evento", prev: { titulo: "ev-titulo", data: "ev-data", hora: "ev-horario", local: "ev-local", img: "ev-banner" },
      passos: [{ titulo: "O quê", inicio: "ev-titulo" }, { titulo: "Quando e onde", inicio: "ev-local" }, { titulo: "Detalhes", inicio: "ev-vagas-min" }] });
    wizard({ form: "form-lider-aviso", vazio: "Título do aviso", prev: { titulo: "lider-aviso-titulo", data: "lider-aviso-data", hora: "lider-aviso-horario", local: "lider-aviso-local", img: "lider-aviso-imagem" },
      passos: [{ titulo: "O quê", inicio: "lider-aviso-titulo" }, { titulo: "Quando e onde", inicio: "lider-aviso-data" }, { titulo: "Mídia e destino", inicio: "lider-aviso-imagem" }] });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
})();
