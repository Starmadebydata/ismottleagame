(() => {
  "use strict";

  const canvas = document.getElementById("mottle-canvas");
  const ctx = canvas.getContext("2d");
  const overlay = document.getElementById("arena-overlay");
  const overlayTitle = document.getElementById("overlay-title");
  const overlayDesc = document.getElementById("overlay-desc");
  const btnStart = document.getElementById("btn-start");
  const btnPause = document.getElementById("btn-pause");
  const btnRestart = document.getElementById("btn-restart");
  const btnSound = document.getElementById("btn-sound");

  const hudRound = document.getElementById("hud-round");
  const hudScore = document.getElementById("hud-score");
  const hudBest = document.getElementById("hud-best");
  const hudCamoText = document.getElementById("hud-camo-text");
  const hudCamoBar = document.getElementById("hud-camo-bar");
  const hudAlertText = document.getElementById("hud-alert-text");
  const hudAlertBar = document.getElementById("hud-alert-bar");

  const W = 960;
  const H = 540;
  const BEST_KEY = "mottle_hide_seek_best_v1";

  // Pre-rendered mottled terrain offscreen canvas for 60fps performance
  const terrainCanvas = document.createElement("canvas");
  terrainCanvas.width = W;
  terrainCanvas.height = H;
  const tCtx = terrainCanvas.getContext("2d");
  let terrainPixels = null;

  const PALETTE = [
    "#132a20",
    "#1b3a2b",
    "#234936",
    "#192b33",
    "#263b2a",
    "#2e3f27",
    "#16231c"
  ];

  function generateTerrain() {
    tCtx.fillStyle = "#11221a";
    tCtx.fillRect(0, 0, W, H);

    for (let i = 0; i < 160; i++) {
      const x = Math.random() * W;
      const y = Math.random() * H;
      const rx = 28 + Math.random() * 85;
      const ry = 22 + Math.random() * 68;
      const rot = Math.random() * Math.PI;
      tCtx.save();
      tCtx.translate(x, y);
      tCtx.rotate(rot);
      tCtx.beginPath();
      tCtx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      tCtx.fillStyle = PALETTE[i % PALETTE.length];
      tCtx.globalAlpha = 0.45 + Math.random() * 0.35;
      tCtx.fill();
      tCtx.restore();
    }

    // Subtle organic speckles
    for (let i = 0; i < 240; i++) {
      tCtx.beginPath();
      tCtx.arc(Math.random() * W, Math.random() * H, 1 + Math.random() * 2.5, 0, Math.PI * 2);
      tCtx.fillStyle = i % 2 === 0 ? "rgba(52, 211, 153, 0.08)" : "rgba(0, 0, 0, 0.16)";
      tCtx.fill();
    }

    terrainPixels = tCtx.getImageData(0, 0, W, H).data;
  }

  function sampleTerrainRGB(x, y) {
    if (!terrainPixels) return [24, 52, 38];
    const px = Math.max(0, Math.min(W - 1, Math.round(x)));
    const py = Math.max(0, Math.min(H - 1, Math.round(y)));
    const idx = (py * W + px) * 4;
    return [terrainPixels[idx], terrainPixels[idx + 1], terrainPixels[idx + 2]];
  }

  // Optional Web Audio synth (never auto-plays; user-toggled)
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
      // Ignore audio errors on restricted environments
    }
  }

  // Game state
  let state = "ready"; // ready | playing | paused | gameover
  let round = 1;
  let score = 0;
  let best = Number(localStorage.getItem(BEST_KEY) || 0);
  let lastTime = 0;

  const player = {
    x: W / 2,
    y: H / 2,
    r: 15,
    speed: 235,
    camo: 100,
    alert: 0,
    moving: false
  };

  let fireflies = [];
  let seekers = [];
  let particles = [];

  // Input state (Pointer drag + Keyboard)
  const pointer = { active: false, x: W / 2, y: H / 2 };
  const keys = new Set();

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

      fireflies.push({
        x: fx,
        y: fy,
        phase: Math.random() * Math.PI * 2,
        r: 7
      });
    }

    seekers = [];
    const seekerCount = Math.min(2 + Math.floor((waveNum + 1) / 2), 6);
    for (let i = 0; i < seekerCount; i++) {
      const angle = (Math.PI * 2 * i) / seekerCount;
      const sx = W * (0.2 + 0.6 * ((i % 2 === 0) ? 0.25 : 0.75)) + (Math.random() - 0.5) * 140;
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
        spotting: false
      });
    }
  }

  function startNewGame() {
    generateTerrain();
    round = 1;
    score = 0;
    player.x = W / 2;
    player.y = H / 2;
    player.camo = 100;
    player.alert = 0;
    player.moving = false;
    particles = [];
    pointer.active = false;
    keys.clear();
    spawnWave(round);
    state = "playing";
    overlay.hidden = true;
    btnPause.textContent = "Pause";
    updateHUD();
  }

  function togglePause() {
    if (state === "playing") {
      state = "paused";
      overlayTitle.textContent = "Paused";
      overlayDesc.textContent = "Take a breather in the undergrowth. Resume whenever you're ready.";
      btnStart.textContent = "Resume";
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
    overlayDesc.textContent = `A Seeker caught you in Round ${round}. Final Score: ${score.toLocaleString()} (Best: ${best.toLocaleString()}).`;
    btnStart.textContent = "Play Again";
    overlay.hidden = false;
    updateHUD();
  }

  function updateHUD() {
    hudRound.textContent = String(round);
    hudScore.textContent = score.toLocaleString();
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

  function update(dt) {
    if (state !== "playing") return;

    // Movement vector from pointer drag or keyboard
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
      player.camo = Math.min(100, player.camo + 95 * dt);
    }

    // Collect fireflies
    for (let i = fireflies.length - 1; i >= 0; i--) {
      const f = fireflies[i];
      f.phase += dt * 4;
      if (Math.hypot(player.x - f.x, player.y - f.y) < player.r + f.r + 6) {
        fireflies.splice(i, 1);
        score += 100 * round;
        if (score > best) {
          best = score;
          localStorage.setItem(BEST_KEY, String(best));
        }
        playTone(620 + Math.random() * 180, 0.14, "sine", 0.07);
        for (let p = 0; p < 12; p++) {
          const ang = (Math.PI * 2 * p) / 12 + Math.random() * 0.3;
          const spd = 45 + Math.random() * 75;
          particles.push({
            x: f.x,
            y: f.y,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd,
            life: 0.45
          });
        }
      }
    }

    // Advance wave if all fireflies collected
    if (fireflies.length === 0) {
      round += 1;
      score += 250;
      playTone(880, 0.22, "triangle", 0.08);
      spawnWave(round);
    }

    // Update Seekers & Detection
    let anySpotting = false;
    for (const s of seekers) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.x < 40 || s.x > W - 40) s.vx *= -1;
      if (s.y < 40 || s.y > H - 40) s.vy *= -1;
      s.lookAngle += s.turnSpeed * dt;

      const inLight = isPointInCone(player.x, player.y, s);
      const exposed = player.moving || player.camo < 75;
      s.spotting = inLight && exposed;
      if (s.spotting) anySpotting = true;
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

    // Update particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }

    updateHUD();
  }

  function render() {
    ctx.drawImage(terrainCanvas, 0, 0);

    // Draw Seeker cones & bodies
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
        grad.addColorStop(0, "rgba(245, 196, 81, 0.30)");
        grad.addColorStop(1, "rgba(245, 196, 81, 0.02)");
      }
      ctx.fillStyle = grad;
      ctx.fill();

      // Seeker core
      ctx.beginPath();
      ctx.arc(s.x, s.y, 10, 0, Math.PI * 2);
      ctx.fillStyle = s.spotting ? "#f87171" : "#e2e8f0";
      ctx.fill();
      ctx.restore();
    }

    // Draw Fireflies
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
      ctx.fillStyle = "#ffe58f";
      ctx.fill();
      ctx.restore();
    }

    // Draw tether when dragging
    if (state === "playing" && pointer.active) {
      ctx.save();
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(player.x, player.y);
      ctx.lineTo(pointer.x, pointer.y);
      ctx.strokeStyle = "rgba(245, 196, 81, 0.45)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    // Draw Player (interpolates from vivid amber-coral to terrain color as Camo rises)
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
    ctx.strokeStyle = player.camo >= 75
      ? "rgba(52, 211, 153, 0.45)"
      : "rgba(245, 196, 81, 0.9)";
    ctx.stroke();
    ctx.restore();

    // Draw particles
    for (const p of particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life * 2);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = "#f5c451";
      ctx.fill();
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

  // Event Listeners
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

  const endPointer = () => {
    pointer.active = false;
  };
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);

  window.addEventListener("keydown", (e) => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) {
      if (document.activeElement === canvas || state === "playing") {
        e.preventDefault();
      }
    }
    if (e.code === "KeyP" || e.code === "Escape") {
      if (state === "playing" || state === "paused") togglePause();
      return;
    }
    keys.add(e.code);
  });

  window.addEventListener("keyup", (e) => {
    keys.delete(e.code);
  });

  // Initial draw
  generateTerrain();
  spawnWave(1);
  updateHUD();
  requestAnimationFrame(loop);
})();
