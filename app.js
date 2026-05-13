(function () {
  "use strict";

  const STORAGE_KEY = "stopwatch:v1";

  const displayEl = document.getElementById("display");
  const leftBtn = document.getElementById("leftBtn");
  const rightBtn = document.getElementById("rightBtn");
  const lapsEl = document.getElementById("laps");

  let state = loadState();
  let rafHandle = null;

  function defaultState() {
    return {
      status: "idle",
      startedAt: null,
      accumulated: 0,
      laps: [],
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return defaultState();
      const status = ["idle", "running", "paused"].includes(parsed.status)
        ? parsed.status
        : "idle";
      return {
        status,
        startedAt: typeof parsed.startedAt === "number" ? parsed.startedAt : null,
        accumulated: typeof parsed.accumulated === "number" ? parsed.accumulated : 0,
        laps: Array.isArray(parsed.laps) ? parsed.laps : [],
      };
    } catch (e) {
      console.warn("[stopwatch] load failed:", e);
      return defaultState();
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("[stopwatch] save failed:", e);
    }
  }

  function currentElapsed() {
    if (state.status === "running" && state.startedAt != null) {
      return state.accumulated + (Date.now() - state.startedAt);
    }
    return state.accumulated;
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function formatTime(ms) {
    if (!Number.isFinite(ms) || ms < 0) ms = 0;
    const totalCs = Math.floor(ms / 10);
    const cs = totalCs % 100;
    const totalSec = Math.floor(totalCs / 100);
    const sec = totalSec % 60;
    const totalMin = Math.floor(totalSec / 60);
    const min = totalMin % 60;
    const hr = Math.floor(totalMin / 60);
    if (hr > 0) {
      return pad2(hr) + ":" + pad2(min) + ":" + pad2(sec) + "." + pad2(cs);
    }
    return pad2(min) + ":" + pad2(sec) + "." + pad2(cs);
  }

  function renderDisplay() {
    displayEl.textContent = formatTime(currentElapsed());
  }

  function renderButtons() {
    if (state.status === "running") {
      leftBtn.textContent = "Lap";
      leftBtn.className = "btn btn-lap";
      leftBtn.disabled = false;
      rightBtn.textContent = "Stop";
      rightBtn.className = "btn btn-stop";
    } else if (state.status === "paused") {
      leftBtn.textContent = "Reset";
      leftBtn.className = "btn btn-lap";
      leftBtn.disabled = false;
      rightBtn.textContent = "Start";
      rightBtn.className = "btn btn-start";
    } else {
      leftBtn.textContent = "Lap";
      leftBtn.className = "btn btn-lap";
      leftBtn.disabled = true;
      rightBtn.textContent = "Start";
      rightBtn.className = "btn btn-start";
    }
  }

  function computeLapStats() {
    const laps = state.laps;
    if (laps.length < 3) return { fastestIndex: -1, slowestIndex: -1 };
    let minSplit = Infinity;
    let maxSplit = -Infinity;
    let fastestIndex = -1;
    let slowestIndex = -1;
    for (let i = 0; i < laps.length; i++) {
      const prev = i > 0 ? laps[i - 1].totalAtLap : 0;
      const split = laps[i].totalAtLap - prev;
      if (split < minSplit) {
        minSplit = split;
        fastestIndex = laps[i].index;
      }
      if (split > maxSplit) {
        maxSplit = split;
        slowestIndex = laps[i].index;
      }
    }
    return { fastestIndex, slowestIndex };
  }

  function renderLaps() {
    const laps = state.laps;
    const total = currentElapsed();
    const items = [];

    if (state.status !== "idle") {
      const lastTotal = laps.length > 0 ? laps[laps.length - 1].totalAtLap : 0;
      items.push({
        index: laps.length + 1,
        split: total - lastTotal,
        isCurrent: true,
      });
    }

    for (let i = laps.length - 1; i >= 0; i--) {
      const prev = i > 0 ? laps[i - 1].totalAtLap : 0;
      items.push({
        index: laps[i].index,
        split: laps[i].totalAtLap - prev,
        isCurrent: false,
      });
    }

    const { fastestIndex, slowestIndex } = computeLapStats();

    let html = "";
    for (const item of items) {
      const classes = ["lap"];
      if (!item.isCurrent && item.index === fastestIndex) classes.push("fastest");
      if (!item.isCurrent && item.index === slowestIndex) classes.push("slowest");
      html +=
        '<li class="' + classes.join(" ") + '">' +
        '<span class="lap-label">Lap ' + pad2(item.index) + "</span>" +
        '<span class="lap-split">' + formatTime(item.split) + "</span>" +
        "</li>";
    }
    lapsEl.innerHTML = html;
  }

  function render() {
    renderDisplay();
    renderButtons();
    renderLaps();
  }

  function loop() {
    if (state.status !== "running") {
      rafHandle = null;
      return;
    }
    const total = currentElapsed();
    displayEl.textContent = formatTime(total);
    const firstLap = lapsEl.firstElementChild;
    if (firstLap) {
      const splitEl = firstLap.querySelector(".lap-split");
      if (splitEl) {
        const lastTotal =
          state.laps.length > 0 ? state.laps[state.laps.length - 1].totalAtLap : 0;
        splitEl.textContent = formatTime(total - lastTotal);
      }
    }
    rafHandle = requestAnimationFrame(loop);
  }

  function startLoop() {
    if (rafHandle == null) {
      rafHandle = requestAnimationFrame(loop);
    }
  }

  function stopLoop() {
    if (rafHandle != null) {
      cancelAnimationFrame(rafHandle);
      rafHandle = null;
    }
  }

  function actionStartOrStop() {
    if (state.status === "running") {
      state.accumulated += Date.now() - state.startedAt;
      state.startedAt = null;
      state.status = "paused";
      saveState();
      stopLoop();
      render();
    } else {
      state.startedAt = Date.now();
      state.status = "running";
      saveState();
      render();
      startLoop();
    }
  }

  function actionLapOrReset() {
    if (state.status === "running") {
      const total = currentElapsed();
      state.laps.push({
        index: state.laps.length + 1,
        totalAtLap: total,
      });
      saveState();
      render();
    } else if (state.status === "paused") {
      state = defaultState();
      saveState();
      render();
    }
  }

  window.addEventListener("storage", (e) => {
    if (e.key !== STORAGE_KEY) return;
    stopLoop();
    state = loadState();
    render();
    if (state.status === "running") startLoop();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopLoop();
    } else {
      state = loadState();
      render();
      if (state.status === "running") startLoop();
    }
  });

  rightBtn.addEventListener("click", actionStartOrStop);
  leftBtn.addEventListener("click", actionLapOrReset);

  render();
  if (state.status === "running") startLoop();
})();
