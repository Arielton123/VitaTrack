const STORAGE_KEY = "vitatrack_v2";

function dateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function dateFromKey(key) {
  return new Date(`${key}T12:00:00`);
}

function formatDate(key, options = { day: "2-digit", month: "long", year: "numeric" }) {
  return new Intl.DateTimeFormat("pt-BR", options).format(dateFromKey(key));
}

function defaultDay() {
  return {
    water: 0,
    sleep: 0,
    sleepQuality: 0,
    activity: 0,
    activityType: "Caminhada",
    intensity: "Moderada",
    mood: 3,
    energy: 3,
    notes: "",
    habitStatus: {}
  };
}

function defaultState() {
  return {
    profile: { name: "Visitante" },
    goals: { water: 2, sleep: 8, activity: 30 },
    habits: [
      { id: "h1", name: "Beber água", category: "Hidratação" },
      { id: "h2", name: "Cuidar do sono", category: "Sono" },
      { id: "h3", name: "Movimentar-se", category: "Movimento" }
    ],
    days: {},
    theme: "dark"
  };
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    const base = defaultState();
    if (!saved) return base;

    return {
      ...base,
      ...saved,
      profile: { ...base.profile, ...(saved.profile || {}) },
      goals: { ...base.goals, ...(saved.goals || {}) },
      habits: Array.isArray(saved.habits) ? saved.habits : base.habits,
      days: saved.days && typeof saved.days === "object" ? saved.days : {},
      theme: saved.theme === "light" ? "light" : "dark"
    };
  } catch {
    return defaultState();
  }
}

let state = loadState();
let selectedHistoryDate = dateKey();

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getDay(key = dateKey()) {
  if (!state.days[key]) state.days[key] = defaultDay();
  state.days[key].habitStatus ||= {};
  return state.days[key];
}

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function goalProgress(value, goal) {
  return goal > 0 ? clamp(Number(value || 0) / goal) : 0;
}

function sleepProgress(hours) {
  const goal = Number(state.goals.sleep) || 8;
  if (!hours) return 0;
  return clamp(1 - Math.abs(Number(hours) - goal) / Math.max(goal, 1));
}

function habitProgress(record) {
  if (!state.habits.length) return 1;
  const done = state.habits.filter(h => record.habitStatus?.[h.id]).length;
  return done / state.habits.length;
}

function dailyScore(record) {
  const water = goalProgress(record.water, state.goals.water);
  const sleep = sleepProgress(record.sleep);
  const activity = goalProgress(record.activity, state.goals.activity);
  const habits = habitProgress(record);
  return Math.round((water + sleep + activity + habits) * 25);
}

function getStreak() {
  let streak = 0;
  const cursor = new Date();

  while (true) {
    const key = dateKey(cursor);
    const record = state.days[key];
    if (!record || dailyScore(record) < 70) break;
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

function getRecords() {
  return Object.entries(state.days)
    .filter(([, record]) => record && typeof record === "object")
    .sort(([a], [b]) => a.localeCompare(b));
}

function lastDays(count = 7) {
  const result = [];
  const today = new Date();

  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    result.push(dateKey(d));
  }

  return result;
}

function formatLiters(value) {
  return `${Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: Number(value || 0) % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 2
  })} L`;
}

function setRing(element, score) {
  if (!element) return;
  element.style.setProperty("--progress", `${clamp(score, 0, 100) * 3.6}deg`);
}

function showScreen(screen) {
  document.querySelectorAll(".screen").forEach(el => el.classList.remove("active"));
  const target = document.getElementById(`screen-${screen}`);
  if (!target) return;
  target.classList.add("active");

  document.querySelectorAll(".nav-link").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.screen === screen);
  });

  closeTools();
  window.scrollTo({ top: 0, behavior: "smooth" });
  renderAll();
}

function toast(message, type = "success") {
  const container = document.getElementById("toastContainer");
  const item = document.createElement("div");
  item.className = `toast ${type}`;
  item.textContent = message;
  container.appendChild(item);
  setTimeout(() => item.remove(), 2600);
}

function applyTheme() {
  document.body.classList.toggle("light", state.theme === "light");
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    "content",
    state.theme === "light" ? "#f4f8fb" : "#07111f"
  );
  const select = document.getElementById("themeSelect");
  if (select) select.value = state.theme;
}

function setTheme(theme) {
  state.theme = theme === "light" ? "light" : "dark";
  save();
  applyTheme();
  toast(state.theme === "light" ? "Tema claro ativado." : "Tema escuro ativado.");
}

function addWater(ml) {
  const record = getDay();
  record.water = Number((Number(record.water || 0) + ml / 1000).toFixed(2));
  save();
  updateWaterUI();
  updateCalculatorResult();
  renderHome();
  toast(`+${ml} ml adicionados.`);
}

function resetWater() {
  getDay().water = 0;
  save();
  updateWaterUI();
  updateCalculatorResult();
  renderHome();
  toast("Hidratação zerada.");
}

function updateWaterUI() {
  const record = getDay();
  const value = Number(record.water || 0);
  const goal = Number(state.goals.water || 0);
  const percent = Math.round(goalProgress(value, goal) * 100);

  const input = document.getElementById("waterInput");
  const valueEl = document.getElementById("waterValue");
  const bar = document.getElementById("waterProgressBar");
  const text = document.getElementById("waterProgressText");

  if (input && document.activeElement !== input) input.value = value;
  if (valueEl) valueEl.textContent = formatLiters(value);
  if (bar) bar.style.width = `${percent}%`;
  if (text) text.textContent = `${formatLiters(value)} de ${formatLiters(goal)} (${percent}%)`;
}

function updateCalculatorResult() {
  const record = getDay();
  const score = dailyScore(record);

  setRing(document.getElementById("calculatorScoreRing"), score);
  const scoreEl = document.getElementById("calculatorScore");
  if (scoreEl) scoreEl.textContent = `${score}%`;

  const values = {
    calcWaterMini: Math.round(goalProgress(record.water, state.goals.water) * 100),
    calcSleepMini: Math.round(sleepProgress(record.sleep) * 100),
    calcActivityMini: Math.round(goalProgress(record.activity, state.goals.activity) * 100),
    calcHabitMini: Math.round(habitProgress(record) * 100)
  };

  Object.entries(values).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = `${value}%`;
  });

  const message = document.getElementById("calculatorMessage");
  if (message) {
    message.textContent =
      score >= 80 ? "Ótimo ritmo. Continue mantendo sua consistência." :
      score >= 60 ? "Você já avançou. Pequenas ações podem melhorar o resultado." :
      "Comece pelos registros que ainda estão vazios.";
  }
}

function loadCalculatorForm() {
  const r = getDay();

  document.getElementById("waterInput").value = r.water || 0;
  document.getElementById("sleepHours").value = r.sleep || "";
  document.getElementById("sleepQuality").value = r.sleepQuality || 0;
  document.getElementById("activityMinutes").value = r.activity || "";
  document.getElementById("activityType").value = r.activityType || "Caminhada";
  document.getElementById("activityIntensity").value = r.intensity || "Moderada";
  document.getElementById("dailyNotes").value = r.notes || "";

  document.querySelectorAll("[data-mood]").forEach(btn => {
    btn.classList.toggle("active", Number(btn.dataset.mood) === Number(r.mood));
  });
  document.querySelectorAll("[data-energy]").forEach(btn => {
    btn.classList.toggle("active", Number(btn.dataset.energy) === Number(r.energy));
  });

  updateWaterUI();
  updateCalculatorResult();
}

function saveDayFromForm() {
  const r = getDay();

  r.water = Math.max(0, Number(document.getElementById("waterInput").value) || 0);
  r.sleep = Math.max(0, Number(document.getElementById("sleepHours").value) || 0);
  r.sleepQuality = Number(document.getElementById("sleepQuality").value) || 0;
  r.activity = Math.max(0, Number(document.getElementById("activityMinutes").value) || 0);
  r.activityType = document.getElementById("activityType").value;
  r.intensity = document.getElementById("activityIntensity").value;
  r.notes = document.getElementById("dailyNotes").value.trim();

  const mood = document.querySelector("[data-mood].active");
  const energy = document.querySelector("[data-energy].active");
  if (mood) r.mood = Number(mood.dataset.mood);
  if (energy) r.energy = Number(energy.dataset.energy);

  save();
  updateWaterUI();
  updateCalculatorResult();
  renderHome();
  renderStats();
  renderHistory();
  toast("Registro de hoje salvo.");
}

function renderHome() {
  const r = getDay();
  const score = dailyScore(r);

  document.getElementById("homeName").textContent = state.profile.name || "Visitante";
  document.getElementById("homeDate").textContent =
    formatDate(dateKey(), { weekday: "long", day: "numeric", month: "long" });

  document.getElementById("homeStreak").textContent = getStreak();
  document.getElementById("homeScore").textContent = `${score}%`;
  setRing(document.getElementById("homeScoreRing"), score);

  document.getElementById("homeWater").textContent = formatLiters(r.water);
  document.getElementById("homeWaterGoal").textContent = formatLiters(state.goals.water);
  document.getElementById("homeSleep").textContent = `${Number(r.sleep || 0).toLocaleString("pt-BR")} h`;
  document.getElementById("homeSleepGoal").textContent = `${Number(state.goals.sleep).toLocaleString("pt-BR")} h`;
  document.getElementById("homeActivity").textContent = `${Math.round(r.activity || 0)} min`;
  document.getElementById("homeActivityGoal").textContent = `${Math.round(state.goals.activity)} min`;

  const scoreMessage = document.getElementById("scoreMessage");
  scoreMessage.textContent =
    score >= 80 ? "Seu dia está bem encaminhado. Continue com constância." :
    score >= 50 ? "Você já começou. Complete mais alguns registros para avançar." :
    "Comece registrando água, sono, atividade e seus hábitos.";

  const habitsContainer = document.getElementById("homeHabits");
  habitsContainer.innerHTML = state.habits.map(h => `
    <label class="habit-card">
      <input type="checkbox" data-home-habit="${h.id}" ${r.habitStatus?.[h.id] ? "checked" : ""}>
      <span>
        <strong>${escapeHtml(h.name)}</strong>
        <small>${escapeHtml(h.category)}</small>
      </span>
    </label>
  `).join("") || `<div class="card" style="padding:20px">Nenhum hábito cadastrado.</div>`;

  renderChart("homeWeeklyChart", 7);
  renderAchievements();
}

function renderChart(containerId, daysCount) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = lastDays(daysCount).map(key => {
    const r = state.days[key] || defaultDay();
    const score = dailyScore(r);
    const label = new Intl.DateTimeFormat("pt-BR", { weekday: "short" })
      .format(dateFromKey(key)).replace(".", "");
    return `
      <div class="bar-item" title="${formatDate(key)} — ${score}%">
        <b>${score}%</b>
        <div class="bar" style="height:${Math.max(score, 3)}%"></div>
        <span>${label}</span>
      </div>
    `;
  }).join("");
}

function renderAchievements() {
  const records = getRecords().map(([, r]) => r);
  const totalDays = records.length;
  const streak = getStreak();
  const totalHabitCompletions = records.reduce(
    (sum, r) => sum + state.habits.filter(h => r.habitStatus?.[h.id]).length, 0
  );
  const waterGoal = records.some(r => Number(r.water) >= Number(state.goals.water));
  const consistentWeek = lastDays(7).every(key => state.days[key] && dailyScore(state.days[key]) >= 70);

  const achievements = [
    ["1", "Primeiro registro", totalDays >= 1],
    ["3", "Sequência de 3 dias", streak >= 3],
    ["7", "Sequência de 7 dias", streak >= 7],
    ["H₂O", "Meta de hidratação", waterGoal],
    ["7D", "Semana consistente", consistentWeek],
    ["10", "10 hábitos concluídos", totalHabitCompletions >= 10]
  ];

  document.getElementById("achievementList").innerHTML = achievements.map(([badge, name, unlocked]) => `
    <div class="achievement ${unlocked ? "" : "locked"}">
      <div class="achievement-badge">${badge}</div>
      <div>
        <strong>${name}</strong>
        <small>${unlocked ? "Conquistado" : "Ainda bloqueado"}</small>
      </div>
    </div>
  `).join("");
}

function renderHabits() {
  const container = document.getElementById("habitList");
  const r = getDay();

  container.innerHTML = state.habits.map(h => `
    <div class="full-habit-row">
      <input type="checkbox" data-habit-toggle="${h.id}" ${r.habitStatus?.[h.id] ? "checked" : ""}>
      <span>
        <strong>${escapeHtml(h.name)}</strong>
        <small>${escapeHtml(h.category)}</small>
      </span>
      <button class="delete-btn" type="button" data-delete-habit="${h.id}">Excluir</button>
    </div>
  `).join("") || `<p class="muted">Você ainda não criou hábitos personalizados.</p>`;
}

function renderStats() {
  const records = getRecords().map(([, r]) => r);
  const days = records.length;

  const avg = (values) => values.length ? values.reduce((a,b) => a+b,0) / values.length : 0;
  const avgScore = avg(records.map(dailyScore));
  const avgWater = avg(records.map(r => Number(r.water) || 0));
  const avgSleep = avg(records.map(r => Number(r.sleep) || 0));
  const avgActivity = avg(records.map(r => Number(r.activity) || 0));

  document.getElementById("statDays").textContent = days;
  document.getElementById("statConsistency").textContent = `${Math.round(avgScore)}%`;
  document.getElementById("statWater").textContent = formatLiters(avgWater);
  document.getElementById("statSleep").textContent = `${avgSleep.toLocaleString("pt-BR",{maximumFractionDigits:1})} h`;
  document.getElementById("statActivity").textContent = `${Math.round(avgActivity)} min`;
  document.getElementById("statStreak").textContent = `${getStreak()} dias`;

  renderChart("statsWeeklyChart", 7);
}

function renderGoals() {
  document.getElementById("goalWater").value = state.goals.water;
  document.getElementById("goalSleep").value = state.goals.sleep;
  document.getElementById("goalActivity").value = state.goals.activity;
}

function saveGoals() {
  state.goals.water = Math.max(.1, Number(document.getElementById("goalWater").value) || 2);
  state.goals.sleep = Math.max(1, Number(document.getElementById("goalSleep").value) || 8);
  state.goals.activity = Math.max(1, Number(document.getElementById("goalActivity").value) || 30);

  save();
  renderAll();
  toast("Metas atualizadas.");
}

function renderHistory() {
  const list = document.getElementById("historyList");
  const keys = lastDays(14).reverse();

  list.innerHTML = keys.map(key => {
    const r = state.days[key];
    const score = r ? dailyScore(r) : 0;
    const label = key === dateKey() ? "Hoje" : formatDate(key, { weekday:"short", day:"2-digit", month:"short" });
    return `
      <button class="history-item ${selectedHistoryDate === key ? "active" : ""}" type="button" data-history-date="${key}">
        <div>
          <strong>${label}</strong>
          <small>${r ? "Registro disponível" : "Sem registro"}</small>
        </div>
        <span class="history-score">${r ? score + "%" : "—"}</span>
      </button>
    `;
  }).join("");

  renderHistoryDetail();
}

function renderHistoryDetail() {
  const key = selectedHistoryDate;
  const r = state.days[key] || defaultDay();
  document.getElementById("historyDetailTitle").textContent =
    key === dateKey() ? "Hoje" : formatDate(key, { day:"numeric", month:"long", year:"numeric" });

  const details = [
    ["Consistência", `${dailyScore(r)}%`],
    ["Água", formatLiters(r.water)],
    ["Sono", `${Number(r.sleep || 0).toLocaleString("pt-BR")} h`],
    ["Qualidade do sono", r.sleepQuality ? `${r.sleepQuality}/5` : "Não informado"],
    ["Atividade", `${Math.round(r.activity || 0)} min`],
    ["Tipo de atividade", r.activityType || "—"],
    ["Humor", `${r.mood || 0}/5`],
    ["Energia", `${r.energy || 0}/5`]
  ];

  document.getElementById("historyDetail").innerHTML = details.map(([name, value]) => `
    <div class="detail-box"><span>${name}</span><strong>${escapeHtml(String(value))}</strong></div>
  `).join("") + (r.notes ? `
    <div class="detail-box" style="grid-column:1/-1"><span>Observação</span><strong>${escapeHtml(r.notes)}</strong></div>
  ` : "");
}

function renderSettings() {
  document.getElementById("profileName").value = state.profile.name || "";
  document.getElementById("themeSelect").value = state.theme;
}

function saveProfile() {
  const name = document.getElementById("profileName").value.trim();
  state.profile.name = name || "Visitante";
  save();
  renderHome();
  toast("Perfil atualizado.");
}

function openHabitModal() {
  document.getElementById("habitName").value = "";
  document.getElementById("habitCategory").value = "Rotina";
  document.getElementById("habitModal").classList.remove("hidden");
  setTimeout(() => document.getElementById("habitName").focus(), 50);
}

function closeHabitModal() {
  document.getElementById("habitModal").classList.add("hidden");
}

function addHabit() {
  const name = document.getElementById("habitName").value.trim();
  const category = document.getElementById("habitCategory").value;

  if (!name) {
    toast("Digite um nome para o hábito.", "error");
    return;
  }

  state.habits.push({
    id: `h_${Date.now()}`,
    name,
    category
  });

  save();
  closeHabitModal();
  renderAll();
  toast("Hábito adicionado.");
}

function deleteHabit(id) {
  const habit = state.habits.find(h => h.id === id);
  if (!habit) return;

  if (!confirm(`Excluir o hábito "${habit.name}"?`)) return;

  state.habits = state.habits.filter(h => h.id !== id);
  Object.values(state.days).forEach(r => {
    if (r.habitStatus) delete r.habitStatus[id];
  });

  save();
  renderAll();
  toast("Hábito excluído.");
}

function toggleHabit(id, checked) {
  getDay().habitStatus[id] = checked;
  save();
  renderHome();
  renderHabits();
  updateCalculatorResult();
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `vitatrack-backup-${dateKey()}.json`;
  link.click();
  URL.revokeObjectURL(url);
  toast("Backup exportado.");
}

function resetToday() {
  if (!confirm("Limpar todos os dados registrados hoje?")) return;
  delete state.days[dateKey()];
  save();
  selectedHistoryDate = dateKey();
  renderAll();
  toast("Registro de hoje foi limpo.");
}

function resetAll() {
  if (!confirm("Isso apagará hábitos, metas, registros e preferências salvos neste navegador. Continuar?")) return;
  state = defaultState();
  save();
  selectedHistoryDate = dateKey();
  applyTheme();
  renderAll();
  toast("Todos os dados foram apagados.");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function closeTools() {
  const menu = document.querySelector(".tools-menu");
  if (!menu) return;
  menu.classList.remove("open");
  document.getElementById("toolsButton")?.setAttribute("aria-expanded", "false");
}

function renderAll() {
  renderHome();
  loadCalculatorForm();
  renderHabits();
  renderStats();
  renderGoals();
  renderHistory();
  renderSettings();
  applyTheme();
}

document.addEventListener("click", (event) => {
  const screenButton = event.target.closest("[data-screen]");
  if (screenButton) {
    event.preventDefault();
    showScreen(screenButton.dataset.screen);
    return;
  }

  const homeHabit = event.target.closest("[data-home-habit]");
  if (homeHabit) {
    toggleHabit(homeHabit.dataset.homeHabit, homeHabit.checked);
    return;
  }

  const habitToggle = event.target.closest("[data-habit-toggle]");
  if (habitToggle) {
    toggleHabit(habitToggle.dataset.habitToggle, habitToggle.checked);
    return;
  }

  const deleteButton = event.target.closest("[data-delete-habit]");
  if (deleteButton) {
    deleteHabit(deleteButton.dataset.deleteHabit);
    return;
  }

  const historyButton = event.target.closest("[data-history-date]");
  if (historyButton) {
    selectedHistoryDate = historyButton.dataset.historyDate;
    renderHistory();
    return;
  }

  if (event.target.closest("[data-close-modal]")) {
    closeHabitModal();
  }
});

document.getElementById("toolsButton").addEventListener("click", (event) => {
  event.stopPropagation();
  const menu = document.querySelector(".tools-menu");
  menu.classList.toggle("open");
  document.getElementById("toolsButton").setAttribute(
    "aria-expanded",
    String(menu.classList.contains("open"))
  );
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".tools-menu")) closeTools();
});

document.getElementById("settingsButton").addEventListener("click", () => {
  showScreen("settings");
});

document.querySelectorAll(".water-add").forEach(button => {
  button.addEventListener("click", () => addWater(Number(button.dataset.ml)));
});

document.getElementById("waterReset").addEventListener("click", resetWater);

document.getElementById("waterInput").addEventListener("input", (event) => {
  const value = Math.max(0, Number(event.target.value) || 0);
  getDay().water = value;
  save();
  updateWaterUI();
  updateCalculatorResult();
  renderHome();
});

["sleepHours", "sleepQuality", "activityMinutes", "activityType", "activityIntensity", "dailyNotes"].forEach(id => {
  document.getElementById(id).addEventListener("input", updateCalculatorResult);
  document.getElementById(id).addEventListener("change", updateCalculatorResult);
});

document.querySelectorAll("[data-mood]").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-mood]").forEach(b => b.classList.remove("active"));
    button.classList.add("active");
  });
});

document.querySelectorAll("[data-energy]").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-energy]").forEach(b => b.classList.remove("active"));
    button.classList.add("active");
  });
});

document.getElementById("saveDayButton").addEventListener("click", saveDayFromForm);
document.getElementById("addHabitButton").addEventListener("click", openHabitModal);
document.getElementById("confirmHabitButton").addEventListener("click", addHabit);
document.getElementById("saveGoalsButton").addEventListener("click", saveGoals);
document.getElementById("saveProfileButton").addEventListener("click", saveProfile);
document.getElementById("themeSelect").addEventListener("change", e => setTheme(e.target.value));
document.getElementById("exportButton").addEventListener("click", exportData);
document.getElementById("resetDayButton").addEventListener("click", resetToday);
document.getElementById("resetAllButton").addEventListener("click", resetAll);

document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    closeTools();
    closeHabitModal();
  }
});

applyTheme();
renderAll();
