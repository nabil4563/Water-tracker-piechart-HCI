// ------------------------
// Data models
// ------------------------

// Pie chart data: relative values (normalised to % for display)
const usageData = [
  { label: "Shower",          value: 40, color: "#6fb3ff" }, // soft blue
  { label: "Kitchen",         value: 25, color: "#7ee0c8" }, // soft teal
  { label: "Laundry",         value: 20, color: "#ffd27f" }, // soft yellow
  { label: "Outdoor / Other", value: 15, color: "#ff9f9a" }  // soft coral
];

// Extra colours for newly added categories
const extraColors = ["#b29bff", "#f78fb3", "#9be7ff", "#a3e5ff", "#ffc4e1"];
let extraColorIndex = 0;

// Weekly trends: litres / day (example data)
const weeklyData = [80, 60, 70, 90, 75, 65, 85];

// Daily comparison (example)
const dailyLabels = ["Today", "Yesterday", "Last Week"];
const dailyData   = [120, 100, 130];

// ------------------------
// Canvas & DOM references
// ------------------------
const canvas = document.getElementById("usageChart");
if (!canvas) throw new Error("Canvas #usageChart not found.");

const ctx = canvas.getContext("2d");
const centerX = canvas.width / 2;
const centerY = canvas.height / 2;
const radius  = 120;

const segmentTitle = document.getElementById("segmentTitle");
const segmentValue = document.getElementById("segmentValue");
const legendEl     = document.getElementById("legend");

const editButton   = document.getElementById("editButton");
const newButton    = document.getElementById("newButton");

const dropdown       = document.querySelector(".dropdown");
const dropdownLabel  = document.querySelector(".dropdown-label");
const dropdownMenu   = document.querySelector(".dropdown-menu");
const currentViewEl  = document.getElementById("currentView");

const editModal   = document.getElementById("editModal");
const modalTitle  = document.getElementById("modalTitle");
const newLabelEl  = document.getElementById("newLabel");
const newValueEl  = document.getElementById("newValue");
const deleteEdit  = document.getElementById("deleteEdit");
const cancelEdit  = document.getElementById("cancelEdit");
const saveEdit    = document.getElementById("saveEdit");

// ------------------------
// State
// ------------------------
let currentView = "breakdown"; // "breakdown" | "weekly" | "daily"
let isEditMode = false;

let editMode = "add";       // "add" | "edit" (modal mode)
let editingIndex = null;    // index in usageData when editing

let segments = [];          // for pie hit-testing

// ------------------------
// Helpers
// ------------------------
function totalUsage() {
  return usageData.reduce((s, item) => s + item.value, 0);
}

// ------------------------
// ADVANCED GAMIFIED AUDIO (Web Audio API)
// ------------------------
let audioCtx = null;

function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
}

function playTone({ freq = 440, type = "sine", duration = 0.12, volume = 0.18, curve = "exp" } = {}) {
  ensureAudio();
  const t0 = audioCtx.currentTime;

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);

  gain.gain.setValueAtTime(0.0001, t0);
  if (curve === "exp") {
    gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  } else {
    gain.gain.linearRampToValueAtTime(volume, t0 + 0.02);
    gain.gain.linearRampToValueAtTime(0.0001, t0 + duration);
  }

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.start(t0);
  osc.stop(t0 + duration + 0.01);
}

function playRewardChime() {
  const notes = [523, 659, 784]; // C5, E5, G5
  notes.forEach((f, i) => {
    setTimeout(() => {
      playTone({ freq: f, type: "sine", duration: 0.12, volume: 0.22, curve: "exp" });
    }, i * 90);
  });

  setTimeout(() => {
    playTone({ freq: 1200, type: "triangle", duration: 0.08, volume: 0.12, curve: "exp" });
  }, 280);
}

function playModeToggle() {
  playTone({ freq: 260, type: "square", duration: 0.10, volume: 0.12, curve: "linear" });
  setTimeout(() => {
    playTone({ freq: 360, type: "square", duration: 0.10, volume: 0.12, curve: "linear" });
  }, 90);
}

function playNeutralTap() {
  playTone({ freq: 420, type: "triangle", duration: 0.08, volume: 0.10, curve: "exp" });
}

function playOpenPopup() {
  playTone({ freq: 520, type: "sine", duration: 0.10, volume: 0.10, curve: "exp" });
}

function playDeleteCue() {
  playTone({ freq: 180, type: "sawtooth", duration: 0.10, volume: 0.10, curve: "linear" });
}

function playClickSound(type = "tap") {
  if (type === "mode")   return playModeToggle();
  if (type === "popup")  return playOpenPopup();
  if (type === "reward") return playRewardChime();
  if (type === "delete") return playDeleteCue();
  return playNeutralTap();
}

// Sonification: percent -> pitch
function playPercentTone(pct) {
  ensureAudio();

  // Map 0..100% => 300..1100Hz
  const freq = 300 + (Math.max(0, Math.min(100, pct)) / 100) * 800;
  const t0 = audioCtx.currentTime;

  const osc1 = audioCtx.createOscillator();
  const osc2 = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  const filter = audioCtx.createBiquadFilter();

  osc1.type = "triangle";
  osc2.type = "sine";
  osc1.frequency.setValueAtTime(freq, t0);
  osc2.frequency.setValueAtTime(freq * 2, t0); // harmonic

  filter.type = "bandpass";
  filter.frequency.setValueAtTime(freq, t0);
  filter.Q.value = 6;

  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);

  osc1.connect(filter);
  osc2.connect(filter);
  filter.connect(gain);
  gain.connect(audioCtx.destination);

  osc1.start(t0);
  osc2.start(t0);
  osc1.stop(t0 + 0.13);
  osc2.stop(t0 + 0.13);
}

// ------------------------
// Ambient engine (continuous)
// ------------------------
let ambient = {
  running: false,
  oscA: null,
  oscB: null,
  gain: null,
  filter: null,
  lfo: null,
  lfoGain: null,
};

function startAmbient() {
  ensureAudio();
  if (ambient.running) return;

  ambient.gain = audioCtx.createGain();
  ambient.gain.gain.value = 0.0;
  ambient.gain.connect(audioCtx.destination);

  ambient.filter = audioCtx.createBiquadFilter();
  ambient.filter.type = "lowpass";
  ambient.filter.frequency.value = 600;
  ambient.filter.Q.value = 0.7;
  ambient.filter.connect(ambient.gain);

  ambient.oscA = audioCtx.createOscillator();
  ambient.oscA.type = "sine";
  ambient.oscA.frequency.value = 110;

  ambient.oscB = audioCtx.createOscillator();
  ambient.oscB.type = "triangle";
  ambient.oscB.frequency.value = 165;

  ambient.lfo = audioCtx.createOscillator();
  ambient.lfo.type = "sine";
  ambient.lfo.frequency.value = 0.15;

  ambient.lfoGain = audioCtx.createGain();
  ambient.lfoGain.gain.value = 8;

  ambient.lfo.connect(ambient.lfoGain);
  ambient.lfoGain.connect(ambient.oscB.frequency);

  ambient.oscA.connect(ambient.filter);
  ambient.oscB.connect(ambient.filter);

  ambient.oscA.start();
  ambient.oscB.start();
  ambient.lfo.start();

  const t0 = audioCtx.currentTime;
  ambient.gain.gain.setValueAtTime(0.0001, t0);
  ambient.gain.gain.exponentialRampToValueAtTime(0.008, t0 + 0.6);


  ambient.running = true;
}

function setAmbientIntensity(intensity01) {
  if (!ambient.running) return;

  const t0 = audioCtx.currentTime;
  const x = Math.max(0, Math.min(1, intensity01));

  const targetGain = 0.02 + x * 0.03; // 0.02..0.05
  const targetCut  = 450  + x * 1100; // 450..1550 Hz
  const targetBase = 95   + x * 35;   // 95..130 Hz

  ambient.gain.gain.setTargetAtTime(targetGain, t0, 0.15);
  ambient.filter.frequency.setTargetAtTime(targetCut, t0, 0.2);
  ambient.oscA.frequency.setTargetAtTime(targetBase, t0, 0.2);
  ambient.oscB.frequency.setTargetAtTime(targetBase * 1.5, t0, 0.2);
}

function updateAmbientFromData() {
  const total = totalUsage();
  let intensity = (total - 80) / (250 - 80);
  intensity = Math.max(0, Math.min(1, intensity));
  setAmbientIntensity(intensity);
}

// ------------------------
// Legend (pie view)
// ------------------------
function buildLegendForBreakdown() {
  legendEl.innerHTML = "";
  const total = totalUsage();

  usageData.forEach(item => {
    const div = document.createElement("div");
    div.className = "legend-item";

    const dot = document.createElement("span");
    dot.className = "legend-color";
    dot.style.backgroundColor = item.color;

    const pct = Math.round((item.value / total) * 100);
    const label = document.createElement("span");
    label.textContent = `${item.label} (${pct}%)`;

    div.appendChild(dot);
    div.appendChild(label);
    legendEl.appendChild(div);
  });
}

function clearLegend() {
  legendEl.innerHTML = "";
}

// ------------------------
// Charts
// ------------------------
function drawPieChart(highlightIndex = null) {
  const total = totalUsage();
  let startAngle = -Math.PI / 2;
  segments = [];

  usageData.forEach((item, index) => {
    const sliceAngle  = (item.value / total) * Math.PI * 2;
    const endAngle    = startAngle + sliceAngle;
    const sliceRadius = index === highlightIndex ? radius + 8 : radius;

    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, sliceRadius, startAngle, endAngle);
    ctx.closePath();
    ctx.fillStyle = item.color;
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 3;
    ctx.stroke();

    segments.push({ startAngle, endAngle });
    startAngle = endAngle;
  });
}

function drawWeeklyTrends() {
  const padding = 40;
  const width   = canvas.width  - padding * 2;
  const height  = canvas.height - padding * 2;
  const originX = padding;
  const originY = canvas.height - padding;

  ctx.strokeStyle = "#c9cedd";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(originX, originY);
  ctx.lineTo(originX + width, originY);
  ctx.moveTo(originX, originY);
  ctx.lineTo(originX, originY - height);
  ctx.stroke();

  const maxVal = Math.max(...weeklyData) * 1.1;
  const stepX  = width / (weeklyData.length - 1);

  ctx.beginPath();
  weeklyData.forEach((val, i) => {
    const x = originX + stepX * i;
    const y = originY - (val / maxVal) * height;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });

  const gradient = ctx.createLinearGradient(originX, originY - height, originX + width, originY);
  gradient.addColorStop(0, "#6fb3ff");
  gradient.addColorStop(1, "#7ee0c8");
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#6fb3ff";
  weeklyData.forEach((val, i) => {
    const x = originX + stepX * i;
    const y = originY - (val / maxVal) * height;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });
}

function drawDailyComparison() {
  const padding = 50;
  const width   = canvas.width  - padding * 2;
  const height  = canvas.height - padding * 2;
  const originX = padding;
  const originY = canvas.height - padding;

  ctx.strokeStyle = "#c9cedd";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(originX, originY);
  ctx.lineTo(originX + width, originY);
  ctx.moveTo(originX, originY);
  ctx.lineTo(originX, originY - height);
  ctx.stroke();

  const maxVal = Math.max(...dailyData) * 1.1;
  const barWidth = width / (dailyData.length * 1.8);

  dailyData.forEach((val, i) => {
    const x = originX + (i + 0.5) * (width / dailyData.length);
    const barHeight = (val / maxVal) * height;
    const y = originY - barHeight;

    const colors = ["#6fb3ff", "#ffd27f", "#ff9f9a"];
    ctx.fillStyle = colors[i % colors.length];

    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x - barWidth / 2, y, barWidth, barHeight, 6);
    else ctx.rect(x - barWidth / 2, y, barWidth, barHeight);
    ctx.fill();

    ctx.fillStyle = "#555b67";
    ctx.font = "11px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(dailyLabels[i], x, originY + 14);
  });
}

// ------------------------
// UI helpers
// ------------------------
function updateEditUI() {
  if (currentView !== "breakdown") isEditMode = false;

  if (currentView === "breakdown") {
    editButton.textContent = isEditMode ? "Done" : "Edit";
    newButton.classList.toggle("hidden", !isEditMode);
  } else {
    editButton.textContent = "Edit";
    newButton.classList.add("hidden");
  }
}

function renderView() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (currentView === "breakdown") {
    drawPieChart();
    buildLegendForBreakdown();
    segmentTitle.textContent = "Total Usage";
    segmentValue.textContent = isEditMode
      ? "Tap a section to edit or delete it, or use New to add a category."
      : "Tap a section to view the percentage breakdown.";

    updateAmbientFromData();
  } else if (currentView === "weekly") {
    drawWeeklyTrends();
    clearLegend();
    const total = weeklyData.reduce((s, v) => s + v, 0);
    segmentTitle.textContent = "Weekly Trends";
    segmentValue.textContent = `Total weekly usage: ${total} L (example data for prototype).`;
  } else if (currentView === "daily") {
    drawDailyComparison();
    clearLegend();
    segmentTitle.textContent = "Daily Comparison";
    segmentValue.textContent = "Comparing today's water usage with yesterday and last week (example data).";
  }

  updateEditUI();
}

// ------------------------
// Pie hit-testing
// ------------------------
function getClickedSegmentIndex(x, y) {
  const dx = x - centerX;
  const dy = y - centerY;
  const distance = Math.sqrt(dx * dx + dy * dy);
  if (distance > radius + 15) return null;

  let angle = Math.atan2(dy, dx);
  if (angle < -Math.PI / 2) angle += Math.PI * 2;

  for (let i = 0; i < segments.length; i++) {
    const { startAngle, endAngle } = segments[i];
    if (angle >= startAngle && angle <= endAngle) return i;
  }
  return null;
}

// ------------------------
// Modal helpers
// ------------------------
function openAddModal() {
  editMode = "add";
  editingIndex = null;

  modalTitle.textContent = "Add usage category";
  saveEdit.textContent = "Add";
  deleteEdit.style.display = "none";

  newLabelEl.value = "";
  newValueEl.value = "";
  editModal.classList.remove("hidden");
  newLabelEl.focus();
}

function openEditModal(index) {
  editMode = "edit";
  editingIndex = index;

  modalTitle.textContent = "Edit usage category";
  saveEdit.textContent = "Save";
  deleteEdit.style.display = "inline-block";

  const item = usageData[index];
  newLabelEl.value = item.label;
  newValueEl.value = item.value;
  editModal.classList.remove("hidden");
  newLabelEl.focus();
}

function closeEditModal() {
  editModal.classList.add("hidden");
}

// ------------------------
// Events
// ------------------------
canvas.addEventListener("click", (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  if (currentView === "breakdown") {
    const index = getClickedSegmentIndex(x, y);
    if (index === null) return;

    const total = totalUsage();
    const item  = usageData[index];
    const pct   = Math.round((item.value / total) * 100);

    // audio
    if (!isEditMode) playPercentTone(pct);
    else playClickSound("popup");

    segmentTitle.textContent = item.label;
    segmentValue.textContent = !isEditMode
      ? `${pct}% of today's water usage (approx.).`
      : `Editing mode: ${pct}% of today's water usage.`;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawPieChart(index);

    if (isEditMode) openEditModal(index);
    return;
  }

  // other views
  playClickSound("tap");
  if (currentView === "weekly") {
    segmentTitle.textContent = "Weekly Trends";
    segmentValue.textContent = "Tap detected on weekly chart (more interactivity planned for beta version).";
  } else if (currentView === "daily") {
    segmentTitle.textContent = "Daily Comparison";
    segmentValue.textContent = "Tap detected on daily comparison chart (more interactivity planned for beta version).";
  }
});

editButton.addEventListener("click", () => {
  playClickSound("mode");

  if (currentView !== "breakdown") {
    segmentTitle.textContent = "Edit mode";
    segmentValue.textContent = "Editing is available only for the Water Usage Breakdown view.";
    return;
  }

  isEditMode = !isEditMode;
  renderView();
});

newButton.addEventListener("click", () => {
  if (currentView !== "breakdown") return;
  playClickSound("popup");
  openAddModal();
});

cancelEdit.addEventListener("click", () => {
  playClickSound("tap");
  closeEditModal();
});

// Close modal when clicking backdrop or outside content
editModal.addEventListener("click", (e) => {
  if (e.target === editModal || e.target.classList.contains("modal-backdrop")) {
    playClickSound("tap");
    closeEditModal();
  }
});

saveEdit.addEventListener("click", () => {
  const label = newLabelEl.value.trim();
  const rawVal = Number(newValueEl.value);

  if (!label || !Number.isFinite(rawVal) || rawVal <= 0) {
    alert("Please enter a label and a positive number for estimated usage.");
    return;
  }

  if (editMode === "add") {
    const color = extraColors[extraColorIndex % extraColors.length] || "#cccccc";
    extraColorIndex++;
    usageData.push({ label, value: rawVal, color });
  } else if (editMode === "edit" && editingIndex != null) {
    usageData[editingIndex].label = label;
    usageData[editingIndex].value = rawVal;
  }

  playClickSound("reward");
  closeEditModal();
  renderView();
});

deleteEdit.addEventListener("click", () => {
  if (editMode !== "edit" || editingIndex == null) return;

  const confirmed = confirm("Delete this category from the chart?");
  if (!confirmed) return;

  usageData.splice(editingIndex, 1);
  playClickSound("delete");
  closeEditModal();
  renderView();
});

// Dropdown behaviour
dropdownLabel.addEventListener("click", (e) => {
  e.stopPropagation();
  dropdown.classList.toggle("open");
});

document.addEventListener("click", (e) => {
  if (!dropdown.contains(e.target)) dropdown.classList.remove("open");
});

dropdownMenu.addEventListener("click", (e) => {
  const item = e.target.closest(".dropdown-item");
  if (!item) return;

  document.querySelectorAll(".dropdown-item").forEach(el => el.classList.remove("active"));
  item.classList.add("active");

  const view = item.getAttribute("data-view");
  currentView = view;
  currentViewEl.textContent = item.textContent.trim();
  dropdown.classList.remove("open");

  if (currentView !== "breakdown") isEditMode = false;

  // navigation cue
  if (view === "breakdown") playTone({ freq: 520, type: "sine", duration: 0.08, volume: 0.10 });
  if (view === "weekly")    playTone({ freq: 660, type: "triangle", duration: 0.08, volume: 0.10 });
  if (view === "daily")     playTone({ freq: 440, type: "square", duration: 0.08, volume: 0.10 });

  renderView();
});

// Start ambient after first user gesture (ONLY ONCE)
document.addEventListener("pointerdown", () => {
  startAmbient();
  updateAmbientFromData();
}, { once: true });

// ------------------------
// Init
// ------------------------
renderView();
