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
const clickSound   = document.getElementById("clickSound");
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

// which view is active? "breakdown" | "weekly" | "daily"
let currentView = "breakdown";

// edit modal state
let editMode = "add";          // "add" or "edit" (for the modal itself)
let editingIndex = null;       // index in usageData when editing

// breakdown edit mode (UI mode)
let isEditMode = false;

let segments = []; // for pie hit-testing

// ------------------------
// Helpers
// ------------------------
function totalUsage() {
  return usageData.reduce((s, item) => s + item.value, 0);
}

function playClickSound() {
  clickSound.currentTime = 0;
  clickSound.play().catch(() => {});
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
    const sliceAngle = (item.value / total) * Math.PI * 2;
    const endAngle   = startAngle + sliceAngle;
    const sliceRadius = index === highlightIndex ? radius + 8 : radius;

    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, sliceRadius, startAngle, endAngle);
    ctx.closePath();
    ctx.fillStyle = item.color;
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth   = 3;
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
  ctx.lineWidth   = 2;
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
  ctx.lineWidth   = 3;
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
  ctx.lineWidth   = 2;
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
    if (ctx.roundRect) {
      ctx.roundRect(x - barWidth / 2, y, barWidth, barHeight, 6);
    } else {
      ctx.rect(x - barWidth / 2, y, barWidth, barHeight);
    }
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
  if (currentView !== "breakdown") {
    isEditMode = false;
  }

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
  } else if (currentView === "weekly") {
    drawWeeklyTrends();
    clearLegend();
    const total = weeklyData.reduce((s, v) => s + v, 0);
    segmentTitle.textContent = "Weekly Trends";
    segmentValue.textContent =
      `Total weekly usage: ${total} L (example data for prototype).`;
  } else if (currentView === "daily") {
    drawDailyComparison();
    clearLegend();
    segmentTitle.textContent = "Daily Comparison";
    segmentValue.textContent =
      "Comparing today's water usage with yesterday and last week (example data).";
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
  if (angle < -Math.PI / 2) {
    angle += Math.PI * 2;
  }

  for (let i = 0; i < segments.length; i++) {
    const { startAngle, endAngle } = segments[i];
    if (angle >= startAngle && angle <= endAngle) {
      return i;
    }
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

  playClickSound();

  if (currentView === "breakdown") {
    const index = getClickedSegmentIndex(x, y);
    if (index === null) return;

    const total = totalUsage();
    const item  = usageData[index];
    const pct   = Math.round((item.value / total) * 100);

    segmentTitle.textContent = item.label;
    segmentValue.textContent = isEditMode
      ? `${pct}% of today's water usage (tap opened edit mode).`
      : `${pct}% of today's water usage (approx.).`;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawPieChart(index);   // highlight slice

    // Only open popup in EDIT MODE
    if (isEditMode) {
      openEditModal(index);
    }
  } else if (currentView === "weekly") {
    segmentTitle.textContent = "Weekly Trends";
    segmentValue.textContent =
      "Tap detected on weekly chart (more interactivity planned for beta version).";
  } else if (currentView === "daily") {
    segmentTitle.textContent = "Daily Comparison";
    segmentValue.textContent =
      "Tap detected on daily comparison chart (more interactivity planned for beta version).";
  }
});

// ------------------------
// Edit button -> toggle edit mode (for breakdown only)
// ------------------------
editButton.addEventListener("click", () => {
  playClickSound();
  if (currentView !== "breakdown") {
    // ignore or give little feedback
    segmentTitle.textContent = "Edit mode";
    segmentValue.textContent =
      "Editing is available only for the Water Usage Breakdown view.";
    return;
  }
  isEditMode = !isEditMode;
  renderView();
});

// "New" button -> Add new category (only in edit mode)
newButton.addEventListener("click", () => {
  if (currentView !== "breakdown") return;
  playClickSound();
  openAddModal();
});

// Cancel closes modal
cancelEdit.addEventListener("click", () => {
  closeEditModal();
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
    const color =
      extraColors[extraColorIndex % extraColors.length] || "#cccccc";
    extraColorIndex++;

    usageData.push({ label, value: rawVal, color });
  } else if (editMode === "edit" && editingIndex != null) {
    usageData[editingIndex].label = label;
    usageData[editingIndex].value = rawVal;
  }

  playClickSound();
  closeEditModal();
  renderView();
});

// Delete current slice (edit mode only)
deleteEdit.addEventListener("click", () => {
  if (editMode !== "edit" || editingIndex == null) return;

  const confirmed = confirm("Delete this category from the chart?");
  if (!confirmed) return;

  usageData.splice(editingIndex, 1);
  playClickSound();
  closeEditModal();
  renderView();
});

// Close modal when clicking backdrop
editModal.addEventListener("click", (e) => {
  if (e.target === editModal || e.target.classList.contains("modal-backdrop")) {
    closeEditModal();
  }
});

// ------------------------
// Dropdown behaviour
// ------------------------
dropdownLabel.addEventListener("click", (e) => {
  e.stopPropagation();
  dropdown.classList.toggle("open");
});

document.addEventListener("click", (e) => {
  if (!dropdown.contains(e.target)) {
    dropdown.classList.remove("open");
  }
});

dropdownMenu.addEventListener("click", (e) => {
  const item = e.target.closest(".dropdown-item");
  if (!item) return;

  document.querySelectorAll(".dropdown-item").forEach(el => {
    el.classList.remove("active");
  });
  item.classList.add("active");

  const view = item.getAttribute("data-view");
  currentView = view;
  currentViewEl.textContent = item.textContent.trim();

  dropdown.classList.remove("open");

  // When switching away from breakdown, leave edit mode
  if (currentView !== "breakdown") {
    isEditMode = false;
  }

  renderView();
});
