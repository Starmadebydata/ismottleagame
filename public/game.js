(() => {
  "use strict";

  // --- Tabs (Hide & Seek vs Word Challenge) ---
  const tabArcade = document.getElementById("tab-arcade");
  const tabWord = document.getElementById("tab-word");
  const panelArcade = document.getElementById("panel-arcade");
  const panelWord = document.getElementById("panel-word");
  const arcadeControls = document.getElementById("arcade-controls");
  const jumpWordBtn = document.getElementById("jump-word-mode");
  const tabs = [tabArcade, tabWord];
  const panels = [panelArcade, panelWord];

  function selectTab(targetTab, focusTab = false) {
    tabs.forEach((tab, idx) => {
      const active = tab === targetTab;
      tab.setAttribute("aria-selected", String(active));
      panels[idx].hidden = active ? false : "until-found";
    });
    arcadeControls.hidden = targetTab !== tabArcade;
    if (focusTab) targetTab.focus();
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => selectTab(tab));
    tab.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        const next = tab === tabArcade ? tabWord : tabArcade;
        selectTab(next, true);
      }
    });
  });

  document.addEventListener("beforematch", (e) => {
    const panel = e.target.closest('[role="tabpanel"]');
    if (!panel) return;
    const targetTab = panel === panelWord ? tabWord : tabArcade;
    selectTab(targetTab);
  });

  jumpWordBtn.addEventListener("click", () => {
    selectTab(tabWord);
    document.getElementById("play").scrollIntoView({ behavior: "smooth" });
  });

  // --- Biome Switcher ---
  const BIOMES = {
    forest: {
      base: "#11221a",
      patches: ["#132a20", "#1b3a2b", "#234936", "#192b33", "#263b2a", "#2e3f27", "#16231c"],
      speckle: "rgba(52, 211, 153, 0.09)",
      accent: "#f5c451",
      stroke: "rgba(52, 211, 153, 0.55)"
    },
    tidepool: {
      base: "#091826",
      patches: ["#0d2236", "#113048", "#153d56", "#0e333f", "#184654", "#1b344d", "#0b1c2c"],
      speckle: "rgba(56, 189, 248, 0.11)",
      accent: "#38bdf8",
      stroke: "rgba(45, 212, 191, 0.55)"
    },
    ember: {
      base: "#1a0d0b",
      patches: ["#291410", "#381b14", "#472218", "#2d1a1e", "#3d2218", "#4d2b1a", "#20100d"],
      speckle: "rgba(251, 146, 60, 0.11)",
      accent: "#fb923c",
      stroke: "rgba(251, 191, 36, 0.55)"
    }
  };

  let currentBiome = "forest";
  const biomeBtns = document.querySelectorAll("[data-biome-pick]");

  // --- Hide & Seek Canvas Engine ---
  const canvas = document.getElementById("mottle-canvas");
  const ctx = canvas.getContext("2d");
  const overlay = document.getElementById("arena-overlay");
  const overlayTitle = document.getElementById("overlay-title");
  const overlayDesc = document.getElementById("overlay-desc");
  const btnStart = document.getElementById("btn-start");
  const btnShare = document.getElementById("btn-share");
  const shareFeedback = document.getElementById("share-feedback");
  const btnPause = document.getElementById("btn-pause");
  const btnRestart = document.getElementById("btn-restart");
  const btnSound = document.getElementById("btn-sound");

  const hudRound = document.getElementById("hud-round");
  const hudScore = document.getElementById("hud-score");
  const hudCombo = document.getElementById("hud-combo");
  const hudBest = document.getElementById("hud-best");
  const hudCamoText = document.getElementById("hud-camo-text");
  const hudCamoBar = document.getElementById("hud-camo-bar");
  const hudAlertText = document.getElementById("hud-alert-text");
  const hudAlertBar = document.getElementById("hud-alert-bar");

  const W = 960;
  const H = 540;
  const BEST_KEY = "mottle_hide_seek_best_v2";

  const terrainCanvas = document.createElement("canvas");
  terrainCanvas.width = W;
  terrainCanvas.height = H;
  const tCtx = terrainCanvas.getContext("2d");
  let terrainPixels = null;

  function generateTerrain() {
    const b = BIOMES[currentBiome];
    tCtx.fillStyle = b.base;
    tCtx.fillRect(0, 0, W, H);

    for (let i = 0; i < 165; i++) {
      const x = Math.random() * W;
      const y = Math.random() * H;
      const rx = 28 + Math.random() * 88;
      const ry = 22 + Math.random() * 68;
      tCtx.save();
      tCtx.translate(x, y);
      tCtx.rotate(Math.random() * Math.PI);
      tCtx.beginPath();
      tCtx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      tCtx.fillStyle = b.patches[i % b.patches.length];
      tCtx.globalAlpha = 0.45 + Math.random() * 0.35;
      tCtx.fill();
      tCtx.restore();
    }

    for (let i = 0; i < 240; i++) {
      tCtx.beginPath();
      tCtx.arc(Math.random() * W, Math.random() * H, 1 + Math.random() * 2.5, 0, Math.PI * 2);
      tCtx.fillStyle = i % 2 === 0 ? b.speckle : "rgba(0, 0, 0, 0.18)";
      tCtx.fill();
    }

    terrainPixels = tCtx.getImageData(0, 0, W, H).data;
  }

  biomeBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      currentBiome = btn.dataset.biomePick;
      document.body.dataset.biome = currentBiome;
      biomeBtns.forEach((b) => b.classList.toggle("is-active", b === btn));
      generateTerrain();
    });
  });

  function sampleTerrainRGB(x, y) {
    if (!terrainPixels) return [24, 52, 38];
    const px = Math.max(0, Math.min(W - 1, Math.round(x)));
    const py = Math.max(0, Math.min(H - 1, Math.round(y)));
    const idx = (py * W + px) * 4;
    return [terrainPixels[idx], terrainPixels[idx + 1], terrainPixels[idx + 2]];
  }

  let soundEnabled = false;
  let audioCtx = null;

  function playTone(freq, duration, type = "sine", gainVal = 0.08) {
    if (!soundEnabled) return;
    try {
      if (!audioCtx) {
        const AudioCtor = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtor) return;
        audioCtx = new AudioCtor();
      }
      if (audioCtx.state === "suspended") audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(gainVal, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch {
      // Ignore restricted audio context
    }
  }

  let state = "ready";
  let round = 1;
  let score = 0;
  let combo = 1;
  let comboTimer = 0;
  let ghostCount = 0;
  let best = Number(localStorage.getItem(BEST_KEY) || 0);
  let lastTime = 0;

  const player = {
    x: W / 2,
    y: H / 2,
    r: 15,
    speed: 245,
    camo: 100,
    alert: 0,
    moving: false
  };

  let fireflies = [];
  let queen = null;
  let queenCooldown = 6;
  let seekers = [];
  let particles = [];
  let popups = [];

  const pointer = { active: false, x: W / 2, y: H / 2 };
  const keys = new Set();

  function addPopup(x, y, text, color) {
    popups.push({ x, y, text, color, life: 1.0 });
  }

  function toArenaCoords(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * W,
      y: ((clientY - rect.top) / rect.height) * H
    };
  }

  function spawnWave(waveNum) {
    fireflies = [];
    const count = Math.min(5 + waveNum * 2, 16);
    for (let i = 0; i < count; i++) {
      let fx, fy;
      let tries = 0;
      do {
        fx = 44 + Math.random() * (W - 88);
        fy = 44 + Math.random() * (H - 88);
        tries++;
      } while (Math.hypot(fx - player.x, fy - player.y) < 110 && tries < 10);

      fireflies.push({ x: fx, y: fy, phase: Math.random() * Math.PI * 2, r: 7 });
    }

    seekers = [];
    const seekerCount = Math.min(2 + Math.floor((waveNum + 1) / 2), 6);
    for (let i = 0; i < seekerCount; i++) {
      const angle = (Math.PI * 2 * i) / seekerCount;
      const sx = W * (0.2 + 0.6 * (i % 2 === 0 ? 0.25 : 0.75)) + (Math.random() - 0.5) * 140;
      const sy = H * (0.25 + 0.5 * (i % 2)) + (Math.random() - 0.5) * 100;
      seekers.push({
        x: Math.max(60, Math.min(W - 60, sx)),
        y: Math.max(60, Math.min(H - 60, sy)),
        vx: Math.cos(angle) * (48 + waveNum * 9),
        vy: Math.sin(angle) * (48 + waveNum * 9),
        lookAngle: Math.random() * Math.PI * 2,
        turnSpeed: (0.65 + Math.random() * 0.6 + waveNum * 0.08) * (i % 2 === 0 ? 1 : -1),
        coneRange: 175 + Math.min(waveNum * 8, 55),
        coneHalf: 0.42,
        spotting: false,
        ghostCooldown: 0
      });
    }
  }

  function startNewGame() {
    generateTerrain();
    round = 1;
    score = 0;
    combo = 1;
    comboTimer = 0;
    ghostCount = 0;
    queen = null;
    queenCooldown = 5;
    player.x = W / 2;
    player.y = H / 2;
    player.camo = 100;
    player.alert = 0;
    player.moving = false;
    particles = [];
    popups = [];
    pointer.active = false;
    keys.clear();
    spawnWave(round);
    state = "playing";
    overlay.hidden = true;
    btnShare.hidden = true;
    shareFeedback.textContent = "";
    btnPause.textContent = "Pause";
    updateHUD();
  }

  function togglePause() {
    if (state === "playing") {
      state = "paused";
      overlayTitle.textContent = "Paused";
      overlayDesc.textContent = "Take a breather in the undergrowth. Resume whenever you're ready.";
      btnStart.textContent = "Resume";
      btnShare.hidden = true;
      overlay.hidden = false;
      btnPause.textContent = "Resume";
    } else if (state === "paused") {
      state = "playing";
      overlay.hidden = true;
      btnPause.textContent = "Pause";
    }
  }

  function triggerGameOver() {
    state = "gameover";
    if (score > best) {
      best = score;
      localStorage.setItem(BEST_KEY, String(best));
    }
    playTone(170, 0.35, "sawtooth", 0.08);
    overlayTitle.textContent = "Spotted!";
    overlayDesc.textContent = `Caught in Round ${round}. Score: ${score.toLocaleString()} (Best: ${best.toLocaleString()}) • Ghost Steals: ${ghostCount}`;
    btnStart.textContent = "Play Again";
    btnShare.hidden = false;
    shareFeedback.textContent = "";
    overlay.hidden = false;
    updateHUD();
  }

  btnShare.addEventListener("click", async () => {
    const text = `Mottle: Hide & Seek (${currentBiome.toUpperCase()} biome) — Round ${round} | Score: ${score.toLocaleString()} | Ghost Steals: ${ghostCount} — Play at https://ismottleagame.net/`;
    try {
      await navigator.clipboard.writeText(text);
      shareFeedback.textContent = "Copied score card to clipboard!";
    } catch {
      shareFeedback.textContent = text;
    }
  });

  function updateHUD() {
    hudRound.textContent = String(round);
    hudScore.textContent = score.toLocaleString();
    hudCombo.textContent = `x${combo}`;
    hudBest.textContent = best.toLocaleString();

    const camoPct = Math.round(player.camo);
    const alertPct = Math.round(player.alert);
    const camoState = camoPct >= 75 ? "Hidden" : camoPct >= 35 ? "Blending" : "Exposed";
    const alertState = alertPct >= 65 ? "Danger!" : alertPct >= 20 ? "Caution" : "Safe";

    hudCamoText.textContent = `${camoPct}% (${camoState})`;
    hudCamoBar.style.setProperty("--pct", `${camoPct}%`);
    hudAlertText.textContent = `${alertPct}% (${alertState})`;
    hudAlertBar.style.setProperty("--pct", `${alertPct}%`);
  }

  function isPointInCone(px, py, seeker) {
    const dx = px - seeker.x;
    const dy = py - seeker.y;
    const dist = Math.hypot(dx, dy);
    if (dist > seeker.coneRange) return false;
    let diff = Math.atan2(dy, dx) - seeker.lookAngle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return Math.abs(diff) <= seeker.coneHalf;
  }

  function burstParticles(x, y, color, count = 12) {
    for (let p = 0; p < count; p++) {
      const ang = (Math.PI * 2 * p) / count + Math.random() * 0.3;
      const spd = 50 + Math.random() * 85;
      particles.push({ x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, life: 0.45, color });
    }
  }

  function update(dt) {
    if (state !== "playing") return;

    if (comboTimer > 0) {
      comboTimer -= dt;
      if (comboTimer <= 0) combo = 1;
    }

    let dx = 0;
    let dy = 0;
    if (pointer.active) {
      const pdx = pointer.x - player.x;
      const pdy = pointer.y - player.y;
      const dist = Math.hypot(pdx, pdy);
      if (dist > 6) {
        dx = pdx / dist;
        dy = pdy / dist;
      }
    } else {
      if (keys.has("ArrowUp") || keys.has("KeyW")) dy -= 1;
      if (keys.has("ArrowDown") || keys.has("KeyS")) dy += 1;
      if (keys.has("ArrowLeft") || keys.has("KeyA")) dx -= 1;
      if (keys.has("ArrowRight") || keys.has("KeyD")) dx += 1;
      const len = Math.hypot(dx, dy);
      if (len > 0) {
        dx /= len;
        dy /= len;
      }
    }

    player.moving = dx !== 0 || dy !== 0;

    if (player.moving) {
      player.x = Math.max(player.r + 6, Math.min(W - player.r - 6, player.x + dx * player.speed * dt));
      player.y = Math.max(player.r + 6, Math.min(H - player.r - 6, player.y + dy * player.speed * dt));
      player.camo = Math.max(0, player.camo - 135 * dt);
    } else {
      player.camo = Math.min(100, player.camo + 98 * dt);
    }

    // Collect fireflies
    for (let i = fireflies.length - 1; i >= 0; i--) {
      const f = fireflies[i];
      f.phase += dt * 4;
      if (Math.hypot(player.x - f.x, player.y - f.y) < player.r + f.r + 6) {
        fireflies.splice(i, 1);
        const pts = 100 * round * combo;
        score += pts;
        if (score > best) {
          best = score;
          localStorage.setItem(BEST_KEY, String(best));
        }
        addPopup(f.x, f.y - 10, combo > 1 ? `+${pts} x${combo}!` : `+${pts}`, BIOMES[currentBiome].accent);
        combo = Math.min(5, combo + 1);
        comboTimer = 2.6;
        playTone(580 + combo * 75, 0.14, "sine", 0.07);
        burstParticles(f.x, f.y, BIOMES[currentBiome].accent);
      }
    }

    // Rare Queen Firefly
    if (!queen) {
      queenCooldown -= dt;
      if (queenCooldown <= 0) {
        const fromLeft = Math.random() < 0.5;
        queen = {
          x: fromLeft ? 20 : W - 20,
          y: 60 + Math.random() * (H - 120),
          vx: (fromLeft ? 1 : -1) * (120 + round * 12),
          vy: (Math.random() - 0.5) * 90,
          phase: 0,
          r: 9
        };
        queenCooldown = 9 + Math.random() * 5;
      }
    } else {
      queen.x += queen.vx * dt;
      queen.y += queen.vy * dt;
      queen.phase += dt * 7;
      if (queen.y < 30 || queen.y > H - 30) queen.vy *= -1;
      if (Math.hypot(player.x - queen.x, player.y - queen.y) < player.r + queen.r + 8) {
        const qPts = 300 * round;
        score += qPts;
        player.alert = Math.max(0, player.alert - 35);
        if (score > best) {
          best = score;
          localStorage.setItem(BEST_KEY, String(best));
        }
        addPopup(queen.x, queen.y - 12, `QUEEN +${qPts}!`, "#38bdf8");
        burstParticles(queen.x, queen.y, "#38bdf8", 18);
        playTone(980, 0.22, "triangle", 0.08);
        queen = null;
      } else if (queen.x < -20 || queen.x > W + 20) {
        queen = null;
      }
    }

    if (fireflies.length === 0) {
      round += 1;
      score += 250;
      addPopup(player.x, player.y - 20, `ROUND ${round}! +250`, "#34d399");
      playTone(880, 0.22, "triangle", 0.08);
      spawnWave(round);
    }

    let anySpotting = false;
    for (const s of seekers) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.x < 40 || s.x > W - 40) s.vx *= -1;
      if (s.y < 40 || s.y > H - 40) s.vy *= -1;
      s.lookAngle += s.turnSpeed * dt;
      if (s.ghostCooldown > 0) s.ghostCooldown -= dt;

      const inLight = isPointInCone(player.x, player.y, s);
      const exposed = player.moving || player.camo < 75;
      s.spotting = inLight && exposed;
      if (s.spotting) {
        anySpotting = true;
      } else if (inLight && !exposed && s.ghostCooldown <= 0) {
        s.ghostCooldown = 2.2;
        ghostCount += 1;
        score += 50;
        addPopup(player.x, player.y - 16, "+50 GHOST!", "#34d399");
        playTone(440, 0.1, "sine", 0.05);
      }
    }

    if (anySpotting) {
      const exposureFactor = player.moving ? 1.15 : 0.75;
      player.alert = Math.min(100, player.alert + 82 * exposureFactor * dt);
      if (player.alert >= 100) {
        triggerGameOver();
        return;
      }
    } else {
      player.alert = Math.max(0, player.alert - 38 * dt);
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }

    for (let i = popups.length - 1; i >= 0; i--) {
      const pop = popups[i];
      pop.y -= 28 * dt;
      pop.life -= dt * 1.1;
      if (pop.life <= 0) popups.splice(i, 1);
    }

    updateHUD();
  }

  function render() {
    const b = BIOMES[currentBiome];
    ctx.drawImage(terrainCanvas, 0, 0);

    for (const s of seekers) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.arc(s.x, s.y, s.coneRange, s.lookAngle - s.coneHalf, s.lookAngle + s.coneHalf);
      ctx.closePath();

      const grad = ctx.createRadialGradient(s.x, s.y, 8, s.x, s.y, s.coneRange);
      if (s.spotting) {
        grad.addColorStop(0, "rgba(248, 113, 113, 0.55)");
        grad.addColorStop(1, "rgba(248, 113, 113, 0.05)");
      } else {
        grad.addColorStop(0, "rgba(245, 196, 81, 0.28)");
        grad.addColorStop(1, "rgba(245, 196, 81, 0.02)");
      }
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(s.x, s.y, 10, 0, Math.PI * 2);
      ctx.fillStyle = s.spotting ? "#f87171" : "#e2e8f0";
      ctx.fill();
      ctx.restore();
    }

    for (const f of fireflies) {
      const pulse = 0.7 + 0.3 * Math.sin(f.phase);
      const bobY = f.y + Math.sin(f.phase * 0.8) * 3;
      ctx.save();
      ctx.beginPath();
      ctx.arc(f.x, bobY, f.r * 2.4 * pulse, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(245, 196, 81, 0.24)";
      ctx.fill();

      ctx.beginPath();
      ctx.arc(f.x, bobY, f.r * 0.75, 0, Math.PI * 2);
      ctx.fillStyle = b.accent;
      ctx.fill();
      ctx.restore();
    }

    if (queen) {
      const qPulse = 0.75 + 0.25 * Math.sin(queen.phase);
      ctx.save();
      ctx.beginPath();
      ctx.arc(queen.x, queen.y, queen.r * 2.8 * qPulse, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(56, 189, 248, 0.28)";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(queen.x, queen.y, queen.r, 0, Math.PI * 2);
      ctx.fillStyle = "#7dd3fc";
      ctx.fill();
      ctx.restore();
    }

    if (state === "playing" && pointer.active) {
      ctx.save();
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(player.x, player.y);
      ctx.lineTo(pointer.x, pointer.y);
      ctx.strokeStyle = b.stroke;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    const [tr, tg, tb] = sampleTerrainRGB(player.x, player.y);
    const blend = player.camo / 100;
    const pr = Math.round(245 * (1 - blend) + tr * blend);
    const pg = Math.round(158 * (1 - blend) + tg * blend);
    const pb = Math.round(66 * (1 - blend) + tb * blend);

    ctx.save();
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgb(${pr}, ${pg}, ${pb})`;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = player.camo >= 75 ? b.stroke : b.accent;
    ctx.stroke();
    ctx.restore();

    for (const p of particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life * 2);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
      ctx.restore();
    }

    for (const pop of popups) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, pop.life);
      ctx.font = "bold 14px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = pop.color;
      ctx.fillText(pop.text, pop.x, pop.y);
      ctx.restore();
    }
  }

  function loop(ts) {
    if (!lastTime) lastTime = ts;
    const dt = Math.min(0.05, (ts - lastTime) / 1000);
    lastTime = ts;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  btnStart.addEventListener("click", () => {
    if (state === "paused") togglePause();
    else startNewGame();
  });
  btnRestart.addEventListener("click", startNewGame);
  btnPause.addEventListener("click", togglePause);

  btnSound.addEventListener("click", () => {
    soundEnabled = !soundEnabled;
    btnSound.setAttribute("aria-pressed", String(soundEnabled));
    btnSound.textContent = soundEnabled ? "Sound: On" : "Sound: Off";
    if (soundEnabled) playTone(520, 0.1, "sine", 0.06);
  });

  canvas.addEventListener("pointerdown", (e) => {
    if (state !== "playing") return;
    canvas.setPointerCapture(e.pointerId);
    const pt = toArenaCoords(e.clientX, e.clientY);
    pointer.active = true;
    pointer.x = pt.x;
    pointer.y = pt.y;
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!pointer.active || state !== "playing") return;
    const pt = toArenaCoords(e.clientX, e.clientY);
    pointer.x = pt.x;
    pointer.y = pt.y;
  });

  const endPointer = () => { pointer.active = false; };
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);

  window.addEventListener("keydown", (e) => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) {
      if (document.activeElement === canvas || state === "playing") e.preventDefault();
    }
    if (e.code === "KeyP" || e.code === "Escape") {
      if (state === "playing" || state === "paused") togglePause();
      return;
    }
    keys.add(e.code);
  });

  window.addEventListener("keyup", (e) => { keys.delete(e.code); });

  generateTerrain();
  spawnWave(1);
  updateHUD();
  requestAnimationFrame(loop);

  // --- Mottle Word Challenge ---
  const WORD_DECK = [
    { word: "MOTTLE", valid: true, clue: "Featured in NYT Connections (bottle -> mottle). Worth 10 Scrabble pts!" },
    { word: "DAPPLE", valid: true, clue: "Synonym of mottle: to mark with spots or rounded patches of light." },
    { word: "BLOTCH", valid: true, clue: "A large irregular patch or stain of color (16 Scrabble pts)." },
    { word: "MOTTLY", valid: false, clue: "Bluff! The real adjective is MOTTLED or MOTLEY (one T, E before Y)." },
    { word: "SPECKS", valid: true, clue: "Tiny spots or particles (14 Scrabble pts)." },
    { word: "CAMOED", valid: false, clue: "Bluff! Informal slang — 'CAMOED' is not accepted in standard Scrabble dictionaries." },
    { word: "BRINDL", valid: false, clue: "Bluff! Missing the final E — the valid 7-letter word is BRINDLE." },
    { word: "BOTTLE", valid: true, clue: "Baby gear wordplay pair with MOTTLE in NYT Connections (8 Scrabble pts)." }
  ];

  const LETTER_PTS = { A:1,B:3,C:3,D:2,E:1,F:4,G:2,H:4,I:1,J:8,K:5,L:1,M:3,N:1,O:1,P:3,Q:10,R:1,S:1,T:1,U:1,V:4,W:4,X:8,Y:4,Z:10 };
  const wgTiles = document.getElementById("wg-tiles");
  const wgClue = document.getElementById("wg-clue");
  const wgFeedback = document.getElementById("wg-feedback");
  const wgStreak = document.getElementById("wg-streak");
  const wgScore = document.getElementById("wg-score");
  const wgBtnValid = document.getElementById("wg-btn-valid");
  const wgBtnBluff = document.getElementById("wg-btn-bluff");
  const wgBtnNext = document.getElementById("wg-btn-next");

  let wgIdx = 0;
  let wgStreakVal = 0;
  let wgScoreVal = 0;
  let wgLocked = false;

  function renderWordCard() {
    const item = WORD_DECK[wgIdx % WORD_DECK.length];
    wgTiles.innerHTML = "";
    for (const ch of item.word) {
      const div = document.createElement("div");
      div.className = "tile";
      div.innerHTML = `${ch}<sub>${LETTER_PTS[ch] || 1}</sub>`;
      wgTiles.appendChild(div);
    }
    wgClue.textContent = `Word ${wgIdx + 1} of ${WORD_DECK.length}: Is "${item.word}" valid in official Scrabble?`;
    wgFeedback.textContent = "";
    wgBtnValid.disabled = false;
    wgBtnBluff.disabled = false;
    wgBtnNext.hidden = true;
    wgLocked = false;
  }

  function answerWord(guessValid) {
    if (wgLocked) return;
    wgLocked = true;
    const item = WORD_DECK[wgIdx % WORD_DECK.length];
    const correct = guessValid === item.valid;
    if (correct) {
      wgStreakVal += 1;
      wgScoreVal += 100 * wgStreakVal;
      wgFeedback.textContent = `Correct! ${item.clue}`;
      playTone(720, 0.14, "sine", 0.07);
    } else {
      wgStreakVal = 0;
      wgFeedback.textContent = `Not quite! ${item.clue}`;
      playTone(210, 0.2, "sawtooth", 0.06);
    }
    wgStreak.textContent = String(wgStreakVal);
    wgScore.textContent = String(wgScoreVal);
    wgBtnValid.disabled = true;
    wgBtnBluff.disabled = true;
    wgBtnNext.hidden = false;
  }

  wgBtnValid.addEventListener("click", () => answerWord(true));
  wgBtnBluff.addEventListener("click", () => answerWord(false));
  wgBtnNext.addEventListener("click", () => {
    wgIdx = (wgIdx + 1) % WORD_DECK.length;
    renderWordCard();
  });

  renderWordCard();
})();
