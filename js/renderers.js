/* =====================================================================
   Interactive menu — built-in dish renderers
   Each renderer draws one dish in "dish units" (plate ≈ 600 units wide,
   plate surface centred on 0,0, y grows downward, food stacks upward).
   draw(ctx, p, t, env)
     p   scroll progress through the dish, 0 → 1 (scrubbed, reversible)
     t   seconds, used only for ambient flicker (flames, steam)
     env { exit: 0→1 when the dish is leaving, motion: false if reduced }
   The build happens in p 0 → 0.70; the app slides the dish aside after.
   ===================================================================== */
(function () {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const seg = (p, a, b) => clamp((p - a) / (b - a));
  const eOut = (t) => 1 - Math.pow(1 - t, 3);
  const eInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const lerp = (a, b, t) => a + (b - a) * t;

  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // smooth periodic noise around an outline
  function ringNoise(n, seed, octaves = 5) {
    const r = rng(seed), ph = [], out = [];
    for (let k = 0; k < octaves; k++) ph.push(r() * TAU);
    let max = 0;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU; let v = 0;
      for (let k = 0; k < octaves; k++) v += Math.sin((k + 2) * a + ph[k]) / (k + 1);
      out.push(v); max = Math.max(max, Math.abs(v));
    }
    return out.map((v) => v / max);
  }

  /* ---------- falling with a soft bounce ---------- */
  function drop(t) {
    if (t <= 0) return { f: 1, sq: 0, a: 0 };
    if (t < 0.55) { const k = t / 0.55; return { f: 1 - k * k, sq: 0, a: clamp(t / 0.1) }; }
    if (t < 0.8) {
      const k = (t - 0.55) / 0.25, b = Math.sin(k * Math.PI);
      return { f: b * 0.06, sq: k < 0.25 ? (1 - k / 0.25) * 0.1 : -b * 0.02, a: 1 };
    }
    const k = (t - 0.8) / 0.2;
    return { f: Math.sin(k * Math.PI) * 0.012, sq: 0, a: 1 };
  }
  function withDrop(ctx, t, H, baseY, fn, x = 0) {
    if (t <= 0) return;
    const d = drop(t);
    ctx.save();
    ctx.globalAlpha *= d.a;
    ctx.translate(x, baseY - d.f * H);
    ctx.scale(1 + d.sq, 1 - d.sq);
    fn(t);
    ctx.restore();
  }

  /* ---------- primitives ---------- */
  function ell(ctx, x, y, rx, ry, rot = 0) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(rx, 0.01), Math.max(ry, 0.01), rot, 0, TAU); }
  function cylPath(ctx, rx, ry, yTop, yBot) {
    ctx.beginPath();
    ctx.moveTo(-rx, yTop); ctx.lineTo(-rx, yBot);
    ctx.ellipse(0, yBot, rx, ry, 0, Math.PI, 0, true);
    ctx.lineTo(rx, yTop);
    ctx.ellipse(0, yTop, rx, ry, 0, 0, Math.PI, true);
    ctx.closePath();
  }
  function blobPath(ctx, cx, cy, rx, ry, noise, amp) {
    ctx.beginPath();
    const n = noise.length;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * TAU, r = 1 + amp * noise[i % n];
      const x = cx + Math.cos(a) * rx * r, y = cy + Math.sin(a) * ry * r;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
  }
  function hGrad(ctx, rx, stops) {
    const g = ctx.createLinearGradient(-rx, 0, rx, 0);
    stops.forEach(([o, c]) => g.addColorStop(o, c));
    return g;
  }
  function rGrad(ctx, x, y, r0, r1, stops, x1 = x, y1 = y) {
    const g = ctx.createRadialGradient(x, y, r0, x1, y1, r1);
    stops.forEach(([o, c]) => g.addColorStop(o, c));
    return g;
  }
  function softShadow(ctx, x, y, rx, ry, a) {
    if (a <= 0) return;
    ctx.save();
    ctx.translate(x, y); ctx.scale(1, ry / rx);
    ctx.fillStyle = rGrad(ctx, 0, 0, 0, rx, [[0, `rgba(0,0,0,${a})`], [0.55, `rgba(0,0,0,${a * 0.55})`], [1, "rgba(0,0,0,0)"]]);
    ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
    ctx.restore();
  }

  /* ---------- fire ---------- */
  function flames(ctx, t, I, o) {
    if (I <= 0.01) return;
    const { w = 240, h = 420, y = -40, n = 11, seed = 1 } = o || {};
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = rGrad(ctx, 0, y - h * 0.35, 10, w * 1.7, [
      [0, `rgba(255,140,45,${0.42 * I})`], [0.45, `rgba(200,60,12,${0.16 * I})`], [1, "rgba(120,20,0,0)"]
    ]);
    ctx.fillRect(-w * 2, y - h * 1.6, w * 4, h * 2.2);
    for (let pass = 0; pass < 2; pass++) {
      const nn = pass ? Math.round(n * 0.7) : n;
      for (let i = 0; i < nn; i++) {
        const u = nn === 1 ? 0 : (i / (nn - 1)) * 2 - 1;
        const ph = i * 1.71 + seed + pass * 3.3;
        const x = u * w * (pass ? 0.6 : 0.95);
        const fl = 0.72 + 0.2 * Math.sin(t * 7.3 + ph) + 0.1 * Math.sin(t * 13.7 + ph * 2.1);
        const hh = h * (1 - Math.abs(u) * 0.55) * fl * I * (pass ? 0.62 : 1);
        const ww = w * (pass ? 0.16 : 0.22) * (1 - Math.abs(u) * 0.3);
        const sway = Math.sin(t * 3.1 + ph) * ww * 0.9;
        const lg = ctx.createLinearGradient(0, y, 0, y - hh);
        if (pass) {
          lg.addColorStop(0, "rgba(255,250,225,0)");
          lg.addColorStop(0.14, `rgba(255,250,225,${0.75 * I})`);
          lg.addColorStop(0.45, `rgba(255,200,90,${0.45 * I})`);
          lg.addColorStop(1, "rgba(255,120,20,0)");
        } else {
          lg.addColorStop(0, "rgba(255,220,150,0)");
          lg.addColorStop(0.12, `rgba(255,220,150,${0.8 * I})`);
          lg.addColorStop(0.3, `rgba(255,150,50,${0.62 * I})`);
          lg.addColorStop(0.65, `rgba(220,70,18,${0.3 * I})`);
          lg.addColorStop(1, "rgba(150,25,0,0)");
        }
        ctx.fillStyle = lg;
        ctx.beginPath();
        ctx.moveTo(x - ww, y);
        ctx.bezierCurveTo(x - ww * 1.05, y - hh * 0.45, x + sway - ww * 0.35, y - hh * 0.72, x + sway, y - hh);
        ctx.bezierCurveTo(x + sway + ww * 0.35, y - hh * 0.72, x + ww * 1.05, y - hh * 0.45, x + ww, y);
        ctx.closePath(); ctx.fill();
      }
    }
    // sparks
    const r = rng(seed * 97);
    for (let i = 0; i < 26; i++) {
      const sp = 0.35 + r() * 0.5, off = r(), xr = r() * 2 - 1, wob = r() * TAU;
      const ph = (t * sp + off) % 1;
      const sx = xr * w * 0.9 + Math.sin(t * 2 + wob) * 18 * ph;
      const sy = y - 30 - ph * h * 1.25;
      const a = I * (1 - ph) * 0.9;
      ctx.fillStyle = `rgba(255,${170 + ((r() * 60) | 0)},80,${a})`;
      ell(ctx, sx, sy, 2.2, 2.2); ctx.fill();
    }
    ctx.restore();
  }

  function steam(ctx, t, I, o) {
    if (I <= 0.01) return;
    const { n = 6, w = 260, y = -20, h = 360, seed = 5 } = o || {};
    const r = rng(seed);
    for (let i = 0; i < n; i++) {
      const x0 = (r() - 0.5) * w, sp = 0.12 + r() * 0.08, off = r(), dir = r() > 0.5 ? 1 : -1;
      const ph = (t * sp + off) % 1;
      const life = Math.sin(ph * Math.PI);
      for (let j = 0; j < 7; j++) {
        const q = ph - j * 0.035; if (q < 0) continue;
        const yy = y - q * h;
        const xx = x0 + Math.sin(q * 7 + i * 1.3 + t * 0.6) * 26 * q + dir * q * 40;
        const rad = 22 + q * 70;
        const a = I * 0.07 * life * (1 - j / 7);
        const g = ctx.createRadialGradient(xx, yy, 0, xx, yy, rad);
        g.addColorStop(0, `rgba(255,244,232,${a})`); g.addColorStop(1, "rgba(255,244,232,0)");
        ctx.fillStyle = g; ctx.fillRect(xx - rad, yy - rad, rad * 2, rad * 2);
      }
    }
  }

  function splash(ctx, ts, o) {
    if (ts <= 0 || ts >= 1) return;
    const { n = 16, seed = 3, color = "246,207,90", spread = 150, lift = 150 } = o || {};
    const r = rng(seed);
    ctx.save();
    for (let i = 0; i < n; i++) {
      const ang = (r() - 0.5) * Math.PI * 0.95; // mostly upward fan
      const v = 0.5 + r() * 0.7, sz = 2 + r() * 4;
      const x = Math.sin(ang) * spread * v * ts * 1.6;
      const y = -Math.cos(ang) * lift * v * ts * 1.6 + 260 * ts * ts;
      const a = (1 - ts) * (ts < 0.08 ? ts / 0.08 : 1);
      ctx.fillStyle = `rgba(${color},${a})`;
      ell(ctx, x, y, sz, sz * 0.85); ctx.fill();
      ctx.fillStyle = `rgba(255,255,235,${a * 0.7})`;
      ell(ctx, x - sz * 0.3, y - sz * 0.3, sz * 0.35, sz * 0.3); ctx.fill();
    }
    ctx.restore();
  }

  /* =========================================================== */
  /* PLATE + BURGER                                              */
  /* =========================================================== */
  function plate(ctx) {
    softShadow(ctx, 0, 30, 360, 84, 0.75);
    cylPath(ctx, 300, 80, 0, 13);
    ctx.fillStyle = hGrad(ctx, 300, [[0, "#050404"], [0.5, "#141110"], [1, "#050404"]]);
    ctx.fill();
    ell(ctx, 0, 0, 300, 80);
    ctx.fillStyle = rGrad(ctx, 0, -30, 20, 320, [[0, "#2a2420"], [0.55, "#171311"], [1, "#0b0908"]]);
    ctx.fill();
    ell(ctx, 0, 5, 218, 57);
    ctx.fillStyle = rGrad(ctx, 0, -10, 10, 230, [[0, "rgba(40,34,30,.9)"], [1, "rgba(10,8,7,.9)"]]);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,230,200,.04)"; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, 0, 297, 78, 0, Math.PI * 1.12, Math.PI * 1.88);
    ctx.strokeStyle = "rgba(255,210,165,.16)"; ctx.lineWidth = 2.5; ctx.stroke();
  }

  const BUN_RX = 150;
  const bunSpecks = (() => { const r = rng(11), a = []; for (let i = 0; i < 70; i++) { const an = r() * TAU, rr = Math.sqrt(r()); a.push([Math.cos(an) * rr * 138, Math.sin(an) * rr * 28, r()]); } return a; })();
  function bunBottom(ctx) {
    // base at y=0 (sits on plate), cut face at -38
    cylPath(ctx, BUN_RX, 33, -38, -6);
    ctx.fillStyle = hGrad(ctx, BUN_RX, [[0, "#5e2a0c"], [0.18, "#a65a22"], [0.45, "#d48a45"], [0.7, "#b9692c"], [1, "#5e2a0c"]]);
    ctx.fill();
    // soft lower edge
    ctx.beginPath(); ctx.ellipse(0, -6, BUN_RX, 33, 0, 0.1, Math.PI - 0.1);
    ctx.strokeStyle = "rgba(40,15,4,.5)"; ctx.lineWidth = 3; ctx.stroke();
    ell(ctx, 0, -38, BUN_RX, 33);
    ctx.fillStyle = rGrad(ctx, 0, -46, 6, 160, [[0, "#ebb576"], [0.55, "#cf8a48"], [0.85, "#9d5422"], [1, "#6a300f"]]);
    ctx.fill();
    for (const [x, y, k] of bunSpecks) {
      ctx.fillStyle = k > 0.5 ? "rgba(120,55,18,.35)" : "rgba(255,225,180,.25)";
      ell(ctx, x, -38 + y, 2 + k * 2, 1 + k); ctx.fill();
    }
  }

  const pattyNoise = ringNoise(72, 21, 7);
  const pattySpecks = (() => { const r = rng(31), a = []; for (let i = 0; i < 160; i++) { const an = r() * TAU, rr = Math.sqrt(r()) * 0.93; a.push([Math.cos(an) * rr * 166, Math.sin(an) * rr * 36, r()]); } return a; })();
  function patty(ctx) {
    // base y=0, top -34
    cylPath(ctx, 168, 37, -44, 0);
    ctx.fillStyle = hGrad(ctx, 168, [[0, "#1d0b04"], [0.3, "#4b2210"], [0.5, "#5c2c15"], [0.75, "#3e1b0b"], [1, "#1d0b04"]]);
    ctx.fill();
    // crusty side bumps
    const r = rng(41);
    for (let i = 0; i < 46; i++) {
      const u = r() * 2 - 1, yy = -44 + r() * 44 + Math.sqrt(1 - u * u) * 37 * 0.9;
      ctx.fillStyle = r() > 0.5 ? "rgba(20,8,2,.55)" : "rgba(120,60,28,.35)";
      ell(ctx, u * 165, yy, 4 + r() * 5, 2 + r() * 3); ctx.fill();
    }
    // seam between the two smashed patties
    ctx.beginPath(); ctx.ellipse(0, -22, 167, 37, 0, 0.05, Math.PI - 0.05);
    ctx.strokeStyle = "rgba(10,3,0,.75)"; ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, -20, 167, 37, 0, 0.1, Math.PI - 0.1);
    ctx.strokeStyle = "rgba(160,85,40,.25)"; ctx.lineWidth = 1.5; ctx.stroke();
    blobPath(ctx, 0, -44, 170, 38, pattyNoise, 0.045);
    ctx.fillStyle = rGrad(ctx, -20, -54, 10, 175, [[0, "#6d3519"], [0.5, "#4e230f"], [1, "#2a1006"]]);
    ctx.fill();
    for (const [x, y, k] of pattySpecks) {
      ctx.fillStyle = k > 0.66 ? "rgba(140,75,38,.55)" : k > 0.33 ? "rgba(20,7,2,.6)" : "rgba(255,190,140,.12)";
      ell(ctx, x, -44 + y, 1.5 + k * 3.5, 1 + k * 1.8, k * 3); ctx.fill();
    }
  }

  function cheese(ctx, m) {
    // base at patty top (0). m = melt 0..1. A square slice, turned a little.
    const R = 182, RY = 40, rot = 0.38;
    const P = [0, 1, 2, 3].map((k) => {
      const a = rot + k * Math.PI / 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      let x = ca * R, y = sa * RY;
      // melting: corners slump toward the patty edge and droop over it
      x = lerp(x, ca * 172, m * 0.4);
      y = lerp(y, sa * 39, m * 0.4) + (sa > 0 ? m * 16 * sa : m * 3);
      return [x, y];
    });
    const path = () => {
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = P[i], b = P[(i + 1) % 4], pr = P[(i + 3) % 4];
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        const bow = 1 + 0.16 * m;
        if (i === 0) ctx.moveTo(lerp(a[0], pr[0], 0.1), lerp(a[1], pr[1], 0.1));
        ctx.quadraticCurveTo(a[0], a[1], lerp(a[0], b[0], 0.1), lerp(a[1], b[1], 0.1));
        ctx.quadraticCurveTo(mx * bow, my * bow + (my > 0 ? m * 6 : 0), lerp(a[0], b[0], 0.9), lerp(a[1], b[1], 0.9));
      }
      ctx.closePath();
    };
    ctx.save(); ctx.translate(0, 4); path(); ctx.fillStyle = "#c27006"; ctx.fill(); ctx.restore();
    if (m > 0) {
      const r = rng(51);
      for (let i = 0; i < 5; i++) {
        const u = -0.7 + i * 0.33 + (r() - 0.5) * 0.12;
        const x = u * 168, y0 = Math.sqrt(Math.max(0, 1 - u * u)) * 39 + 2;
        const L = m * (10 + r() * 26), w = 6 + r() * 5;
        const g = ctx.createLinearGradient(0, y0, 0, y0 + L);
        g.addColorStop(0, "#f2a516"); g.addColorStop(1, "#dc8606");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(x - w, y0 - 4); ctx.lineTo(x - w * 0.7, y0 + L - w * 0.6);
        ctx.arc(x, y0 + L - w * 0.6, w * 0.7, Math.PI, 0, true);
        ctx.lineTo(x + w, y0 - 4); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "rgba(255,240,180,.45)";
        ell(ctx, x - w * 0.25, y0 + L - w * 0.8, w * 0.22, w * 0.3); ctx.fill();
      }
    }
    path();
    const g = ctx.createLinearGradient(0, -RY, 0, RY + 16);
    g.addColorStop(0, "#ffd457"); g.addColorStop(0.6, "#f6ae20"); g.addColorStop(1, "#e3900a");
    ctx.fillStyle = g; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.fillStyle = "rgba(255,248,210,.32)";
    ell(ctx, -40, -14, 70, 10, -0.15); ctx.fill();
    ctx.restore();
  }

  const PICKLES = [[-92, -4, 0.2], [-30, 12, -0.3], [36, -8, 0.4], [96, 8, -0.1], [2, -22, 0.1]];
  function pickle(ctx, rot) {
    ctx.rotate(rot * 0.3);
    ell(ctx, 0, 2, 31, 10.5); ctx.fillStyle = "#3d4a12"; ctx.fill();
    ell(ctx, 0, 0, 31, 10.5); ctx.fillStyle = "#58681c"; ctx.fill();
    ell(ctx, 0, 0, 25, 8.2); ctx.fillStyle = rGrad(ctx, 0, -2, 2, 26, [[0, "#c2cc6a"], [1, "#8d9c34"]]); ctx.fill();
    ctx.fillStyle = "rgba(240,240,190,.75)";
    for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU; ell(ctx, Math.cos(a) * 12, Math.sin(a) * 4, 2.4, 1.1, a); ctx.fill(); }
    ctx.fillStyle = "rgba(255,255,230,.35)"; ell(ctx, -8, -3, 8, 2); ctx.fill();
  }

  const lettuceNoise = ringNoise(120, 61, 6);
  function lettuce(ctx) {
    const path = (dy, s) => {
      ctx.beginPath();
      for (let i = 0; i <= 120; i++) {
        const a = (i / 120) * TAU;
        const r = s * (1 + 0.05 * Math.sin(a * 17) + 0.035 * lettuceNoise[i % 120]);
        const x = Math.cos(a) * 184 * r, y = dy + Math.sin(a) * 38 * r + (Math.sin(a) > 0 ? Math.abs(Math.sin(a * 17)) * 6 : 0);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.closePath();
    };
    path(5, 1); ctx.fillStyle = "#2f6418"; ctx.fill();
    path(0, 1);
    const g = ctx.createLinearGradient(0, -44, 0, 50);
    g.addColorStop(0, "#a6d65a"); g.addColorStop(0.5, "#6fae36"); g.addColorStop(1, "#3f7d1f");
    ctx.fillStyle = g; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.strokeStyle = "rgba(225,250,180,.35)"; ctx.lineWidth = 2;
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * 120, Math.sin(a) * 28);
      ctx.quadraticCurveTo(Math.cos(a + 0.1) * 160, Math.sin(a + 0.1) * 40, Math.cos(a) * 190, Math.sin(a) * 48);
      ctx.stroke();
    }
    ctx.restore();
  }

  const seeds = (() => {
    const r = rng(71), a = [];
    for (let i = 0; i < 60; i++) { const th = r() * TAU, rho = 0.12 + Math.sqrt(r()) * 0.78; a.push([th, rho, r() * TAU]); }
    return a;
  })();
  function topBun(ctx) {
    const b = 0;
    ctx.beginPath();
    ctx.moveTo(-160, b);
    ctx.bezierCurveTo(-164, b - 74, -108, b - 122, 0, b - 124);
    ctx.bezierCurveTo(108, b - 122, 164, b - 74, 160, b);
    ctx.ellipse(0, b, 160, 32, 0, 0, Math.PI, false);
    ctx.closePath();
    ctx.fillStyle = rGrad(ctx, -38, b - 96, 8, 215, [[0, "#f8bd72"], [0.35, "#dc8a3c"], [0.75, "#a3501b"], [1, "#5d270a"]]);
    ctx.fill();
    ctx.save(); ctx.clip();
    // under-rim shade
    ctx.fillStyle = "rgba(50,18,4,.35)"; ell(ctx, 0, b + 10, 165, 30); ctx.fill();
    // studio sheen
    ctx.fillStyle = rGrad(ctx, -40, b - 98, 2, 80, [[0, "rgba(255,245,220,.42)"], [1, "rgba(255,245,220,0)"]]);
    ctx.fillRect(-160, b - 130, 320, 140);
    for (const [th, rho, rot] of seeds) {
      const z = Math.sin(th), hgt = 120 * Math.sqrt(1 - rho * rho);
      const x = Math.cos(th) * rho * 152, y = b + z * 34 * rho - hgt * 0.93;
      if (y < b - 118 || z < -0.6) continue;
      ctx.fillStyle = "rgba(90,40,12,.35)"; ell(ctx, x + 1, y + 1.4, 4.6, 2.3, rot); ctx.fill();
      ctx.fillStyle = "#f4e4bd"; ell(ctx, x, y, 4.4, 2.1, rot); ctx.fill();
    }
    ctx.restore();
  }

  function burger(ctx, p, t, env) {
    const ex = env.exit || 0;
    const lift = eInOut(ex);
    // flames burst behind the burger, then settle into a glow
    const fI = eOut(seg(p, 0.6, 0.67)) * (1 - 0.55 * seg(p, 0.69, 0.86)) * (1 - ex);
    ctx.save(); ctx.translate(0, -lift * 900);
    flames(ctx, t, fI, { w: 220, h: 470, y: -30, seed: 2 });
    ctx.restore();

    ctx.save(); ctx.globalAlpha *= 1 - seg(ex, 0.1, 0.8); plate(ctx); ctx.restore();

    ctx.save();
    ctx.translate(0, -lift * 900);
    ctx.globalAlpha *= 1 - seg(ex, 0.55, 1);
    // contact shadow on the plate grows as the burger gets heavier
    softShadow(ctx, 0, 4, 200, 46, 0.55 + 0.2 * seg(p, 0, 0.6));
    bunBottom(ctx);
    const tP = seg(p, 0.02, 0.13);
    if (tP > 0) softShadow(ctx, 0, -36, 175 * (0.5 + 0.5 * tP), 38, 0.45 * tP);
    withDrop(ctx, tP, 520, -38, () => patty(ctx));
    const tC = seg(p, 0.13, 0.23), melt = eOut(seg(p, 0.2, 0.36));
    withDrop(ctx, tC, 520, -81, () => cheese(ctx, melt));
    PICKLES.forEach(([x, y, r], i) => {
      const tk = seg(p, 0.32 + i * 0.022, 0.41 + i * 0.022);
      withDrop(ctx, tk, 480, -87 + y * 0.6, () => pickle(ctx, r), x);
    });
    withDrop(ctx, seg(p, 0.44, 0.55), 520, -96, () => lettuce(ctx));
    const tB = seg(p, 0.54, 0.65);
    if (tB > 0.45) softShadow(ctx, 0, -104, 170, 36, 0.4 * seg(tB, 0.45, 0.6));
    withDrop(ctx, tB, 540, -106, () => topBun(ctx));
    ctx.restore();
  }

  /* =========================================================== */
  /* PIZZA                                                       */
  /* =========================================================== */
  const grain = (() => { const r = rng(81), a = []; for (let i = 0; i < 22; i++) a.push([0.18 + r() * 0.8, r() * TAU, 0.4 + r() * 1.2, r()]); return a; })();
  function board(ctx) {
    softShadow(ctx, 0, 30, 360, 86, 0.7);
    // handle (behind, to the right)
    ctx.save();
    ctx.translate(330, -26); ctx.rotate(-0.12);
    ctx.beginPath(); ctx.roundRect(-70, -16, 160, 30, 15);
    ctx.fillStyle = "#4a2c15"; ctx.fill();
    ctx.beginPath(); ctx.roundRect(-70, -18, 160, 26, 13);
    ctx.fillStyle = hGrad(ctx, 90, [[0, "#7e522c"], [1, "#9a6a3c"]]); ctx.fill();
    ell(ctx, 66, -5, 7, 5); ctx.fillStyle = "#2a170a"; ctx.fill();
    ctx.restore();
    cylPath(ctx, 292, 80, -16, 4);
    ctx.fillStyle = hGrad(ctx, 292, [[0, "#2c180b"], [0.5, "#5a361b"], [1, "#2c180b"]]); ctx.fill();
    ell(ctx, 0, -16, 292, 80);
    ctx.fillStyle = rGrad(ctx, -40, -50, 20, 320, [[0, "#a7754a"], [0.6, "#875a33"], [1, "#5a3a1e"]]);
    ctx.fill();
    ctx.save(); ctx.clip();
    for (const [k, a0, len, s] of grain) {
      ctx.beginPath(); ctx.ellipse(-20, -16, 300 * k, 80 * k * 0.92, 0, a0, a0 + len);
      ctx.strokeStyle = `rgba(55,28,10,${0.12 + s * 0.14})`; ctx.lineWidth = 1 + s * 1.5; ctx.stroke();
    }
    ctx.restore();
    ctx.beginPath(); ctx.ellipse(0, -16, 290, 79, 0, Math.PI * 1.1, Math.PI * 1.9);
    ctx.strokeStyle = "rgba(255,220,170,.18)"; ctx.lineWidth = 2; ctx.stroke();
  }

  const doughNoise = ringNoise(90, 91, 6);
  const charSpots = (() => { const r = rng(101), a = []; for (let i = 0; i < 34; i++) { const an = r() * TAU; a.push([an, 0.9 + r() * 0.08, 3 + r() * 7, r()]); } return a; })();
  function dough(ctx, bake) {
    // base at 0; top -13
    cylPath(ctx, 226, 61, -13, 0);
    ctx.fillStyle = hGrad(ctx, 226, [[0, "#9a6a36"], [0.5, lerpC([226, 192, 140], [196, 130, 64], bake)], [1, "#9a6a36"]]);
    ctx.fill();
    blobPath(ctx, 0, -13, 228, 62, doughNoise, 0.015);
    ctx.fillStyle = rGrad(ctx, 0, -20, 150, 232, [[0, lerpC([245, 222, 178], [233, 190, 120], bake)], [0.85, lerpC([236, 205, 152], [205, 140, 68], bake)], [1, lerpC([214, 178, 120], [150, 88, 36], bake)]]);
    ctx.fill();
    ell(ctx, 0, -12, 196, 51);
    ctx.fillStyle = lerpC([246, 226, 188], [238, 206, 150], bake); ctx.fill();
    if (bake > 0) {
      for (const [an, rr, s, k] of charSpots) {
        ctx.fillStyle = `rgba(${k > 0.5 ? "40,20,8" : "90,45,15"},${bake * 0.7})`;
        ell(ctx, Math.cos(an) * 214 * rr, -13 + Math.sin(an) * 57 * rr, s, s * 0.45, an); ctx.fill();
      }
    }
  }
  function lerpC(a, b, t) { return `rgb(${(a[0] + (b[0] - a[0]) * t) | 0},${(a[1] + (b[1] - a[1]) * t) | 0},${(a[2] + (b[2] - a[2]) * t) | 0})`; }

  const sauceNoise = ringNoise(80, 111, 6);
  const herbs = (() => { const r = rng(121), a = []; for (let i = 0; i < 50; i++) { const an = r() * TAU, rr = Math.sqrt(r()) * 0.9; a.push([Math.cos(an) * rr, Math.sin(an) * rr, r()]); } return a; })();
  function sauce(ctx, s, bake) {
    if (s <= 0) return;
    blobPath(ctx, 0, -13, 188 * s, 49 * s, sauceNoise, 0.04);
    ctx.fillStyle = rGrad(ctx, -20, -22, 10, 190 * s + 1, [[0, lerpC([200, 45, 28], [185, 40, 22], bake)], [1, lerpC([150, 26, 14], [120, 22, 10], bake)]]);
    ctx.fill();
    ctx.save(); ctx.clip();
    ctx.fillStyle = "rgba(255,150,120,.14)"; ell(ctx, -30, -24, 90 * s, 14 * s); ctx.fill();
    for (const [x, y, k] of herbs) {
      if (Math.hypot(x, y) > s) continue;
      ctx.fillStyle = k > 0.5 ? "rgba(60,30,10,.5)" : "rgba(90,110,40,.45)";
      ell(ctx, x * 180, -13 + y * 46, 1.5 + k, 1); ctx.fill();
    }
    ctx.restore();
  }

  const MOZZ = (() => { const r = rng(131), a = []; const pos = [[-120, -6], [-60, -26], [10, -30], [80, -22], [140, -2], [-90, 18], [-15, 6], [60, 20], [120, 26], [-30, 30]]; pos.forEach(([x, y]) => a.push([x, y, ringNoise(24, (r() * 1e6) | 0, 4), 22 + r() * 8])); return a; })();
  function mozz(ctx, noise, rad, melt) {
    const rx = rad * (1 + melt * 0.35), ry = rad * 0.38 * (1 + melt * 0.25);
    blobPath(ctx, 0, 2, rx, ry, noise, 0.18); ctx.fillStyle = "rgba(120,80,40,.25)"; ctx.fill();
    blobPath(ctx, 0, 0, rx, ry, noise, 0.18);
    ctx.fillStyle = rGrad(ctx, -rx * 0.3, -ry * 0.4, 1, rx * 1.2, [[0, "#fffdf6"], [0.6, "#f6eedc"], [1, melt > 0.5 ? "#e8c890" : "#e4d6b8"]]);
    ctx.fill();
  }
  const TOMS = [[-80, -14], [40, -6], [110, 12], [-130, 14], [-10, 26]];
  function tomato(ctx) {
    ell(ctx, 0, 2, 29, 10); ctx.fillStyle = "#7d150c"; ctx.fill();
    ell(ctx, 0, 0, 29, 10); ctx.fillStyle = "#c92a19"; ctx.fill();
    ell(ctx, 0, 0, 24, 8); ctx.fillStyle = rGrad(ctx, -4, -2, 1, 24, [[0, "#f06a4d"], [1, "#d83a24"]]); ctx.fill();
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + 0.4;
      ctx.fillStyle = "#f1a24a"; ell(ctx, Math.cos(a) * 12, Math.sin(a) * 4, 6, 2.2, a); ctx.fill();
      ctx.fillStyle = "rgba(255,240,170,.9)"; ell(ctx, Math.cos(a) * 12, Math.sin(a) * 4, 1.5, 0.8); ctx.fill();
    }
    ctx.fillStyle = "rgba(255,255,255,.3)"; ell(ctx, -9, -3, 7, 1.6); ctx.fill();
  }
  const BASIL = [[-40, -18, 0.6], [70, 6, -0.8], [-110, 2, 2.4], [130, -12, 1.2], [10, 18, -2.2], [-60, 24, 0.2]];
  function leaf(ctx, rot, L = 30) {
    ctx.rotate(rot);
    ctx.scale(1, 0.5);
    ctx.beginPath(); ctx.moveTo(-L, 0);
    ctx.quadraticCurveTo(-L * 0.1, -L * 0.62, L, 0);
    ctx.quadraticCurveTo(-L * 0.1, L * 0.62, -L, 0);
    ctx.fillStyle = "rgba(10,40,5,.4)"; ctx.save(); ctx.translate(2, 6); ctx.fill(); ctx.restore();
    const g = ctx.createLinearGradient(0, -L * 0.5, 0, L * 0.5);
    g.addColorStop(0, "#5fb043"); g.addColorStop(1, "#24661c");
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = "rgba(190,240,150,.5)"; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(-L * 0.95, 0); ctx.quadraticCurveTo(0, -2, L * 0.9, 0); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,.18)"; ell(ctx, -L * 0.15, -L * 0.18, L * 0.4, L * 0.08, -0.1); ctx.fill();
  }

  function pizza(ctx, p, t) {
    const ein = eOut(seg(p, 0.02, 0.17));
    const bake = seg(p, 0.64, 0.95);
    ctx.save();
    ctx.translate(-(1 - ein) * 1200, 0);
    ctx.globalAlpha *= seg(p, 0.01, 0.06);
    // embers glow under the board while it bakes
    if (bake > 0) {
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = rGrad(ctx, 0, -120, 10, 420, [[0, `rgba(255,120,40,${0.18 * bake})`], [1, "rgba(255,80,20,0)"]]);
      ctx.fillRect(-500, -500, 1000, 700); ctx.restore();
    }
    board(ctx);
    const tD = seg(p, 0.16, 0.28);
    if (tD > 0.4) softShadow(ctx, 0, -14, 235, 62, 0.5 * seg(tD, 0.4, 0.6));
    withDrop(ctx, tD, 520, -16, () => {
      dough(ctx, bake);
      sauce(ctx, eOut(seg(p, 0.28, 0.4)), bake);
      MOZZ.forEach(([x, y, n, r], i) => {
        const tk = seg(p, 0.4 + i * 0.013, 0.48 + i * 0.013);
        withDrop(ctx, tk, 420, -13 + y, () => mozz(ctx, n, r, bake), x);
      });
      TOMS.forEach(([x, y], i) => {
        withDrop(ctx, seg(p, 0.52 + i * 0.018, 0.6 + i * 0.018), 440, -15 + y, () => tomato(ctx), x);
      });
      BASIL.forEach(([x, y, r], i) => {
        const tk = seg(p, 0.62 + i * 0.012, 0.7 + i * 0.012);
        if (tk <= 0) return;
        const sw = (1 - tk) * Math.sin(tk * 9 + i) * 0.9;
        withDrop(ctx, tk, 380, -17 + y, () => leaf(ctx, r + sw, 26 + (i % 3) * 4), x + Math.sin(tk * 6 + i) * 30 * (1 - tk));
      });
    });
    steam(ctx, t, seg(p, 0.66, 0.8), { w: 280, y: -40, h: 380, seed: 9 });
    ctx.restore();
  }

  /* =========================================================== */
  /* STEAK                                                       */
  /* =========================================================== */
  const ringsN = (() => { const a = []; for (let i = 0; i < 10; i++) a.push(ringNoise(60, 140 + i, 5)); return a; })();
  const barkMarks = (() => { const r = rng(151), a = []; for (let i = 0; i < 90; i++) a.push([r() * 2 - 1, r(), r()]); return a; })();
  function woodSlice(ctx) {
    softShadow(ctx, 0, 44, 380, 92, 0.75);
    cylPath(ctx, 312, 86, 0, 36);
    ctx.fillStyle = hGrad(ctx, 312, [[0, "#140b05"], [0.5, "#3a2414"], [1, "#140b05"]]); ctx.fill();
    ctx.save(); ctx.clip();
    for (const [u, v, k] of barkMarks) {
      const y = Math.sqrt(1 - u * u) * 86 + v * 36 - 6;
      ctx.strokeStyle = k > 0.5 ? "rgba(0,0,0,.28)" : "rgba(120,85,55,.14)";
      ctx.lineWidth = 2 + k * 3; ctx.beginPath(); ctx.moveTo(u * 310, y); ctx.lineTo(u * 310 + (k - 0.5) * 6, y + 14 + k * 14); ctx.stroke();
    }
    ctx.restore();
    ell(ctx, 0, 0, 312, 86); ctx.fillStyle = "#2a190d"; ctx.fill();
    ell(ctx, 0, 0, 300, 81);
    ctx.fillStyle = rGrad(ctx, -30, -20, 10, 310, [[0, "#d2a46c"], [0.5, "#b4844f"], [0.9, "#8a5e34"], [1, "#6e4824"]]);
    ctx.fill();
    ctx.save(); ctx.clip();
    ringsN.forEach((n, i) => {
      const k = (i + 1) / 11;
      blobPath(ctx, 8, 2, 296 * k, 80 * k, n, 0.05);
      ctx.strokeStyle = `rgba(95,58,26,${0.18 + (i % 3) * 0.06})`; ctx.lineWidth = 1.5 + (i % 2); ctx.stroke();
    });
    ctx.strokeStyle = "rgba(60,35,15,.35)"; ctx.lineWidth = 1.5;
    [[0.4, 0.9], [2.2, 0.7], [4.0, 0.85]].forEach(([a, l]) => { ctx.beginPath(); ctx.moveTo(Math.cos(a) * 40, Math.sin(a) * 11); ctx.lineTo(Math.cos(a) * 300 * l, Math.sin(a) * 80 * l); ctx.stroke(); });
    ctx.restore();
    ctx.beginPath(); ctx.ellipse(0, 0, 306, 84, 0, Math.PI * 1.1, Math.PI * 1.9);
    ctx.strokeStyle = "rgba(255,220,170,.14)"; ctx.lineWidth = 2; ctx.stroke();
  }
  function pan(ctx) {
    // handle (behind, to the right-back)
    ctx.save(); ctx.translate(218, -44); ctx.rotate(-0.32);
    ctx.beginPath(); ctx.roundRect(0, -15, 175, 30, 12);
    ctx.fillStyle = hGrad(ctx, 90, [[0, "#0b0a09"], [0.5, "#2a2725"], [1, "#121110"]]); ctx.fill();
    ell(ctx, 150, 0, 7, 6); ctx.fillStyle = "#000"; ctx.fill();
    ctx.restore();
    softShadow(ctx, 0, -2, 250, 66, 0.6);
    cylPath(ctx, 236, 64, -38, -4);
    ctx.fillStyle = hGrad(ctx, 236, [[0, "#070606"], [0.3, "#1f1c1a"], [0.45, "#3a3532"], [0.6, "#1c1a18"], [1, "#070606"]]); ctx.fill();
    ell(ctx, 0, -38, 236, 64); ctx.fillStyle = "#2c2826"; ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, -38, 234, 63, 0, Math.PI * 1.08, Math.PI * 1.92);
    ctx.strokeStyle = "rgba(255,230,200,.16)"; ctx.lineWidth = 2; ctx.stroke();
    ell(ctx, 0, -35, 214, 56);
    ctx.fillStyle = rGrad(ctx, 0, -60, 10, 220, [[0, "#22201e"], [0.7, "#131211"], [1, "#0a0909"]]); ctx.fill();
    // inner wall
    ctx.beginPath(); ctx.ellipse(0, -35, 214, 56, 0, Math.PI, TAU);
    ctx.strokeStyle = "rgba(0,0,0,.6)"; ctx.lineWidth = 8; ctx.stroke();
  }
  const steakNoise = ringNoise(80, 161, 6);
  const marbling = (() => { const r = rng(171), a = []; for (let i = 0; i < 12; i++) a.push([(r() - 0.5) * 220, (r() - 0.5) * 60, 20 + r() * 50, r() * TAU, r()]); return a; })();
  function steakPath(ctx, y) { blobPath(ctx, 0, y, 172, 52, steakNoise, 0.08); }
  function ribeye(ctx, sizzle) {
    for (let k = 0; k <= 30; k += 5) {
      steakPath(ctx, -k);
      ctx.fillStyle = k < 15 ? "#1f0b04" : "#33140a"; ctx.fill();
    }
    steakPath(ctx, -32);
    ctx.fillStyle = rGrad(ctx, -10, -44, 10, 165, [[0, "#7c3b1b"], [0.45, "#5a2611"], [0.85, "#3a1608"], [1, "#220c04"]]);
    ctx.fill();
    ctx.save(); ctx.clip();
    // fat cap on the far left
    ctx.fillStyle = rGrad(ctx, -128, -52, 5, 70, [[0, "rgba(220,170,115,.7)"], [1, "rgba(160,100,55,0)"]]);
    ell(ctx, -128, -48, 62, 40); ctx.fill();
    ctx.lineCap = "round";
    for (const [x, y, l, a, k] of marbling) {
      ctx.strokeStyle = `rgba(225,175,130,${0.15 + k * 0.15})`; ctx.lineWidth = 1.5 + k * 2.5;
      ctx.beginPath(); ctx.moveTo(x, -32 + y);
      ctx.quadraticCurveTo(x + Math.cos(a) * l * 0.5, -32 + y + Math.sin(a) * 8, x + Math.cos(a) * l, -32 + y + Math.sin(a + 1) * 6);
      ctx.stroke();
    }
    // grill marks
    for (let i = -3; i <= 3; i++) {
      const x0 = i * 44;
      ctx.strokeStyle = "rgba(18,6,2,.85)"; ctx.lineWidth = 11;
      ctx.beginPath(); ctx.moveTo(x0 - 60, -70); ctx.lineTo(x0 + 40, 10); ctx.stroke();
      ctx.strokeStyle = "rgba(255,160,90,.14)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x0 - 66, -68); ctx.lineTo(x0 + 34, 12); ctx.stroke();
    }
    ctx.fillStyle = "rgba(255,225,190,.13)"; ell(ctx, -20, -54, 90, 12, -0.08); ctx.fill();
    ctx.restore();
    if (sizzle > 0) {
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = `rgba(255,120,40,${0.05 * sizzle})`; steakPath(ctx, -32); ctx.fill(); ctx.restore();
    }
  }
  function butter(ctx, m) {
    const h = 15 * (1 - 0.75 * m), rx = 27 * (1 - 0.25 * m), ry = 10;
    if (m > 0) {
      ell(ctx, 0, 4, 28 + 58 * m, 10 + 15 * m);
      ctx.fillStyle = rGrad(ctx, -10, 0, 2, 30 + 60 * m, [[0, `rgba(250,205,95,${0.75})`], [0.7, `rgba(215,140,40,${0.55 * m})`], [1, "rgba(150,80,20,0)"]]);
      ctx.fill();
      ctx.fillStyle = `rgba(255,250,220,${0.35 * m})`; ell(ctx, -18 * m, -2, 20 + 20 * m, 3 + 2 * m); ctx.fill();
    }
    if (m < 1) {
      ctx.beginPath(); ctx.roundRect(-rx, -h - ry * 0.4, rx * 2, h + ry * 0.8, 7);
      ctx.fillStyle = "#e9bd4b"; ctx.fill();
      ell(ctx, 0, -h - ry * 0.3, rx, ry * 0.75); ctx.fillStyle = "#fbe39a"; ctx.fill();
      ctx.fillStyle = "rgba(255,255,240,.6)"; ell(ctx, -8, -h - ry * 0.45, 9, 2.5); ctx.fill();
    }
  }
  function thyme(ctx) {
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-72, 4); ctx.quadraticCurveTo(0, -10, 74, 0); ctx.stroke();
    ctx.strokeStyle = "#6e5a2c"; ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.moveTo(-72, 0); ctx.quadraticCurveTo(0, -14, 74, -4); ctx.stroke();
    // a little branch
    ctx.beginPath(); ctx.moveTo(10, -7); ctx.quadraticCurveTo(30, -22, 50, -26); ctx.stroke();
    for (let i = 0; i < 16; i++) {
      const u = i / 15, x = -66 + u * 136, y = -0.5 * 14 * 4 * u * (1 - u) * 1.0 - 2;
      const side = i % 2 ? 1 : -1;
      ctx.fillStyle = i % 3 ? "#5c7d35" : "#7fa14a";
      ell(ctx, x, y + side * 4, 6 - u * 2, 2.6, side * 0.6); ctx.fill();
    }
    for (let i = 0; i < 5; i++) { ctx.fillStyle = "#6f9442"; ell(ctx, 18 + i * 8, -10 - i * 3.5 + (i % 2 ? 3 : -3), 4.5, 2.2, 0.5); ctx.fill(); }
  }

  function steak(ctx, p, t) {
    const ein = eOut(seg(p, 0.02, 0.18));
    ctx.save();
    ctx.translate(0, (1 - ein) * 650);
    ctx.globalAlpha *= seg(p, 0.01, 0.08);
    const fI = eOut(seg(p, 0.3, 0.4)) * (1 - 0.5 * seg(p, 0.46, 0.72));
    flames(ctx, t, fI, { w: 270, h: 560, y: -20, n: 13, seed: 7 });
    woodSlice(ctx);
    pan(ctx);
    const tS = seg(p, 0.18, 0.31);
    if (tS > 0.4) softShadow(ctx, 0, -34, 165, 50, 0.6 * seg(tS, 0.4, 0.6));
    const sizzle = seg(p, 0.28, 0.4);
    withDrop(ctx, tS, 600, -32, () => ribeye(ctx, sizzle));
    ctx.save(); ctx.translate(0, -50); splash(ctx, seg(p, 0.27, 0.37), { n: 14, seed: 13, color: "235,150,70", spread: 200, lift: 110 }); ctx.restore();
    // butter
    const tB = seg(p, 0.45, 0.52), melt = eOut(seg(p, 0.53, 0.92));
    withDrop(ctx, tB, 480, -66, () => butter(ctx, melt), 18);
    ctx.save(); ctx.translate(18, -76); splash(ctx, seg(p, 0.5, 0.62), { n: 18, seed: 17, spread: 170, lift: 170 }); ctx.restore();
    // thyme
    const tT = seg(p, 0.56, 0.67);
    if (tT > 0) {
      const sw = (1 - tT) * Math.sin(tT * 8) * 0.8;
      withDrop(ctx, tT, 420, -74, () => { ctx.rotate(-0.25 + sw); thyme(ctx); }, -30 + (1 - tT) * 40);
    }
    steam(ctx, t, seg(p, 0.33, 0.45) * 0.8, { n: 5, w: 240, y: -70, h: 330, seed: 23 });
    ctx.restore();
  }

  window.EMBER_RENDERERS = {
    burger: { draw: burger },
    pizza: { draw: pizza },
    steak: { draw: steak },
    util: { clamp, seg, eOut, eInOut, drop }
  };
})();
