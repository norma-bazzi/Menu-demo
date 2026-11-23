/* Interactive menu — scroll engine, panels, cart */
(function () {
  const DATA = window.EMBER_MENU;
  const R = window.EMBER_RENDERERS;
  const { clamp, seg, eInOut, drop } = R.util;
  const dishes = DATA.dishes;
  const N = dishes.length;
  const CUR = (DATA.restaurant && DATA.restaurant.currency) || "$";
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (n) => CUR + (Math.round(n * 100) % 100 ? n.toFixed(2) : String(Math.round(n)));

  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  let RM = mq.matches;
  const setRM = () => { document.documentElement.classList.toggle("rm", RM); };
  setRM();
  (mq.addEventListener ? mq.addEventListener("change", (e) => { RM = e.matches; setRM(); }) : mq.addListener((e) => { RM = e.matches; setRM(); }));

  /* ---------------- build DOM from data ---------------- */
  $("#heroTag").textContent = "";
  const catBar = $("#catBar"), panelsEl = $("#panels"), spacersEl = $("#spacers");
  dishes.forEach((d, i) => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = d.category; b.dataset.i = i;
    b.setAttribute("aria-current", i === 0 ? "true" : "false");
    b.addEventListener("click", () => goToDish(i));
    catBar.appendChild(b);

    const sp = document.createElement("div");
    sp.className = "spacer"; sp.id = "dish-" + d.id;
    spacersEl.appendChild(sp);

    const opt = d.options;
    const panel = document.createElement("article");
    panel.className = "panel"; panel.dataset.i = i;
    panel.setAttribute("aria-labelledby", "dish-title-" + i);
    panel.innerHTML = `
      <p class="eyebrow">No. ${String(i + 1).padStart(2, "0")} · ${esc(d.category)}</p>
      <h2 id="dish-title-${i}">${esc(d.name)}</h2>
      <p class="desc">${esc(d.description)}</p>
      <div class="meta">${d.weight ? `<span class="weight">${esc(d.weight)}</span>` : ""}<span class="price">${money(d.price)}</span></div>
      ${opt ? `<div class="pills" role="radiogroup" aria-label="${esc(opt.label || "Options")}">${opt.choices.map((c, k) => `<button type="button" class="pill" role="radio" aria-checked="${k === (opt.default || 0)}" data-k="${k}">${esc(c)}</button>`).join("")}</div>` : ""}
      <div class="buy">
        <div class="stepper" role="group" aria-label="Quantity">
          <button type="button" class="minus" aria-label="Decrease quantity" disabled>−</button>
          <output aria-live="polite">1</output>
          <button type="button" class="plus" aria-label="Increase quantity">+</button>
        </div>
        <button type="button" class="btn btn-primary add">Add to order</button>
      </div>`;
    panelsEl.appendChild(panel);

    let qty = 1, choice = opt ? opt.default || 0 : null;
    const out = $("output", panel), minus = $(".minus", panel);
    const setQty = (q) => { qty = clamp(q, 1, 20); out.textContent = qty; minus.disabled = qty <= 1; };
    minus.addEventListener("click", () => setQty(qty - 1));
    $(".plus", panel).addEventListener("click", () => setQty(qty + 1));
    panel.querySelectorAll(".pill").forEach((p) => p.addEventListener("click", () => {
      choice = +p.dataset.k;
      panel.querySelectorAll(".pill").forEach((q) => q.setAttribute("aria-checked", q === p ? "true" : "false"));
    }));
    // arrow keys within the radio group
    const pills = $(".pills", panel);
    if (pills) pills.addEventListener("keydown", (e) => {
      if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
      const all = [...pills.children]; const k = (choice + (e.key === "ArrowRight" ? 1 : -1) + all.length) % all.length;
      all[k].click(); all[k].focus(); e.preventDefault();
    });
    const addBtn = $(".add", panel);
    addBtn.addEventListener("click", () => {
      addToCart(d, qty, opt ? opt.choices[choice] : null);
      addBtn.classList.add("done"); addBtn.textContent = "Added ✓";
      clearTimeout(addBtn._t);
      addBtn._t = setTimeout(() => { addBtn.classList.remove("done"); addBtn.textContent = "Add to order"; }, 1400);
      setQty(1);
    });
  });
  const panels = [...panelsEl.children];
  const catBtns = [...catBar.children];

  // hero: the menu at a glance
  const HERO = DATA.restaurant.hero || {};
  $("#hero").innerHTML = `<div class="hero-inner">
      <p class="eyebrow">${esc(HERO.eyebrow || "")}</p>
      <h1>${esc(HERO.title || DATA.restaurant.name)}</h1>
      <p class="hero-text">${esc(HERO.text || "")}</p>
      <button class="btn btn-primary" type="button" id="heroCta">${esc(HERO.cta || "Explore the menu")} <span aria-hidden="true">↓</span></button>
    </div>
    <ol class="hero-menu" aria-label="Tonight's menu">${dishes.map((d, i) => `
      <li><button type="button" class="dish-card" data-i="${i}">
        ${d.cover ? `<img src="${esc(d.cover)}" alt="" loading="${i ? "lazy" : "eager"}" decoding="async">` : ""}
        <span class="dc-body"><span class="dc-cat">${String(i + 1).padStart(2, "0")} · ${esc(d.category)}</span>
        <span class="dc-name">${esc(d.name)}</span>
        <span class="dc-price">${money(d.price)}</span></span>
      </button></li>`).join("")}
    </ol>
    <p class="hero-scroll" aria-hidden="true">Scroll for the menu <span>↓</span></p>`;
  $("#heroCta").addEventListener("click", () => goToStart());
  $("#hero").querySelectorAll(".dish-card").forEach((b) => b.addEventListener("click", () => goToDish(+b.dataset.i)));

  // kitchen + visit sections
  const K = DATA.kitchen, V = DATA.visit;
  const kTitle = esc(K.title).replace(/^(Made fresh\.)/, "<em>$1</em>");
  $("#kitchen").innerHTML = `<div class="inner">
      <p class="eyebrow">${esc(K.eyebrow)}</p>
      <h2>${kTitle}</h2>
      <p class="body">${esc(K.body)}</p>
      <div class="facts">${K.facts.map(([a, b]) => `<div class="fact"><strong>${esc(a)}</strong><span>${esc(b)}</span></div>`).join("")}</div>
    </div>`;
  $("#visit").innerHTML = `<div class="inner">
      <p class="eyebrow">${esc(V.eyebrow)}</p>
      <h2>${esc(V.title)}</h2>
      <div class="visit-grid">
        <div><h3>Find us</h3><address>${V.address.map(esc).join("<br>")}</address>
          <p class="note">${esc(V.note)}</p>
          <button class="btn btn-ghost" type="button" id="orderAgain">Start an order</button></div>
        <div><h3>Hours</h3><dl class="hours">${V.hours.map(([a, b]) => `<dt>${esc(a)}</dt><dd>${esc(b)}</dd>`).join("")}</dl></div>
        <div><h3>Call</h3><address>${esc(V.phone)}</address></div>
      </div></div>`;
  $("#orderAgain").addEventListener("click", () => goToDish(0));

  /* ---------------- layout ---------------- */
  const stage = $("#stage"), canvas = $("#stageCanvas"), ctx = canvas.getContext("2d");
  const heroSpacer = $("#heroSpacer"), menu = $("#menu");
  const spacers = [...spacersEl.children];
  const heroCopy = $("#heroCopy"), heroTag = $("#heroTag");
  let W = 0, H = 0, DPR = 1, layoutH = 0, layoutW = 0;
  let tops = [], lens = [], menuTop = 0, menuEnd = 0, docMax = 1;

  function setHeights() {
    layoutH = H; layoutW = W;
    stage.style.height = H + "px";
    heroSpacer.style.marginTop = -H + "px";
    heroSpacer.style.height = H * 0.9 + "px";
    dishes.forEach((d, i) => { spacers[i].style.height = (d.scroll || 3.2) * H + "px"; });
  }
  function measure() {
    const y = window.scrollY;
    menuTop = menu.getBoundingClientRect().top + y;
    tops = spacers.map((s) => s.getBoundingClientRect().top + y);
    lens = spacers.map((s, i) => s.offsetHeight - (i === N - 1 ? H : 0));
    menuEnd = menuTop + menu.offsetHeight - H;
    docMax = Math.max(1, document.documentElement.scrollHeight - H);
  }
  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    // mobile URL bars change innerHeight constantly; only re-flow on real changes
    if (W !== layoutW || Math.abs(H - layoutH) > 140 || !layoutH) setHeights();
    else H = layoutH;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    measure();
    dirty = true;
  }

  const isMobile = () => W < 760 || W / H < 0.8;
  function geometry() {
    const mob = isMobile();
    const s = mob ? Math.min(W / 660, H / 980) : Math.min(W / 860, H / 700);
    return { mob, s, cx: W / 2, cy: mob ? H * 0.6 : H * 0.64 };
  }

  /* ---------------- frame sequences (optional, per dish) ---------------- */
  class Seq {
    constructor(cfg) { this.cfg = cfg; this.n = cfg.count; this.imgs = new Array(this.n); this.started = false; }
    url(i) { const c = this.cfg; return c.src.replace("{i}", String(i + (c.start || 0)).padStart(c.pad || 0, "0")); }
    load() {
      if (this.started) return; this.started = true;
      // coarse pass first (every 8th frame) so scrubbing works early, then fill in
      const order = [];
      for (let i = 0; i < this.n; i += 8) order.push(i);
      for (let i = 0; i < this.n; i++) if (i % 8) order.push(i);
      order.forEach((i) => { const im = new Image(); im.decoding = "async"; im.onload = () => { im._ok = true; dirty = true; }; im.src = this.url(i); this.imgs[i] = im; });
    }
    get(i) {
      for (let d = 0; d < this.n; d++) {
        const a = this.imgs[i - d], b = this.imgs[i + d];
        if (a && a._ok) return a; if (b && b._ok) return b;
      }
      return null;
    }
  }
  /* ---------------- photo layer builds (optional, per dish) ---------------- */
  class PhotoBuild {
    constructor(cfg) {
      this.cfg = cfg; this.started = false; this.ready = false;
      this.cv = document.createElement("canvas"); this.cv.width = cfg.w; this.cv.height = cfg.h;
      this.cx = this.cv.getContext("2d");
    }
    img(src) { const im = new Image(); im.decoding = "async"; im.onload = () => { im._ok = true; dirty = true; }; im.src = src; return im; }
    load() {
      if (this.started) return; this.started = true;
      const c = this.cfg;
      this.base = this.img(c.base);
      this.steps = c.steps.map((s) => ({ ...s, im: this.img(s.src) }));
      if (c.finale) this.finale = { ...c.finale, im: this.img(c.finale.src) };
    }
    draw(ctx, p) {
      const c = this.cfg, x = this.cx, W = c.w, Hh = c.h;
      if (!this.base || !this.base._ok) return false;
      x.globalCompositeOperation = "source-over"; x.globalAlpha = 1;
      x.clearRect(0, 0, W, Hh);
      x.drawImage(this.base, 0, 0, W, Hh);
      for (const s of this.steps) {
        const t = seg(p, s.at[0], s.at[1]);
        if (t <= 0 || !s.im._ok) continue;
        if (s.mode === "spread") {
          const w = s.im.naturalWidth, h = s.im.naturalHeight, e = 1 - Math.pow(1 - t, 2);
          x.save(); x.beginPath();
          x.ellipse(s.x + w / 2, s.y + h / 2, Math.max(1, e * w * 0.75), Math.max(1, e * h * 0.75), 0, 0, Math.PI * 2);
          x.clip(); x.globalAlpha = Math.min(1, t * 4); x.drawImage(s.im, s.x, s.y); x.restore();
          continue;
        }
        const d = drop(t);
        x.globalAlpha = d.a;
        x.drawImage(s.im, s.x, s.y - d.f * Hh * 0.75);
      }
      x.globalAlpha = 1;
      if (this.finale && this.finale.im._ok) {
        const f = seg(p, this.finale.at[0], this.finale.at[1]);
        if (f > 0) { x.globalAlpha = f; x.drawImage(this.finale.im, 0, 0, W, Hh); x.globalAlpha = 1; }
      }
      // feather the photo's edges into the page background
      x.globalCompositeOperation = "destination-in";
      x.save(); x.translate(W / 2, Hh * 0.52); x.scale(1, (Hh * 0.47) / (W * 0.48));
      const g = x.createRadialGradient(0, 0, W * 0.2, 0, 0, W * 0.48);
      g.addColorStop(0, "rgba(0,0,0,1)"); g.addColorStop(0.55, "rgba(0,0,0,.92)"); g.addColorStop(1, "rgba(0,0,0,0)");
      x.fillStyle = g; x.fillRect(-W, -W, W * 2, W * 2); x.restore();
      x.globalCompositeOperation = "source-over";
      const k = c.width / W;
      ctx.drawImage(this.cv, -c.width / 2, -c.plateY * k, c.width, Hh * k);
      return true;
    }
  }
  const photos = dishes.map((d) => (d.photos && d.photos.base ? new PhotoBuild(d.photos) : null));

  const seqs = dishes.map((d) => (d.frames && d.frames.src && d.frames.count ? new Seq(d.frames) : null));

  /* ---------------- scroll state ---------------- */
  function progressFor(i, y) { return clamp((y - tops[i]) / Math.max(1, lens[i])); }
  function activeIndex(y) {
    let a = 0;
    for (let i = 0; i < N; i++) if (y >= tops[i] - H * 0.35) a = i;
    return a;
  }
  function goToStart() {
    window.scrollTo({ top: Math.round(menuTop), behavior: RM ? "auto" : "smooth" });
  }
  function goToDish(i) {
    const target = tops[i] + lens[i] * (RM ? 0.2 : 0.88);
    window.scrollTo({ top: Math.round(target), behavior: RM ? "auto" : "smooth" });
  }

  /* ---------------- render loop ---------------- */
  let dirty = true, lastY = -1, running = true;
  const fade = dishes.map((_, i) => (i === 0 ? 1 : 0));
  const panelState = panels.map(() => ({ a: -1 }));
  let lastActive = -1, lastT = 0;
  const progressFill = $("#progressFill");
  const navLinks = [...document.querySelectorAll(".main-nav a")];
  let lastNav = "";

  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    const t = now / 1000, dt = Math.min(0.05, t - lastT || 0.016); lastT = t;
    const y = window.scrollY;
    const inMenu = y < menuEnd + H * 0.5;
    if (y !== lastY) { dirty = true; lastY = y; }

    // chrome: progress bar, category, nav
    progressFill.style.transform = `scaleY(${clamp(y / docMax)})`;
    const act = activeIndex(y);
    if (act !== lastActive) {
      catBtns.forEach((b, i) => b.setAttribute("aria-current", i === act ? "true" : "false"));
      lastActive = act;
      // preload the current and next dish's frames; others load when we get close
      [act, act + 1].forEach((k) => { seqs[k] && seqs[k].load(); photos[k] && photos[k].load(); });
    }
    catBar.classList.toggle("away", y > menuEnd + H * 0.3);
    const kitchenTop = $("#kitchen").getBoundingClientRect().top, visitTop = $("#visit").getBoundingClientRect().top;
    const navNow = visitTop < H * 0.5 ? "#visit" : kitchenTop < H * 0.5 ? "#kitchen" : "#menu";
    if (navNow !== lastNav) { navLinks.forEach((a) => a.classList.toggle("is-current", a.getAttribute("href") === navNow)); lastNav = navNow; }

    if (!inMenu) return; // stage is off screen: skip canvas work
    const hasFire = !RM; // flames & steam flicker over time, so keep drawing
    if (!dirty && !hasFire) return;
    dirty = false;

    const g = geometry();
    const ps = dishes.map((_, i) => progressFor(i, y));
    const heroP = clamp((y - menuTop) / (H * 0.5));

    // hero copy (tagline above, hint under the plate)
    heroCopy.style.top = g.cy + 108 * g.s + "px";
    heroTag.style.top = -(108 * g.s + 330 * g.s) + "px";
    heroCopy.style.opacity = String(1 - heroP);
    heroCopy.style.transform = `translateY(${-heroP * 30}px)`;

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // reduced motion: show finished dishes, cross-fade between them
    let rmActive = 0;
    if (RM) {
      for (let i = 0; i < N; i++) if (ps[i] > 0.04) rmActive = i;
      for (let i = 0; i < N; i++) { const target = i === rmActive ? 1 : 0; fade[i] += clamp(target - fade[i], -dt * 3, dt * 3); }
      if (fade.some((f, i) => Math.abs(f - (i === rmActive ? 1 : 0)) > 0.001)) dirty = true;
    }

    for (let i = 0; i < N; i++) {
      const d = dishes[i];
      let p = ps[i];
      const pn = i < N - 1 ? ps[i + 1] : 0;
      let ex = 0, alpha = 1;
      if (RM) {
        if (fade[i] <= 0.001) continue;
        p = i === 0 && ps[0] <= 0.04 ? 0 : 0.9;
        alpha = fade[i];
      } else {
        if (!((i === 0 || p > 0.003) && pn < 0.16)) continue;
        ex = eInOut(seg(pn, 0, 0.14));
      }
      const sl = eInOut(seg(p, 0.72, 0.86));
      const ox = g.mob ? 0 : sl * Math.max(0, Math.min(W * 0.22, W / 2 - 400 * g.s * (1 - 0.1) - 28));
      const oy = g.mob ? -sl * H * 0.25 : 0;
      const k = 1 - sl * (g.mob ? 0.16 : 0.1);
      ctx.save();
      ctx.translate(g.cx + ox, g.cy + oy);
      ctx.scale(g.s * k, g.s * k);
      const exitType = d.exit || "fade";
      if (exitType === "left") { ctx.translate(-ex * 1500, 0); alpha *= 1 - ex; }
      else if (exitType === "fade") alpha *= 1 - ex;
      ctx.globalAlpha = alpha;
      const sq = seqs[i];
      const img = sq && sq.started ? sq.get(Math.round(seg(p, 0, 0.72) * (sq.n - 1))) : null;
      const ph = photos[i];
      if (ph && ph.started) {
        if (exitType === "lift") { ctx.translate(0, -eInOut(ex) * 900); ctx.globalAlpha = alpha * (1 - ex); }
        if (!ph.draw(ctx, p) && R[d.renderer]) R[d.renderer].draw(ctx, p, t, { exit: 0, motion: !RM });
      } else if (img) {
        const w = d.frames.width || 760, h = (w * img.naturalHeight) / img.naturalWidth;
        if (exitType === "lift") { ctx.translate(0, -ex * 900); ctx.globalAlpha = alpha * (1 - ex); }
        ctx.drawImage(img, -w / 2, (d.frames.y != null ? d.frames.y : -h * 0.62), w, h);
      } else if (R[d.renderer]) {
        R[d.renderer].draw(ctx, p, t, { exit: exitType === "lift" ? ex : 0, motion: !RM });
      }
      ctx.restore();
    }

    // panels
    for (let i = 0; i < N; i++) {
      let a;
      if (RM) a = i === rmActive && (i > 0 || ps[0] > 0.04) ? 1 : 0;
      else a = seg(ps[i], 0.74, 0.86) * (1 - seg(i < N - 1 ? ps[i + 1] : 0, 0, 0.06));
      a = Math.round(a * 100) / 100;
      const st = panelState[i];
      if (st.a === a) continue;
      st.a = a;
      const el = panels[i];
      el.style.opacity = a;
      el.style.visibility = a > 0 ? "visible" : "hidden";
      const base = g.mob ? 0 : -42;
      el.style.transform = `translateY(calc(${base}% + ${(1 - a) * 22}px))`;
      el.classList.toggle("live", a > 0.6);
      el.toggleAttribute("inert", a <= 0.6);
    }
  }

  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", () => setTimeout(resize, 200));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) running = false;
    else if (!running) { running = true; dirty = true; requestAnimationFrame(frame); }
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { measure(); dirty = true; });
  window.addEventListener("load", () => { measure(); dirty = true; });
  photos[0] && photos[0].load(); photos[1] && photos[1].load();
  resize();
  requestAnimationFrame(frame);

  /* ---------------- floating embers & dust ---------------- */
  (function embers() {
    const c = $("#embers"), x = c.getContext("2d");
    let w, h, dpr; const parts = [];
    const reset = (p, init) => {
      p.x = Math.random() * w; p.y = init ? Math.random() * h : h + 10;
      p.v = 8 + Math.random() * 26; p.r = 0.5 + Math.random() * 1.7;
      p.hot = Math.random() < 0.45; p.ph = Math.random() * 6.3; p.sw = 6 + Math.random() * 18;
    };
    const size = () => { dpr = Math.min(window.devicePixelRatio || 1, 1.5); w = innerWidth; h = innerHeight; c.width = w * dpr; c.height = h * dpr; };
    size(); window.addEventListener("resize", size);
    const count = Math.round(Math.min(60, (innerWidth * innerHeight) / 26000));
    for (let i = 0; i < count; i++) { const p = {}; reset(p, true); parts.push(p); }
    let lt = 0;
    function draw(now) {
      const t = now / 1000, dt = Math.min(0.05, t - lt || 0.016); lt = t;
      x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, w, h);
      x.globalCompositeOperation = "lighter";
      for (const p of parts) {
        if (!RM) { p.y -= p.v * dt; if (p.y < -10) reset(p, false); }
        const px = p.x + Math.sin(t * 0.6 + p.ph) * p.sw;
        const fl = p.hot ? 0.45 + 0.35 * Math.sin(t * 5 + p.ph * 3) : 0.22;
        const lifeFade = clamp(p.y / h) * 0.9 + 0.1;
        const a = fl * lifeFade;
        if (p.hot) {
          x.fillStyle = `rgba(255,140,50,${a * 0.25})`; x.beginPath(); x.arc(px, p.y, p.r * 4, 0, 6.283); x.fill();
          x.fillStyle = `rgba(255,190,110,${a})`;
        } else x.fillStyle = `rgba(230,210,190,${a * 0.5})`;
        x.beginPath(); x.arc(px, p.y, p.r, 0, 6.283); x.fill();
      }
      if (!RM && !document.hidden) requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);
    mq.addEventListener && mq.addEventListener("change", () => requestAnimationFrame(draw));
    document.addEventListener("visibilitychange", () => { if (!document.hidden && !RM) requestAnimationFrame(draw); });
  })();

  /* ---------------- cart ---------------- */
  const KEY = "ember-cart-v1";
  let cart = [];
  try { cart = JSON.parse(localStorage.getItem(KEY) || "[]").filter((l) => dishes.some((d) => d.id === l.id) && l.qty > 0); } catch (e) { cart = []; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cart)); } catch (e) {} };
  const dishById = (id) => dishes.find((d) => d.id === id);

  const drawer = $("#drawer"), scrim = $("#scrim"), body = $("#drawerBody"), foot = $("#drawerFoot");
  const bagBtn = $("#bagBtn"), bagCount = $("#bagCount"), totalEl = $("#cartTotal");
  const toast = $("#toast");
  let confirmed = false;

  function addToCart(d, qty, option) {
    const key = d.id + "|" + (option || "");
    const line = cart.find((l) => l.key === key);
    if (line) line.qty = Math.min(99, line.qty + qty); else cart.push({ key, id: d.id, qty, option });
    confirmed = false;
    save(); renderCart();
    bagCount.classList.remove("bump"); void bagCount.offsetWidth; bagCount.classList.add("bump");
    showToast(`Added ${qty} × ${d.name}${option ? " · " + option : ""}`);
  }
  let toastT;
  function showToast(msg) {
    toast.textContent = msg; toast.classList.add("on");
    clearTimeout(toastT); toastT = setTimeout(() => toast.classList.remove("on"), 2200);
  }
  function renderCart() {
    const count = cart.reduce((s, l) => s + l.qty, 0);
    const total = cart.reduce((s, l) => s + l.qty * dishById(l.id).price, 0);
    bagCount.textContent = count; bagCount.classList.toggle("on", count > 0);
    bagBtn.setAttribute("aria-label", count ? `Open your order, ${count} item${count > 1 ? "s" : ""}` : "Open your order");
    totalEl.textContent = money(total);
    if (confirmed) return;
    foot.classList.toggle("hide", !cart.length);
    if (!cart.length) {
      body.innerHTML = `<div class="empty"><p>Your order is empty.<br>Scroll the menu and add something to your order.</p><button class="btn btn-ghost" type="button" data-browse>Browse the menu</button></div>`;
      return;
    }
    body.innerHTML = cart.map((l, idx) => {
      const d = dishById(l.id);
      return `<div class="line-item" data-idx="${idx}">
        <h3>${esc(d.name)}</h3><span class="lp">${money(d.price * l.qty)}</span>
        <span class="opt">${l.option ? esc(l.option) + " · " : ""}${money(d.price)} each</span>
        <div class="controls">
          <div class="stepper" role="group" aria-label="Quantity of ${esc(d.name)}">
            <button type="button" data-act="dec" aria-label="Decrease">−</button><output>${l.qty}</output><button type="button" data-act="inc" aria-label="Increase">+</button>
          </div>
          <button type="button" class="remove" data-act="rm">Remove</button>
        </div></div>`;
    }).join("");
  }
  body.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.hasAttribute("data-browse")) { closeDrawer(); goToDish(0); return; }
    if (b.hasAttribute("data-done")) { confirmed = false; renderCart(); closeDrawer(); return; }
    const row = b.closest(".line-item"); if (!row) return;
    const l = cart[+row.dataset.idx]; const act = b.dataset.act;
    if (act === "inc") l.qty = Math.min(99, l.qty + 1);
    if (act === "dec") l.qty -= 1;
    if (act === "rm" || l.qty <= 0) cart.splice(+row.dataset.idx, 1);
    save(); renderCart();
    if (act !== "rm" && l.qty > 0) { const nb = body.querySelector(`.line-item[data-idx="${row.dataset.idx}"] [data-act="${act}"]`); nb && nb.focus(); }
    else drawerClose.focus();
  });

  $("#checkoutBtn").addEventListener("click", () => {
    if (!cart.length) return;
    const total = totalEl.textContent, n = cart.reduce((s, l) => s + l.qty, 0);
    cart = []; save(); confirmed = true; renderCart();
    foot.classList.add("hide");
    body.innerHTML = `<div class="confirm"><div class="mark" aria-hidden="true">✓</div>
      <h3>Order received</h3>
      <p>${n} item${n > 1 ? "s" : ""} · ${total}<br>This demo checkout doesn't charge anything; connect your own payment or POS here.</p>
      <button class="btn btn-ghost" type="button" data-done>Back to the menu</button></div>`;
  });

  const drawerClose = $("#drawerClose");
  let lastFocus = null;
  function openDrawer() {
    lastFocus = document.activeElement;
    scrim.hidden = false; requestAnimationFrame(() => scrim.classList.add("on"));
    drawer.classList.add("open"); drawer.setAttribute("aria-hidden", "false");
    bagBtn.setAttribute("aria-expanded", "true");
    setTimeout(() => drawerClose.focus(), 50);
  }
  function closeDrawer() {
    scrim.classList.remove("on"); setTimeout(() => (scrim.hidden = true), 300);
    drawer.classList.remove("open"); drawer.setAttribute("aria-hidden", "true");
    bagBtn.setAttribute("aria-expanded", "false");
    (lastFocus && lastFocus.focus ? lastFocus : bagBtn).focus({ preventScroll: true });
  }
  bagBtn.addEventListener("click", openDrawer);
  drawerClose.addEventListener("click", closeDrawer);
  scrim.addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (e) => {
    if (!drawer.classList.contains("open")) return;
    if (e.key === "Escape") closeDrawer();
    if (e.key === "Tab") { // keep focus inside the drawer
      const f = [...drawer.querySelectorAll("button:not([disabled])")].filter((b) => b.offsetParent !== null);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { f[f.length - 1].focus(); e.preventDefault(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { f[0].focus(); e.preventDefault(); }
    }
  });
  renderCart();
})();
