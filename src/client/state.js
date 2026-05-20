(function () {
  const DAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  const WEEK_MIN = 10080;
  const DAY_MIN = 1440;

  function now() {
    return new Date().toISOString();
  }

  function uid(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function clampToStep(value, step) {
    return Math.max(0, Math.round(Number(value || 0) / step) * step);
  }

  function formatClock(absMin, state) {
    const start = state.settings.weekStartClockMin || 0;
    const clock = ((start + absMin) % DAY_MIN + DAY_MIN) % DAY_MIN;
    const hours = Math.floor(clock / 60);
    const minutes = clock % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }

  function parseClock(value, fallbackAbsMin, state) {
    const match = String(value || "").match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return fallbackAbsMin;
    const clock = Number(match[1]) * 60 + Number(match[2]);
    const dayBase = Math.floor(fallbackAbsMin / DAY_MIN) * DAY_MIN;
    const weekStart = state.settings.weekStartClockMin || 0;
    let relative = clock - weekStart;
    while (relative < 0) relative += DAY_MIN;
    let candidate = dayBase + relative;
    if (Math.abs(candidate - fallbackAbsMin) > 720) {
      candidate += candidate < fallbackAbsMin ? DAY_MIN : -DAY_MIN;
    }
    return candidate;
  }

  function durationText(min) {
    const sign = min < 0 ? "-" : "";
    const value = Math.abs(Math.round(min || 0));
    const h = Math.floor(value / 60);
    const m = value % 60;
    if (h && m) return `${sign}${h}ч ${m}м`;
    if (h) return `${sign}${h}ч`;
    return `${sign}${m}м`;
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function activityMap(state) {
    const map = new Map();
    (state.activities || []).forEach((activity) => map.set(activity.id, activity));
    return map;
  }

  function childrenMap(state) {
    const map = new Map();
    (state.activities || []).forEach((activity) => {
      const key = activity.parentId || "root";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(activity);
    });
    map.forEach((items) => items.sort((a, b) => a.name.localeCompare(b.name, "ru")));
    return map;
  }

  function getDepth(activity, state) {
    const map = activityMap(state);
    let depth = 1;
    let current = activity;
    while (current && current.parentId) {
      depth += 1;
      current = map.get(current.parentId);
    }
    return depth;
  }

  function dayEnds(state) {
    return (state.timeline || [])
      .filter((item) => item.type === "dayEnd")
      .slice()
      .sort((a, b) => a.atAbsMin - b.atAbsMin);
  }

  function dayColumns(state) {
    const ends = dayEnds(state);
    if (!ends.length) {
      return DAY_LABELS.map((label, index) => ({
        index,
        label,
        start: index * DAY_MIN,
        end: (index + 1) * DAY_MIN,
        marker: null,
        extra: false,
        synthetic: true
      }));
    }
    const columns = [];
    let start = 0;
    ends.forEach((marker, index) => {
      const end = Math.max(marker.atAbsMin, start);
      columns.push({
        index,
        label: DAY_LABELS[index] || `День ${index + 1}`,
        start,
        end,
        marker,
        extra: index > 6
      });
      start = end;
    });
    if (columns.length === 0 || start < WEEK_MIN) {
      const index = columns.length;
      columns.push({
        index,
        label: DAY_LABELS[index] || `День ${index + 1}`,
        start,
        end: WEEK_MIN,
        marker: null,
        extra: index > 6,
        synthetic: true
      });
    }
    return columns;
  }

  function blocksInColumn(state, column) {
    return (state.timeline || [])
      .filter((item) => item.type === "activity" && item.startAbsMin >= column.start && item.startAbsMin < column.end)
      .slice()
      .sort((a, b) => a.startAbsMin - b.startAbsMin || a.endAbsMin - b.endAbsMin);
  }

  function textColor(hex) {
    const clean = String(hex || "").replace("#", "");
    if (!/^[0-9a-f]{6}$/i.test(clean)) return "#111827";
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return luminance > 0.46 ? "#111827" : "#f8fafc";
  }

  function safeColor(hex, fallback) {
    const value = String(hex || "").trim();
    return /^#[0-9a-f]{6}$/i.test(value) ? value : (fallback || "#e5e7eb");
  }

  function touchState(state) {
    state.updatedAt = now();
    return state;
  }

  function normalizeState(state) {
    state.schemaVersion = state.schemaVersion || 1;
    state.settings = Object.assign({
      authEnabled: false,
      weekStartClockMin: 420,
      timeStepMin: 5,
      pxPer5Min: 2,
      firstDayLabel: "Пн",
      theme: "system"
    }, state.settings || {});
    state.activities = state.activities || [];
    state.timeline = state.timeline || [];
    state.updatedAt = state.updatedAt || now();
    return state;
  }

  function hasOverlap(items) {
    const sorted = items.slice().sort((a, b) => a.startAbsMin - b.startAbsMin);
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i].startAbsMin < sorted[i - 1].endAbsMin) return true;
    }
    return false;
  }

  function validateState(state) {
    const warnings = [];
    const activities = activityMap(state);
    const ends = dayEnds(state);
    const blocks = (state.timeline || []).filter((item) => item.type === "activity");

    if (ends.length < 7) warnings.push(`Завершённых дней меньше 7: ${ends.length}.`);
    if (ends.length > 7) warnings.push(`Завершённых дней больше 7: ${ends.length}.`);
    const lastEnd = ends.length ? ends[ends.length - 1].atAbsMin : 0;
    if (lastEnd !== WEEK_MIN) warnings.push(`Неделя сейчас длится ${durationText(lastEnd)}, нужно 168ч.`);
    if (lastEnd % DAY_MIN !== 0) warnings.push("Последний конец дня не возвращает неделю к стартовому часу.");

    const sortedBlocks = blocks.slice().sort((a, b) => a.startAbsMin - b.startAbsMin);
    for (let i = 1; i < sortedBlocks.length; i += 1) {
      if (sortedBlocks[i].startAbsMin < sortedBlocks[i - 1].endAbsMin) {
        warnings.push("Есть пересечения активностей.");
        break;
      }
    }
    blocks.forEach((block) => {
      if (!activities.has(block.activityId)) warnings.push(`Блок ${block.id} ссылается на отсутствующую активность.`);
      if (ends.some((marker) => block.startAbsMin < marker.atAbsMin && block.endAbsMin > marker.atAbsMin)) {
        warnings.push("Есть активность, пересекающая системный конец дня.");
      }
    });
    return Array.from(new Set(warnings));
  }

  function canPlace(state, candidate, ignoreId) {
    const blocks = (state.timeline || []).filter((item) => item.type === "activity" && item.id !== ignoreId);
    return !blocks.some((item) => candidate.startAbsMin < item.endAbsMin && candidate.endAbsMin > item.startAbsMin);
  }

  function directChildrenOf(activityId, state) {
    return (state.activities || []).filter((activity) => activity.parentId === activityId);
  }

  function descendantsOf(activityId, state) {
    const result = [];
    const visit = (parentId) => {
      directChildrenOf(parentId, state).forEach((child) => {
        result.push(child);
        visit(child.id);
      });
    };
    visit(activityId);
    return result;
  }

  window.RythmState = {
    WEEK_MIN,
    DAY_MIN,
    DAY_LABELS,
    now,
    uid,
    clampToStep,
    formatClock,
    parseClock,
    durationText,
    escapeHtml,
    activityMap,
    childrenMap,
    getDepth,
    dayEnds,
    dayColumns,
    blocksInColumn,
    textColor,
    safeColor,
    touchState,
    normalizeState,
    hasOverlap,
    validateState,
    canPlace,
    descendantsOf
  };
}());
