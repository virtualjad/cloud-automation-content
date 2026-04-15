/* Family Chore Chart - client-side app
 * Storage model (localStorage key "chore-chart-v1"):
 * {
 *   members: [{ id, name, color }],
 *   chores:  [{ id, name, assigneeId, points, days: [0..6], notes }],
 *   completions: { "YYYY-MM-DD": { [choreId]: true } }
 * }
 */

(() => {
  "use strict";

  const STORAGE_KEY = "chore-chart-v1";
  const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // ---------- State ----------
  const defaultState = () => ({
    members: [],
    chores: [],
    completions: {},
  });

  let state = loadState();
  let weekOffset = 0; // 0 = current week, -1 = previous, +1 = next
  let leaderboardRange = "week";

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      return {
        members: Array.isArray(parsed.members) ? parsed.members : [],
        chores: Array.isArray(parsed.chores) ? parsed.chores : [],
        completions: parsed.completions && typeof parsed.completions === "object" ? parsed.completions : {},
      };
    } catch (e) {
      console.warn("Failed to load state, resetting.", e);
      return defaultState();
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  // ---------- Date helpers ----------
  function todayKey() { return dateKey(new Date()); }
  function dateKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  function startOfWeek(d) {
    // Week starts Sunday
    const copy = new Date(d);
    copy.setHours(0, 0, 0, 0);
    copy.setDate(copy.getDate() - copy.getDay());
    return copy;
  }
  function addDays(d, n) {
    const copy = new Date(d);
    copy.setDate(copy.getDate() + n);
    return copy;
  }
  function formatShort(d) {
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  // ---------- ID ----------
  function uid() { return Math.random().toString(36).slice(2, 10); }

  // ---------- Mutations ----------
  function addMember(name, color) {
    state.members.push({ id: uid(), name: name.trim(), color });
    saveState();
  }
  function removeMember(id) {
    if (!confirm("Remove this family member? Chores assigned to them will also be removed.")) return;
    state.members = state.members.filter((m) => m.id !== id);
    state.chores = state.chores.filter((c) => c.assigneeId !== id);
    saveState();
  }

  function addChore(data) {
    state.chores.push({ id: uid(), ...data });
    saveState();
  }
  function removeChore(id) {
    if (!confirm("Delete this chore?")) return;
    state.chores = state.chores.filter((c) => c.id !== id);
    // Also drop its completions
    for (const dk of Object.keys(state.completions)) {
      if (state.completions[dk][id]) delete state.completions[dk][id];
    }
    saveState();
  }

  function toggleCompletion(choreId, dateStr) {
    if (!state.completions[dateStr]) state.completions[dateStr] = {};
    if (state.completions[dateStr][choreId]) {
      delete state.completions[dateStr][choreId];
    } else {
      state.completions[dateStr][choreId] = true;
    }
    saveState();
  }

  function isDone(choreId, dateStr) {
    return !!(state.completions[dateStr] && state.completions[dateStr][choreId]);
  }

  function memberById(id) { return state.members.find((m) => m.id === id); }
  function choreById(id) { return state.chores.find((c) => c.id === id); }

  // ---------- Rendering ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function render() {
    renderMemberSelects();
    renderToday();
    renderWeek();
    renderManageLists();
    renderLeaderboard();
  }

  function renderMemberSelects() {
    const choreAssignee = $("#chore-assignee");
    const todayWho = $("#today-who");

    choreAssignee.innerHTML = state.members.length
      ? state.members.map((m) => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join("")
      : `<option value="" disabled>Add a family member first</option>`;

    const current = todayWho.value || "all";
    todayWho.innerHTML =
      `<option value="all">Everyone</option>` +
      state.members.map((m) => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join("");
    todayWho.value = state.members.some((m) => m.id === current) || current === "all" ? current : "all";
  }

  function renderToday() {
    const container = $("#today-list");
    const heading = $("#today-heading");
    const today = new Date();
    const dayIdx = today.getDay();
    const dateStr = todayKey();
    heading.textContent = `${today.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}`;

    const filter = $("#today-who").value;

    let chores = state.chores.filter((c) => Array.isArray(c.days) && c.days.includes(dayIdx));
    if (filter !== "all") chores = chores.filter((c) => c.assigneeId === filter);

    if (chores.length === 0) {
      container.innerHTML = state.chores.length === 0
        ? `<div class="empty-state">No chores yet. Head to the <strong>Manage</strong> tab to add some!</div>`
        : `<div class="empty-state">Nothing scheduled here for today. Nice!</div>`;
      return;
    }

    // Group by assignee
    chores.sort((a, b) => {
      const ma = memberById(a.assigneeId)?.name || "";
      const mb = memberById(b.assigneeId)?.name || "";
      return ma.localeCompare(mb) || a.name.localeCompare(b.name);
    });

    container.innerHTML = chores.map((c) => {
      const m = memberById(c.assigneeId);
      const done = isDone(c.id, dateStr);
      const color = m?.color || "var(--primary)";
      return `
        <div class="chore-row ${done ? "done" : ""}" style="border-left-color:${color}">
          <button class="chore-check ${done ? "checked" : ""}" data-chore="${c.id}" aria-label="Toggle completion">
            ${done ? "&#10003;" : ""}
          </button>
          <div class="chore-info">
            <p class="chore-title">${escapeHtml(c.name)}</p>
            <div class="chore-meta">
              <span class="badge" style="background:${hexToRgba(color, 0.15)};color:${color}">${escapeHtml(m?.name || "Unassigned")}</span>
              <span class="badge badge-points">+${c.points} pts</span>
              ${c.notes ? `<span>${escapeHtml(c.notes)}</span>` : ""}
            </div>
          </div>
        </div>
      `;
    }).join("");

    $$(".chore-check", container).forEach((btn) => {
      btn.addEventListener("click", () => {
        toggleCompletion(btn.dataset.chore, dateStr);
        renderToday();
        renderLeaderboard();
        renderWeek();
      });
    });
  }

  function renderWeek() {
    const grid = $("#week-grid");
    const label = $("#week-label");

    const weekStart = addDays(startOfWeek(new Date()), weekOffset * 7);
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    const todayStr = todayKey();

    label.textContent = `${formatShort(days[0])} – ${formatShort(days[6])}`;

    if (state.chores.length === 0) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1 / -1">Add chores in the Manage tab to populate the weekly chart.</div>`;
      return;
    }

    let html = `<div class="week-cell header">Chore</div>`;
    for (const d of days) {
      const isToday = dateKey(d) === todayStr;
      html += `<div class="week-cell header ${isToday ? "today" : ""}">
        <span>${DAY_NAMES[d.getDay()]}</span>
        <span style="font-weight:400;font-size:0.75rem;color:var(--text-dim)">${d.getDate()}</span>
      </div>`;
    }

    // Group chores by assignee for readability
    const sorted = [...state.chores].sort((a, b) => {
      const ma = memberById(a.assigneeId)?.name || "";
      const mb = memberById(b.assigneeId)?.name || "";
      return ma.localeCompare(mb) || a.name.localeCompare(b.name);
    });

    for (const c of sorted) {
      const m = memberById(c.assigneeId);
      const color = m?.color || "var(--primary)";
      html += `<div class="week-cell row-head">
        <div>
          <div style="font-weight:600">${escapeHtml(c.name)}</div>
          <div style="font-size:0.75rem;color:var(--text-dim)">${escapeHtml(m?.name || "Unassigned")} · ${c.points}p</div>
        </div>
      </div>`;
      for (const d of days) {
        const dIdx = d.getDay();
        const dKey = dateKey(d);
        const scheduled = c.days.includes(dIdx);
        const done = isDone(c.id, dKey);
        const isToday = dKey === todayStr;
        const cls = `dot ${scheduled ? "scheduled" : "na"} ${done ? "done" : ""}`;
        const style = done ? `background:${color};border-color:${color}` : scheduled ? `border-color:${color}` : "";
        html += `<div class="week-cell ${isToday ? "today" : ""}">
          <button class="${cls}" style="${style}" data-chore="${c.id}" data-date="${dKey}" ${scheduled ? "" : "disabled"} aria-label="Toggle"></button>
        </div>`;
      }
    }

    grid.innerHTML = html;

    $$(".dot:not(.na)", grid).forEach((btn) => {
      btn.addEventListener("click", () => {
        toggleCompletion(btn.dataset.chore, btn.dataset.date);
        renderWeek();
        renderToday();
        renderLeaderboard();
      });
    });
  }

  function renderManageLists() {
    // Members
    const ml = $("#member-list");
    ml.innerHTML = state.members.length
      ? state.members.map((m) => `
          <li class="member-item">
            <span class="color-swatch" style="background:${m.color}"></span>
            <span class="item-name">${escapeHtml(m.name)}</span>
            <span class="item-meta">${choreCountFor(m.id)} chores</span>
            <button class="icon-btn" data-remove-member="${m.id}" title="Remove">Remove</button>
          </li>
        `).join("")
      : `<li class="item-meta" style="padding:12px">No members yet. Add your teens above!</li>`;

    $$("[data-remove-member]", ml).forEach((btn) =>
      btn.addEventListener("click", () => { removeMember(btn.dataset.removeMember); render(); })
    );

    // Chores
    const cl = $("#chore-list-manage");
    if (state.chores.length === 0) {
      cl.innerHTML = `<li class="item-meta" style="padding:12px">No chores defined yet.</li>`;
    } else {
      const sorted = [...state.chores].sort((a, b) => a.name.localeCompare(b.name));
      cl.innerHTML = sorted.map((c) => {
        const m = memberById(c.assigneeId);
        const color = m?.color || "var(--primary)";
        const daysLabel = c.days.map((d) => DAY_NAMES[d]).join(", ") || "No days";
        return `
          <li class="chore-manage-item">
            <span class="color-swatch" style="background:${color}"></span>
            <div style="flex:1;min-width:0">
              <div class="item-name">${escapeHtml(c.name)}</div>
              <div class="item-meta">${escapeHtml(m?.name || "Unassigned")} · ${c.points}p · ${daysLabel}</div>
              ${c.notes ? `<div class="item-meta">${escapeHtml(c.notes)}</div>` : ""}
            </div>
            <button class="icon-btn" data-remove-chore="${c.id}" title="Delete">Delete</button>
          </li>
        `;
      }).join("");
      $$("[data-remove-chore]", cl).forEach((btn) =>
        btn.addEventListener("click", () => { removeChore(btn.dataset.removeChore); render(); })
      );
    }
  }

  function choreCountFor(memberId) {
    return state.chores.filter((c) => c.assigneeId === memberId).length;
  }

  function renderLeaderboard() {
    const board = $("#leaderboard");
    const streaksEl = $("#streaks");

    if (state.members.length === 0) {
      board.innerHTML = `<div class="empty-state">Add a family member to start tracking points.</div>`;
      streaksEl.innerHTML = "";
      return;
    }

    const totals = computeTotals(leaderboardRange);
    const sorted = [...state.members].map((m) => ({
      ...m,
      points: totals.points[m.id] || 0,
      done: totals.done[m.id] || 0,
      scheduled: totals.scheduled[m.id] || 0,
    })).sort((a, b) => b.points - a.points);

    const max = Math.max(1, ...sorted.map((s) => s.points));

    board.innerHTML = sorted.map((m, i) => {
      const rankClass = i === 0 ? "first" : i === 1 ? "second" : i === 2 ? "third" : "";
      const medal = i === 0 ? "1st" : i === 1 ? "2nd" : i === 2 ? "3rd" : `${i + 1}`;
      const pct = Math.round((m.points / max) * 100);
      const rate = m.scheduled ? Math.round((m.done / m.scheduled) * 100) : 0;
      return `
        <div class="leader-row">
          <div class="leader-rank ${rankClass}">${medal}</div>
          <div>
            <div style="font-weight:600">
              <span class="color-swatch" style="display:inline-block;vertical-align:middle;margin-right:8px;background:${m.color}"></span>
              ${escapeHtml(m.name)}
            </div>
            <div class="item-meta">${m.done} of ${m.scheduled} chores done · ${rate}% completion</div>
            <div class="leader-bar"><div class="leader-bar-fill" style="width:${pct}%;background:${m.color}"></div></div>
          </div>
          <div class="leader-points">${m.points}<div style="font-size:0.75rem;color:var(--text-dim);font-weight:400">pts</div></div>
        </div>
      `;
    }).join("");

    // Streaks
    const streak = computeTodayStreak();
    streaksEl.innerHTML = sorted.map((m) => {
      const s = streak[m.id] || 0;
      return `<div class="streak-card">
        <div class="num">${s}</div>
        <div class="label">${escapeHtml(m.name)}'s day streak</div>
      </div>`;
    }).join("");
  }

  function computeTotals(range) {
    const points = {};
    const done = {};
    const scheduled = {};

    let startDate;
    const endDate = new Date();
    if (range === "week") {
      startDate = addDays(startOfWeek(new Date()), weekOffset * 7);
    } else {
      // all time - walk back 1 year max to keep it bounded but comprehensive
      startDate = addDays(new Date(), -365);
    }

    for (let d = new Date(startDate); d <= endDate; d = addDays(d, 1)) {
      const dKey = dateKey(d);
      const dIdx = d.getDay();
      for (const c of state.chores) {
        if (!c.days.includes(dIdx)) continue;
        scheduled[c.assigneeId] = (scheduled[c.assigneeId] || 0) + 1;
        if (isDone(c.id, dKey)) {
          done[c.assigneeId] = (done[c.assigneeId] || 0) + 1;
          points[c.assigneeId] = (points[c.assigneeId] || 0) + (c.points || 0);
        }
      }
    }
    return { points, done, scheduled };
  }

  function computeTodayStreak() {
    // Consecutive days (going back from today) where the member completed
    // every chore scheduled for them that day. Days with no scheduled chores are skipped.
    const result = {};
    for (const m of state.members) {
      let streak = 0;
      for (let i = 0; i < 365; i++) {
        const d = addDays(new Date(), -i);
        const dIdx = d.getDay();
        const dKey = dateKey(d);
        const scheduled = state.chores.filter((c) => c.assigneeId === m.id && c.days.includes(dIdx));
        if (scheduled.length === 0) continue;
        const allDone = scheduled.every((c) => isDone(c.id, dKey));
        if (allDone) streak++; else break;
      }
      result[m.id] = streak;
    }
    return result;
  }

  // ---------- Utilities ----------
  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[ch]);
  }

  function hexToRgba(hex, alpha) {
    if (!hex || !hex.startsWith("#")) return `rgba(108,157,248,${alpha})`;
    let h = hex.slice(1);
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const n = parseInt(h, 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return `rgba(${r},${g},${b},${alpha})`;
  }

  // ---------- Event wiring ----------
  function wireTabs() {
    $$(".tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        $$(".tab").forEach((t) => t.classList.remove("active"));
        $$(".tab-panel").forEach((p) => p.classList.remove("active"));
        tab.classList.add("active");
        $(`#tab-${tab.dataset.tab}`).classList.add("active");
      });
    });
  }

  function wireForms() {
    $("#member-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const name = $("#member-name").value.trim();
      const color = $("#member-color").value;
      if (!name) return;
      addMember(name, color);
      e.target.reset();
      $("#member-color").value = randomNiceColor();
      render();
    });

    $("#chore-form").addEventListener("submit", (e) => {
      e.preventDefault();
      if (state.members.length === 0) {
        alert("Add a family member first.");
        return;
      }
      const name = $("#chore-name").value.trim();
      const assigneeId = $("#chore-assignee").value;
      const points = parseInt($("#chore-points").value, 10) || 1;
      const days = $$(".day-cb").filter((cb) => cb.checked).map((cb) => parseInt(cb.value, 10));
      const notes = $("#chore-notes").value.trim();
      if (!name || !assigneeId || days.length === 0) {
        alert("Please fill out name, assignee, and at least one day.");
        return;
      }
      addChore({ name, assigneeId, points, days, notes });
      e.target.reset();
      // Restore weekday defaults
      $$(".day-cb").forEach((cb) => { cb.checked = cb.value !== "0" && cb.value !== "6"; });
      $("#chore-points").value = 5;
      render();
    });

    // Day presets
    $$(".day-presets .btn-ghost").forEach((btn) => {
      btn.addEventListener("click", () => {
        const preset = btn.dataset.preset;
        $$(".day-cb").forEach((cb) => {
          const v = parseInt(cb.value, 10);
          if (preset === "weekdays") cb.checked = v >= 1 && v <= 5;
          else if (preset === "weekends") cb.checked = v === 0 || v === 6;
          else if (preset === "daily") cb.checked = true;
          else cb.checked = false;
        });
      });
    });

    $("#today-who").addEventListener("change", renderToday);

    $("#week-prev").addEventListener("click", () => { weekOffset--; renderWeek(); });
    $("#week-next").addEventListener("click", () => { weekOffset++; renderWeek(); });

    $$(".range-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        $$(".range-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        leaderboardRange = btn.dataset.range;
        renderLeaderboard();
      });
    });

    $("#reset-week").addEventListener("click", () => {
      if (!confirm("Clear all completions for the currently-viewed week?")) return;
      const weekStart = addDays(startOfWeek(new Date()), weekOffset * 7);
      for (let i = 0; i < 7; i++) {
        delete state.completions[dateKey(addDays(weekStart, i))];
      }
      saveState();
      render();
    });

    $("#reset-all").addEventListener("click", () => {
      if (!confirm("Delete ALL data — members, chores, and completions? This cannot be undone.")) return;
      state = defaultState();
      saveState();
      render();
    });

    $("#export-data").addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `chore-chart-${todayKey()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

    $("#import-data").addEventListener("click", () => $("#import-file").click());
    $("#import-file").addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const imported = JSON.parse(reader.result);
          if (!imported.members || !imported.chores) throw new Error("Invalid file");
          if (!confirm("This will replace your current data. Continue?")) return;
          state = {
            members: imported.members,
            chores: imported.chores,
            completions: imported.completions || {},
          };
          saveState();
          render();
        } catch (err) {
          alert("Could not import file: " + err.message);
        }
      };
      reader.readAsText(file);
      e.target.value = "";
    });
  }

  function randomNiceColor() {
    const palette = ["#6c9df8", "#f472b6", "#4ade80", "#fbbf24", "#a78bfa", "#fb923c", "#22d3ee", "#f87171"];
    return palette[Math.floor(Math.random() * palette.length)];
  }

  // ---------- Seed a starter example if empty ----------
  function maybeSeed() {
    if (state.members.length > 0 || state.chores.length > 0) return;
    // Show an onboarding hint via an empty state, no auto-seeding.
    // Users can add their own data; no demo clutter.
  }

  // ---------- Init ----------
  function init() {
    wireTabs();
    wireForms();
    maybeSeed();
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
