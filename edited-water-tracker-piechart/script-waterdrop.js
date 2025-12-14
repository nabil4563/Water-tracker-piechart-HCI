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

let editMode = "add";      // "add" or "edit" (for the modal itself)
let editingIndex = null;   // index in usageData when editing

let segments = []; // for pie hit-testing

// ------------------------
// Helpers
// ------------------------
function totalUsage() {
  return usageData.reduce((s, item) => s + item.value, 0);
}

// ------------------------
// ADVANCED GAMIFIED AUDIO (Web Audio API)
// (No humming ambience — replaced with water-drop micro sonification)
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

// Base tone helper (kept from your current code)
function playTone({ freq = 440, type = "sine", duration = 0.12, volume = 0.18, curve = "exp" } = {}) {
  ensureAudio();
  const t0 = audioCtx.currentTime;

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);

  // envelope
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

// ------------------------
// Water-drop sound design (replaces "hum")
// ------------------------

// A “droplet” is a fast pitch drop + short filtered click.
// This feels like water without loading MP3 files.
function playWaterDrop({ intensity = 0.5 } = {}) {
  ensureAudio();
  const t0 = audioCtx.currentTime;

  // intensity 0..1
  const x = Math.max(0, Math.min(1, intensity));

  // Droplet pitch range (higher = lighter droplet)
  const startFreq = 1100 + x * 700;   // 1100..1800
  const endFreq   = 250  + x * 120;   // 250..370

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  const filter = audioCtx.createBiquadFilter();

  osc.type = "triangle";
  osc.frequency.setValueAtTime(startFreq, t0);
  osc.frequency.exponentialRampToValueAtTime(endFreq, t0 + 0.06);

  filter.type = "bandpass";
  filter.frequency.setValueAtTime(900 + x * 600, t0);
  filter.Q.value = 10;

  // Very short envelope
  const vol = 0.05 + x * 0.06; // 0.05..0.11
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.10);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(audioCtx.destination);

  osc.start(t0);
  osc.stop(t0 + 0.12);
}

// Slightly different water cue for opening popups (gentler, “bubble”)
function playWaterBubble() {
  playTone({ freq: 620, type: "sine", duration: 0.08, volume: 0.08, curve: "exp" });
  setTimeout(() => playTone({ freq: 780, type: "triangle", duration: 0.06, volume: 0.06, curve: "exp" }), 60);
}

// Delete cue as “drain” (soft downward)
function playWaterDrain() {
  ensureAudio();
  const t0 = audioCtx.currentTime;

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "sawtooth";

  osc.frequency.setValueAtTime(420, t0);
  osc.frequency.exponentialRampToValueAtTime(140, t0 + 0.18);

  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.10, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.20);

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.start(t0);
  osc.stop(t0 + 0.22);
}

// Reward chime (kept, because it’s “advanced” + clear feedback)
function playRewardChime() {
  const notes = [523, 659, 784]; // C5, E5, G5
  notes.forEach((f, i) => {
    setTimeout(() => {
      playTone({ freq: f, type: "sine", duration: 0.12, volume: 0.18, curve: "exp" });
    }, i * 90);
  });

  setTimeout(() => {
    playTone({ freq: 1200, type: "triangle", duration: 0.08, volume: 0.10, curve: "exp" });
  }, 280);
}

// Mode toggle cue (kept)
function playModeToggle() {
  playTone({ freq: 260, type: "square", duration: 0.10, volume: 0.10, curve: "linear" });
  setTimeout(() => {
    playTone({ freq: 360, type: "square", duration: 0.10, volume: 0.10, curve: "linear" });
  }, 90);
}

// Sonification: percent -> droplet intensity + a light pitch cue
function playPercentWater(pct) {
  // pct 0..100
  const p = Math.max(0, Math.min(100, pct)) / 100;
  // Droplet intensity tracks % (more usage = “heavier” droplet)
  playWaterDrop({ intensity: p });

  // Optional micro “ring” that gives a clearer mapping (still subtle)
  // This helps lecturers see there is data mapping.
  const ringFreq = 380 + p * 520; // 380..900
  setTimeout(() => {
    playTone({ freq: ringFreq, type: "sine", duration: 0.05, volume: 0.05, curve: "exp" });
  }, 40);
}

// Single router for UI sounds (swap hum -> water cues)
function playClickSound(type = "tap", intensity = 0.5) {
  if (type === "mode")   return playModeToggle();
  if (type === "popup")  return playWaterBubble();
  if (type === "reward") return playRewardChime();
  if (type === "delete") return playWaterDrain();
  // default tap = droplet
  return playWaterDrop({ intensity });
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
// Draw PIE chart (breakdown)
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

// ------------------------
// Draw WEEKLY TRENDS line chart
// ------------------------
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

// ------------------------
// Draw DAILY COMPARISON bar chart
// ------------------------
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
// Edit-mode UI helpers
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

// ------------------------
// View rendering
// ------------------------
function renderView() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (currentView === "breakdown") {
    drawPieChart();
    buildLegendForBreakdown();
    segmentTitle.textContent = "Total Usage";
    segmentValue.textContent = isEditMode
      ? "Tap a section to edit or delete it, or use New to add a category."
      : "Tap a section to view the percentage breakdown.";
  }

  if (currentView === "weekly") {
    drawWeeklyTrends();
    clearLegend();
    const total = weeklyData.reduce((s, v) => s + v, 0);
    segmentTitle.textContent = "Weekly Trends";
    segmentValue.textContent = `Total weekly usage: ${total} L (example data for prototype).`;
  }

  if (currentView === "daily") {
    drawDailyComparison();
    clearLegend();
    segmentTitle.textContent = "Daily Comparison";
    segmentValue.textContent = "Comparing today's water usage with yesterday and last week (example data).";
  }

  updateEditUI();
}

renderView();

// ------------------------
// Pie hit-testing (breakdown)
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
// Modal helpers: Add vs Edit (for the popup)
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
// Canvas click
// ------------------------
canvas.addEventListener("click", (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  // Breakdown view
  if (currentView === "breakdown") {
    const index = getClickedSegmentIndex(x, y);
    if (index === null) return;

    const total = totalUsage();
    const item  = usageData[index];
    const pct   = Math.round((item.value / total) * 100);

    // Audio logic:
    // - View mode: sonification based on % -> water mapping
    // - Edit mode: popup cue
    if (!isEditMode) {
      playPercentWater(pct);
    } else {
      playClickSound("popup");
    }

    segmentTitle.textContent = item.label;
    segmentValue.textContent = !isEditMode
      ? `${pct}% of today's water usage (approx.).`
      : `Editing mode: ${pct}% of today's water usage.`;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawPieChart(index);

    if (isEditMode) openEditModal(index);
    return;
  }

  // Other views: droplet tap + info
  playClickSound("tap", 0.35);

  if (currentView === "weekly") {
    segmentTitle.textContent = "Weekly Trends";
    segmentValue.textContent = "Tap detected on weekly chart (more interactivity planned for beta version).";
  }

  if (currentView === "daily") {
    segmentTitle.textContent = "Daily Comparison";
    segmentValue.textContent = "Tap detected on daily comparison chart (more interactivity planned for beta version).";
  }
});

// ------------------------
// Edit button -> toggle edit mode (breakdown only)
// ------------------------
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

// "New" button -> Add new category (only in edit mode)
newButton.addEventListener("click", () => {
  if (currentView !== "breakdown") return;
  playClickSound("popup");
  openAddModal();
});

// Cancel closes modal
cancelEdit.addEventListener("click", () => {
  playClickSound("tap", 0.25);
  closeEditModal();
});

// Close modal when clicking backdrop
editModal.addEventListener("click", (e) => {
  if (e.target === editModal || e.target.classList.contains("modal-backdrop")) {
    playClickSound("tap", 0.20);
    closeEditModal();
  }
});

// Save (Add or Edit)
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

// Delete current slice
deleteEdit.addEventListener("click", () => {
  if (editMode !== "edit" || editingIndex == null) return;

  const confirmed = confirm("Delete this category from the chart?");
  if (!confirmed) return;

  usageData.splice(editingIndex, 1);
  playClickSound("delete");
  closeEditModal();
  renderView();
});

// ------------------------
// Dropdown behaviour
// ------------------------
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

  // switching away from breakdown leaves edit mode
  if (currentView !== "breakdown") isEditMode = false;

  // navigation cue as water tap (subtle)
  playClickSound("tap", view === "breakdown" ? 0.35 : view === "weekly" ? 0.45 : 0.30);

  renderView();
});

// Start audio on first user gesture (ONLY ONCE)
// (No ambient loop; just unlocks audio for droplet sounds)
document.addEventListener("pointerdown", () => {
  ensureAudio();
}, { once: true });
