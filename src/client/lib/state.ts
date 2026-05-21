import type {
  Activity,
  ActivityTimelineItem,
  DayColumn,
  DayEndTimelineItem,
  RythmSettings,
  RythmState,
  TimelineItem
} from "./types";

export const DAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
export const WEEK_MIN = 10080;
export const DAY_MIN = 1440;

export function now(): string {
  return new Date().toISOString();
}

export function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function clone<T>(value: T): T {
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

export function clampToStep(value: number | string | null | undefined, step: number): number {
  return Math.max(0, Math.round(Number(value || 0) / step) * step);
}

export function formatClock(absMin: number, state: RythmState): string {
  const start = state.settings.weekStartClockMin || 0;
  const clock = ((start + absMin) % DAY_MIN + DAY_MIN) % DAY_MIN;
  const hours = Math.floor(clock / 60);
  const minutes = clock % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function parseClock(value: string, fallbackAbsMin: number, state: RythmState): number {
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

export function durationText(min: number): string {
  const sign = min < 0 ? "-" : "";
  const value = Math.abs(Math.round(min || 0));
  const h = Math.floor(value / 60);
  const m = value % 60;
  if (h && m) return `${sign}${h}ч ${m}м`;
  if (h) return `${sign}${h}ч`;
  return `${sign}${m}м`;
}

export function activityMap(state: Pick<RythmState, "activities">): Map<string, Activity> {
  const map = new Map<string, Activity>();
  (state.activities || []).forEach((activity) => map.set(activity.id, activity));
  return map;
}

export function childrenMap(state: Pick<RythmState, "activities">): Map<string, Activity[]> {
  const map = new Map<string, Activity[]>();
  (state.activities || []).forEach((activity) => {
    const key = activity.parentId || "root";
    const items = map.get(key) || [];
    items.push(activity);
    map.set(key, items);
  });
  map.forEach((items) => items.sort((a, b) => a.name.localeCompare(b.name, "ru")));
  return map;
}

export function getDepth(activity: Activity, state: Pick<RythmState, "activities">): number {
  const map = activityMap(state);
  let depth = 1;
  let current: Activity | undefined = activity;
  while (current && current.parentId) {
    depth += 1;
    current = map.get(current.parentId);
  }
  return depth;
}

export function dayEnds(state: Pick<RythmState, "timeline">): DayEndTimelineItem[] {
  return (state.timeline || [])
    .filter((item): item is DayEndTimelineItem => item.type === "dayEnd")
    .slice()
    .sort((a, b) => a.atAbsMin - b.atAbsMin);
}

export function dayColumns(state: RythmState): DayColumn[] {
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
  const columns: DayColumn[] = [];
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

export function blocksInColumn(state: Pick<RythmState, "timeline">, column: DayColumn): ActivityTimelineItem[] {
  return (state.timeline || [])
    .filter((item): item is ActivityTimelineItem => item.type === "activity" && item.startAbsMin >= column.start && item.startAbsMin < column.end)
    .slice()
    .sort((a, b) => a.startAbsMin - b.startAbsMin || a.endAbsMin - b.endAbsMin);
}

export function textColor(hex: string | null | undefined): string {
  const clean = String(hex || "").replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(clean)) return "#111827";
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.46 ? "#111827" : "#f8fafc";
}

export function safeColor(hex: string | null | undefined, fallback = "#e5e7eb"): string {
  const value = String(hex || "").trim();
  return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

export function colorWithAlpha(hex: string | null | undefined, alpha: number | null | undefined): string {
  const clean = safeColor(hex).replace("#", "");
  const opacity = Math.min(1, Math.max(0.08, Number(alpha ?? 1)));
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

export function touchState<T extends { updatedAt: string }>(state: T): T {
  state.updatedAt = now();
  return state;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function normalizeTheme(value: unknown): RythmSettings["theme"] {
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

function normalizeOpacity(value: unknown): number {
  const opacity = Number(value ?? 1);
  return Number.isFinite(opacity) ? Math.min(1, Math.max(0.08, opacity)) : 1;
}

export function normalizeState(state: unknown): RythmState {
  const raw = asObject(state);
  const rawSettings = asObject(raw.settings);
  const settings: RythmSettings = Object.assign({
    authEnabled: false,
    weekStartClockMin: 420,
    timeStepMin: 5,
    pxPer5Min: 2,
    smartWeekGrid: true,
    mobileWeekScale: 1,
    firstDayLabel: "Пн",
    theme: "system",
    glowEnabled: true
  }, rawSettings, {
    theme: normalizeTheme(rawSettings.theme),
    glowEnabled: rawSettings.glowEnabled !== false,
    smartWeekGrid: rawSettings.smartWeekGrid !== false
  });
  return {
    schemaVersion: 2,
    settings,
    activities: Array.isArray(raw.activities)
      ? raw.activities.map((activity) => {
        const rawActivity = asObject(activity);
        return { ...(rawActivity as unknown as Activity), opacity: normalizeOpacity(rawActivity.opacity) };
      })
      : [],
    timeline: Array.isArray(raw.timeline) ? raw.timeline as TimelineItem[] : [],
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : now()
  };
}

export function hasOverlap(items: ActivityTimelineItem[]): boolean {
  const sorted = items.slice().sort((a, b) => a.startAbsMin - b.startAbsMin);
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i].startAbsMin < sorted[i - 1].endAbsMin) return true;
  }
  return false;
}

export function validateState(state: RythmState): string[] {
  const warnings: string[] = [];
  const activities = activityMap(state);
  const ends = dayEnds(state);
  const blocks = (state.timeline || []).filter((item): item is ActivityTimelineItem => item.type === "activity");

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

export function directChildrenOf(activityId: string, state: Pick<RythmState, "activities">): Activity[] {
  return (state.activities || []).filter((activity) => activity.parentId === activityId);
}

export function descendantsOf(activityId: string, state: Pick<RythmState, "activities">): Activity[] {
  const result: Activity[] = [];
  const visit = (parentId: string) => {
    directChildrenOf(parentId, state).forEach((child) => {
      result.push(child);
      visit(child.id);
    });
  };
  visit(activityId);
  return result;
}
