(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: false });

  const scoreEl = document.getElementById("score");
  const speedEl = document.getElementById("speed");
  const overlayEl = document.getElementById("overlay");
  const deviceSelectorEl = document.getElementById("device-selector");
  const onScreenControlsEl = document.getElementById("on-screen-controls");

  const GRID_COLS = 30;
  const GRID_ROWS = 30;
  const CELL = 20;

  const SPEED_UP_EVERY_POINTS = 5;
  const BASE_TICK_MS = 145;
  const TICK_STEP_MS = 10;
  const MIN_TICK_MS = 55;

  const COLOR_BG = "#05050a";
  const COLOR_GRID = "rgba(0, 229, 255, 0.08)";
  const COLOR_GRID_ALT = "rgba(255, 43, 214, 0.05)";
  const COLOR_SNAKE = "#00ff66";
  const COLOR_FOOD = "#a64dff";

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  let snake = [];
  let dir = { x: 1, y: 0 };
  let nextDir = { x: 1, y: 0 };
  let food = { x: 0, y: 0 };
  let score = 0;
  let alive = true;
  let started = false;
  let paused = false;

  let rafLastTs = 0;
  let accMs = 0;
  let touchStart = null;

  // Audio Context and Sounds
  let audioCtx = null;

  function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }

  function playTone(freq, type, duration, volume) {
    if (!audioCtx) return;
    if (audioCtx.state === "suspended") audioCtx.resume();

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

    gain.gain.setValueAtTime(volume, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  }

  function playEatSound() {
    playTone(523.25, "sine", 0.1, 0.15); // C5
    setTimeout(() => playTone(783.99, "sine", 0.15, 0.1), 50); // G5
  }

  function playDieSound() {
    playTone(220, "sawtooth", 0.4, 0.15); // A3
    playTone(110, "square", 0.6, 0.1); // A2
  }

  function tickMsForScore(currentScore) {
    const level = Math.floor(currentScore / SPEED_UP_EVERY_POINTS);
    return Math.max(MIN_TICK_MS, BASE_TICK_MS - level * TICK_STEP_MS);
  }

  function speedLevelForScore(currentScore) {
    return Math.floor(currentScore / SPEED_UP_EVERY_POINTS) + 1;
  }

  function updateHud() {
    scoreEl.textContent = String(score);
    speedEl.textContent = String(speedLevelForScore(score));
  }

  function overlay(html) {
    overlayEl.innerHTML = html;
    overlayEl.dataset.visible = "true";
  }

  function hideOverlay() {
    overlayEl.dataset.visible = "false";
  }

  function sameCell(a, b) {
    return a.x === b.x && a.y === b.y;
  }

  function randomCell() {
    return {
      x: Math.floor(Math.random() * GRID_COLS),
      y: Math.floor(Math.random() * GRID_ROWS),
    };
  }

  function spawnFood() {
    let candidate = randomCell();
    let guard = 0;
    while (snake.some((s) => sameCell(s, candidate)) && guard++ < 10_000) {
      candidate = randomCell();
    }
    return candidate;
  }

  function resetGame() {
    const startX = Math.floor(GRID_COLS / 2);
    const startY = Math.floor(GRID_ROWS / 2);

    score = 0;
    alive = true;
    started = false;
    paused = false;
    dir = { x: 1, y: 0 };
    nextDir = { x: 1, y: 0 };
    accMs = 0;

    snake = Array.from({ length: 4 }, (_, i) => ({ x: startX - i, y: startY }));
    food = spawnFood();

    updateHud();
    overlay(
      `<div><div class="overlay__title">NEON SNAKE</div>
      <div>Press <span class="kbd">Space</span> to start.</div>
      <div>Steer with <span class="kbd">↑</span><span class="kbd">↓</span><span class="kbd">←</span><span class="kbd">→</span> or <span class="kbd">W</span><span class="kbd">A</span><span class="kbd">S</span><span class="kbd">D</span>.</div>
      <div>Every 5 points, speed increases.</div></div>`,
    );
  }

  function startIfNeeded() {
    if (started) return;
    started = true;
    initAudio();
    hideOverlay();
  }

  function togglePause() {
    if (!started || !alive) return;
    paused = !paused;
    if (paused) {
      overlay(
        `<div><div class="overlay__title">PAUSED</div>
        <div>Press <span class="kbd">Space</span> to resume.</div></div>`,
      );
    } else {
      hideOverlay();
    }
  }

  function die() {
    alive = false;
    playDieSound();
    overlay(
      `<div><div class="overlay__title">GAME OVER</div>
      <div>Score: <span class="kbd">${score}</span></div>
      <div>Press <span class="kbd">R</span> to restart.</div></div>`,
    );
  }

  function setNextDirVector(x, y) {
    if (!alive) return;

    startIfNeeded();

    const isReverse = dir.x === -x && dir.y === -y;
    if (isReverse) return;
    nextDir = { x, y };
  }

  function step() {
    dir = nextDir;
    const head = snake[0];
    const nextHead = { x: head.x + dir.x, y: head.y + dir.y };

    if (
      nextHead.x < 0 ||
      nextHead.x >= GRID_COLS ||
      nextHead.y < 0 ||
      nextHead.y >= GRID_ROWS
    ) {
      die();
      return;
    }

    const willEat = sameCell(nextHead, food);
    const bodyToCheck = willEat ? snake : snake.slice(0, -1);
    if (bodyToCheck.some((s) => sameCell(s, nextHead))) {
      die();
      return;
    }

    snake.unshift(nextHead);

    if (willEat) {
      score += 1;
      playEatSound();
      updateHud();
      food = spawnFood();
    } else {
      snake.pop();
    }
  }

  function drawBackground(ts) {
    const w = GRID_COLS * CELL;
    const h = GRID_ROWS * CELL;

    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#04040a");
    g.addColorStop(0.55, "#070017");
    g.addColorStop(1, COLOR_BG);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    const scan = (Math.sin(ts * 0.002) + 1) / 2;
    const majorLineBoost = 0.06 + 0.04 * scan;

    ctx.save();
    ctx.lineWidth = 1;
    ctx.translate(0.5, 0.5);

    for (let x = 0; x <= GRID_COLS; x++) {
      const isMajor = x % 5 === 0;
      ctx.strokeStyle = isMajor ? `rgba(0, 229, 255, ${majorLineBoost})` : COLOR_GRID;
      ctx.beginPath();
      ctx.moveTo(x * CELL, 0);
      ctx.lineTo(x * CELL, h);
      ctx.stroke();
    }

    for (let y = 0; y <= GRID_ROWS; y++) {
      const isMajor = y % 5 === 0;
      ctx.strokeStyle = isMajor ? `rgba(255, 43, 214, ${majorLineBoost * 0.9})` : COLOR_GRID_ALT;
      ctx.beginPath();
      ctx.moveTo(0, y * CELL);
      ctx.lineTo(w, y * CELL);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawFood(ts) {
    const px = food.x * CELL;
    const py = food.y * CELL;

    const pulse = 0.65 + 0.35 * Math.sin(ts * 0.012 + food.x * 0.7 + food.y * 0.4);
    const jitter = (Math.random() - 0.5) * 0.28;
    const intensity = clamp(pulse + jitter, 0.25, 1);

    const coreAlpha = 0.85 * intensity;
    const glowAlpha = 0.9 * intensity;

    ctx.save();
    ctx.translate(px, py);
    ctx.globalCompositeOperation = "lighter";

    ctx.shadowColor = `rgba(166, 77, 255, ${glowAlpha})`;
    ctx.shadowBlur = 18 * intensity;
    ctx.fillStyle = `rgba(166, 77, 255, ${coreAlpha})`;

    const p = 4;
    const cx = Math.floor(CELL / 2);
    const cy = Math.floor(CELL / 2);

    ctx.fillRect(cx - p / 2, cy - p / 2, p, p);

    if (Math.random() < 0.75) ctx.fillRect(cx - p * 1.5, cy - p / 2, p, p);
    if (Math.random() < 0.75) ctx.fillRect(cx + p * 0.5, cy - p / 2, p, p);
    if (Math.random() < 0.6) ctx.fillRect(cx - p / 2, cy - p * 1.5, p, p);
    if (Math.random() < 0.6) ctx.fillRect(cx - p / 2, cy + p * 0.5, p, p);

    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = `rgba(233, 210, 255, ${0.18 * intensity})`;
    ctx.strokeRect(2.5, 2.5, CELL - 5, CELL - 5);

    ctx.restore();
  }

  function drawSnake(ts) {
    const glowPulse = 0.82 + 0.18 * Math.sin(ts * 0.01);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = snake.length - 1; i >= 0; i--) {
      const s = snake[i];
      const px = s.x * CELL;
      const py = s.y * CELL;
      const isHead = i === 0;

      const depth = 1 - i / Math.max(1, snake.length - 1);
      const glow = (isHead ? 1 : 0.55 + 0.45 * depth) * glowPulse;

      ctx.shadowColor = `rgba(0, 255, 102, ${0.95 * glow})`;
      ctx.shadowBlur = (isHead ? 24 : 16) * glow;
      ctx.fillStyle = `rgba(0, 255, 102, ${0.55 + 0.35 * depth})`;
      ctx.fillRect(px + 2, py + 2, CELL - 4, CELL - 4);

      ctx.shadowBlur = 0;
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = `rgba(230, 255, 244, ${isHead ? 0.55 : 0.2 + 0.2 * depth})`;
      ctx.strokeRect(px + 2.5, py + 2.5, CELL - 5, CELL - 5);
      ctx.globalCompositeOperation = "lighter";
    }
    ctx.restore();
  }

  function render(ts) {
    drawBackground(ts);
    drawFood(ts);
    drawSnake(ts);
  }

  function frame(ts) {
    if (!rafLastTs) rafLastTs = ts;
    const dt = clamp(ts - rafLastTs, 0, 80);
    rafLastTs = ts;

    if (started && alive && !paused) {
      accMs += dt;
      let steps = 0;
      while (steps++ < 8) {
        const stepMs = tickMsForScore(score);
        if (accMs < stepMs) break;
        step();
        accMs -= stepMs;
        if (!alive) break;
      }
      accMs = Math.min(accMs, tickMsForScore(score));
    }

    render(ts);
    requestAnimationFrame(frame);
  }

  window.addEventListener("keydown", (e) => {
    const k = e.key;

    if (k === " " || k === "Spacebar") {
      e.preventDefault();
      if (!alive) return;
      if (!started) return startIfNeeded();
      initAudio();
      return togglePause();
    }

    if (k === "r" || k === "R") {
      e.preventDefault();
      resetGame();
      return;
    }

    if (k === "ArrowUp" || k === "w" || k === "W") {
      e.preventDefault();
      return setNextDirVector(0, -1);
    }
    if (k === "ArrowDown" || k === "s" || k === "S") {
      e.preventDefault();
      return setNextDirVector(0, 1);
    }
    if (k === "ArrowLeft" || k === "a" || k === "A") {
      e.preventDefault();
      return setNextDirVector(-1, 0);
    }
    if (k === "ArrowRight" || k === "d" || k === "D") {
      e.preventDefault();
      return setNextDirVector(1, 0);
    }
  });

  canvas.addEventListener(
    "touchstart",
    (e) => {
      const t = e.changedTouches[0];
      touchStart = { x: t.clientX, y: t.clientY };
    },
    { passive: true },
  );

  canvas.addEventListener(
    "touchend",
    (e) => {
      if (!touchStart) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - touchStart.x;
      const dy = t.clientY - touchStart.y;
      touchStart = null;

      if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return;

      if (Math.abs(dx) > Math.abs(dy)) {
        setNextDirVector(dx > 0 ? 1 : -1, 0);
      } else {
        setNextDirVector(0, dy > 0 ? 1 : -1);
      }
    },
    { passive: true },
  );

  // Device Selection & Virtual Controls
  document.querySelectorAll(".device-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const device = btn.dataset.device;
      deviceSelectorEl.dataset.visible = "false";

      if (device === "phone" || device === "tab") {
        onScreenControlsEl.dataset.visible = "true";
      }

      // Small delay to ensure AudioContext can be initialized on first click
      setTimeout(() => {
        initAudio();
        resetGame();
      }, 100);
    });
  });

  const bindBtn = (id, fn) => {
    const el = document.getElementById(id);
    if (!el) return;
    ["touchstart", "mousedown"].forEach((type) => {
      el.addEventListener(type, (e) => {
        e.preventDefault();
        fn();
      });
    });
  };

  bindBtn("btn-up", () => setNextDirVector(0, -1));
  bindBtn("btn-down", () => setNextDirVector(0, 1));
  bindBtn("btn-left", () => setNextDirVector(-1, 0));
  bindBtn("btn-right", () => setNextDirVector(1, 0));
  bindBtn("btn-space", () => {
    if (!alive) return;
    if (!started) return startIfNeeded();
    initAudio();
    togglePause();
  });
  bindBtn("btn-r", () => resetGame());

  // Wait for device selection instead of starting immediately
  requestAnimationFrame(frame);
})();
