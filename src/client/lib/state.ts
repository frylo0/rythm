import type {
  Activity,
  ActivityTimelineItem,
  DayColumn,
  DayEndTimelineItem,
  DayStartTimelineItem,
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

export function dayStarts(state: Pick<RythmState, "timeline">): DayStartTimelineItem[] {
  return (state.timeline || [])
    .filter((item): item is DayStartTimelineItem => item.type === "dayStart")
    .slice()
    .sort((a, b) => a.atAbsMin - b.atAbsMin);
}

export function dayColumns(state: RythmState): DayColumn[] {
  const starts = dayStarts(state);
  const ends = dayEnds(state);
  if (starts.length) {
    const columns: DayColumn[] = [];
    let endIndex = 0;
    starts.forEach((startMarker, index) => {
      while (endIndex < ends.length && ends[endIndex].atAbsMin <= startMarker.atAbsMin) endIndex += 1;
      const marker = ends[endIndex] || null;
      const end = marker ? Math.max(marker.atAbsMin, startMarker.atAbsMin) : Math.min(WEEK_MIN, startMarker.atAbsMin + DAY_MIN);
      columns.push({
        index,
        label: DAY_LABELS[index] || `День ${index + 1}`,
        start: startMarker.atAbsMin,
        end,
        startMarker,
        marker,
        extra: index > 6,
        synthetic: !marker
      });
      if (marker) endIndex += 1;
    });
    return columns;
  }
  if (!ends.length) {
    return DAY_LABELS.map((label, index) => ({
      index,
      label,
      start: index * DAY_MIN,
      end: (index + 1) * DAY_MIN,
      startMarker: null,
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
      startMarker: null,
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
      startMarker: null,
      marker: null,
      extra: index > 6,
      synthetic: true
    });
  }
  return columns;
}

export function blocksInColumn(state: Pick<RythmState, "timeline">, column: DayColumn): ActivityTimelineItem[] {
  return (state.timeline || [])
    .filter((item): item is ActivityTimelineItem => item.type === "activity" && item.systemRole !== "sleep" && item.startAbsMin >= column.start && item.startAbsMin < column.end)
    .slice()
    .sort((a, b) => a.startAbsMin - b.startAbsMin || a.endAbsMin - b.endAbsMin);
}

export function sleepAfterColumn(state: Pick<RythmState, "timeline">, column: DayColumn): ActivityTimelineItem | null {
  return (state.timeline || [])
    .find((item): item is ActivityTimelineItem => item.type === "activity" && item.systemRole === "sleep" && item.startAbsMin === column.end) || null;
}

function sleepBlocks(state: Pick<RythmState, "timeline">): ActivityTimelineItem[] {
  return (state.timeline || [])
    .filter((item): item is ActivityTimelineItem => item.type === "activity" && item.systemRole === "sleep")
    .slice()
    .sort((a, b) => a.startAbsMin - b.startAbsMin);
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

function ensureSleepActivity(activities: Activity[], candidateId: unknown): string {
  const existingCandidate = typeof candidateId === "string" ? activities.find((activity) => activity.id === candidateId) : null;
  if (existingCandidate) return existingCandidate.id;
  const byName = activities.find((activity) => activity.name.trim().toLocaleLowerCase("ru") === "сон");
  if (byName) return byName.id;
  const createdAt = now();
  const sleep: Activity = {
    id: uid("act_sleep"),
    parentId: null,
    name: "Сон",
    color: "#1f2937",
    opacity: 1,
    defaultDurationMin: 480,
    archived: false,
    createdAt,
    updatedAt: createdAt
  };
  activities.unshift(sleep);
  return sleep.id;
}

export function reconcileDayModel(state: RythmState): void {
  const createdAt = now();
  const starts = dayStarts(state);
  const ends = dayEnds(state);
  const sleepActivity = state.activities.find((activity) => activity.id === state.settings.sleepActivityId);
  const fallbackSleepMin = sleepActivity?.defaultDurationMin || 480;
  const regularBlocks = () => (state.timeline || [])
    .filter((item): item is ActivityTimelineItem => item.type === "activity" && item.systemRole !== "sleep" && item.activityId !== state.settings.sleepActivityId)
    .slice()
    .sort((a, b) => a.startAbsMin - b.startAbsMin);
  const inferStartAfterEnd = (endAbsMin: number, nextEndAbsMin: number): number => {
    const firstBlock = regularBlocks().find((block) => block.startAbsMin > endAbsMin && block.startAbsMin < nextEndAbsMin);
    if (firstBlock) return firstBlock.startAbsMin;
    return Math.min(nextEndAbsMin, endAbsMin + fallbackSleepMin);
  };
  const inferEndBeforeStart = (startAbsMin: number, previousStartAbsMin: number): number => {
    const lastBlock = regularBlocks()
      .filter((block) => block.startAbsMin >= previousStartAbsMin && block.endAbsMin <= startAbsMin)
      .sort((a, b) => b.endAbsMin - a.endAbsMin)[0];
    if (lastBlock) return lastBlock.endAbsMin;
    return Math.max(previousStartAbsMin, startAbsMin - fallbackSleepMin);
  };

  if (!starts.length) {
    const startTimes = [0, ...ends.slice(0, -1).map((marker, index) => inferStartAfterEnd(marker.atAbsMin, ends[index + 1]?.atAbsMin || marker.atAbsMin + DAY_MIN))];
    startTimes.forEach((atAbsMin) => {
      state.timeline.push({
        id: uid("start"),
        type: "dayStart",
        atAbsMin,
        createdAt,
        updatedAt: createdAt
      });
    });
  } else {
    const currentStarts = dayStarts(state);
    currentStarts.forEach((startMarker) => {
      const previousEnd = ends.find((endMarker) => endMarker.atAbsMin === startMarker.atAbsMin);
      if (!previousEnd) return;
      const nextEnd = ends.find((endMarker) => endMarker.atAbsMin > startMarker.atAbsMin);
      const nextEndAbsMin = nextEnd?.atAbsMin || startMarker.atAbsMin + DAY_MIN;
      const repaired = inferStartAfterEnd(startMarker.atAbsMin, nextEndAbsMin);
      if (repaired > startMarker.atAbsMin && repaired <= nextEndAbsMin) {
        startMarker.atAbsMin = repaired;
        startMarker.updatedAt = createdAt;
      }
    });
  }

  const nextStarts = dayStarts(state);
  const sortedStarts = nextStarts.slice().sort((a, b) => a.atAbsMin - b.atAbsMin);
  const sortedEnds = ends.slice().sort((a, b) => a.atAbsMin - b.atAbsMin);
  sortedEnds.forEach((endMarker, index) => {
    const nextStart = sortedStarts.find((startMarker) => startMarker.atAbsMin > endMarker.atAbsMin);
    const wrappedStartAbsMin = nextStart?.atAbsMin ?? (sortedStarts[0] ? sortedStarts[0].atAbsMin + WEEK_MIN : endMarker.atAbsMin + DAY_MIN);
    if (wrappedStartAbsMin > endMarker.atAbsMin) return;
    const previousStartAbsMin = sortedStarts[index]?.atAbsMin ?? Math.max(0, endMarker.atAbsMin - DAY_MIN);
    const repaired = inferEndBeforeStart(wrappedStartAbsMin, previousStartAbsMin);
    if (repaired < endMarker.atAbsMin && repaired >= previousStartAbsMin) {
      endMarker.atAbsMin = repaired;
      endMarker.updatedAt = createdAt;
    }
  });

  const repairedEnds = dayEnds(state);
  const existingSleeps = state.timeline.filter((item): item is ActivityTimelineItem => item.type === "activity" && item.systemRole === "sleep");
  const usedSleepIds = new Set<string>();
  state.timeline = state.timeline.filter((item) => !(item.type === "activity" && item.systemRole === "sleep"));
  repairedEnds.forEach((endMarker) => {
    let nextStart = nextStarts.find((startMarker) => startMarker.atAbsMin > endMarker.atAbsMin);
    if (!nextStart && nextStarts.length) {
      const firstStart = nextStarts[0];
      const wrappedStart = firstStart.atAbsMin + WEEK_MIN;
      if (wrappedStart > endMarker.atAbsMin) {
        nextStart = { ...firstStart, atAbsMin: wrappedStart };
      }
    }
    if (!nextStart || nextStart.atAbsMin <= endMarker.atAbsMin) return;
    const reusable = existingSleeps.find((sleep) =>
      !usedSleepIds.has(sleep.id) &&
      sleep.startAbsMin === endMarker.atAbsMin &&
      sleep.endAbsMin === nextStart.atAbsMin
    ) || existingSleeps.find((sleep) => !usedSleepIds.has(sleep.id));
    if (reusable) usedSleepIds.add(reusable.id);
    state.timeline.push({
      id: reusable?.id || uid("sleep"),
      type: "activity",
      activityId: state.settings.sleepActivityId,
      systemRole: "sleep",
      startAbsMin: endMarker.atAbsMin,
      endAbsMin: nextStart.atAbsMin,
      createdAt: reusable?.createdAt || createdAt,
      updatedAt: createdAt
    });
  });
}

export function normalizeState(state: unknown): RythmState {
  const raw = asObject(state);
  const rawSettings = asObject(raw.settings);
  const activities = Array.isArray(raw.activities)
    ? raw.activities.map((activity) => {
      const rawActivity = asObject(activity);
      return { ...(rawActivity as unknown as Activity), opacity: normalizeOpacity(rawActivity.opacity) };
    })
    : [];
  const sleepActivityId = ensureSleepActivity(activities, rawSettings.sleepActivityId);
  const settings: RythmSettings = Object.assign({
    authEnabled: false,
    weekStartClockMin: 420,
    timeStepMin: 5,
    pxPer5Min: 2,
    smartWeekGrid: true,
    sleepActivityId,
    mobileWeekScale: 1,
    firstDayLabel: "Пн",
    theme: "system",
    glowEnabled: true
  }, rawSettings, {
    theme: normalizeTheme(rawSettings.theme),
    glowEnabled: rawSettings.glowEnabled !== false,
    smartWeekGrid: rawSettings.smartWeekGrid !== false,
    sleepActivityId
  });
  const normalized: RythmState = {
    schemaVersion: 3,
    settings,
    activities,
    timeline: Array.isArray(raw.timeline) ? raw.timeline as TimelineItem[] : [],
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : now()
  };
  reconcileDayModel(normalized);
  return normalized;
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
  const starts = dayStarts(state);
  const ends = dayEnds(state);
  const blocks = (state.timeline || []).filter((item): item is ActivityTimelineItem => item.type === "activity");
  const systemSleeps = sleepBlocks(state);
  const columns = dayColumns(state);
  const sortedStarts = starts.slice().sort((a, b) => a.atAbsMin - b.atAbsMin);
  const betweenDayGaps = ends
    .slice()
    .sort((a, b) => a.atAbsMin - b.atAbsMin)
    .map((endMarker) => {
      const nextStart = sortedStarts.find((startMarker) => startMarker.atAbsMin > endMarker.atAbsMin);
      const gapEnd = nextStart?.atAbsMin ?? (sortedStarts[0] ? sortedStarts[0].atAbsMin + WEEK_MIN : endMarker.atAbsMin);
      return { start: endMarker.atAbsMin, end: gapEnd };
    })
    .filter((gap) => gap.end > gap.start);
  const scenarioTotal = columns.reduce((sum, column) => sum + Math.max(0, column.end - column.start), 0) +
    systemSleeps.reduce((sum, sleep) => sum + Math.max(0, sleep.endAbsMin - sleep.startAbsMin), 0);

  if (starts.length < 7) warnings.push(`Начал дней меньше 7: ${starts.length}.`);
  if (starts.length > 7) warnings.push(`Начал дней больше 7: ${starts.length}.`);
  if (ends.length < 7) warnings.push(`Завершённых дней меньше 7: ${ends.length}.`);
  if (ends.length > 7) warnings.push(`Завершённых дней больше 7: ${ends.length}.`);
  if (scenarioTotal !== WEEK_MIN) warnings.push(`Неделя сейчас длится ${durationText(scenarioTotal)}, нужно 168ч.`);
  const lastSleepEnd = systemSleeps.length ? systemSleeps[systemSleeps.length - 1].endAbsMin : 0;
  if (lastSleepEnd && lastSleepEnd % DAY_MIN !== 0) warnings.push("Последний сон не возвращает неделю к стартовому часу.");

  const sortedBlocks = blocks.slice().sort((a, b) => a.startAbsMin - b.startAbsMin);
  for (let i = 1; i < sortedBlocks.length; i += 1) {
    if (sortedBlocks[i].startAbsMin < sortedBlocks[i - 1].endAbsMin) {
      warnings.push("Есть пересечения активностей.");
      break;
    }
  }
  blocks.forEach((block) => {
    if (!activities.has(block.activityId)) warnings.push(`Блок ${block.id} ссылается на отсутствующую активность.`);
    const isSleep = block.systemRole === "sleep" || block.activityId === state.settings.sleepActivityId;
    if (!isSleep && ends.some((marker) => block.startAbsMin < marker.atAbsMin && block.endAbsMin > marker.atAbsMin)) {
      warnings.push("Есть активность, пересекающая системный конец дня.");
    }
    if (!isSleep && betweenDayGaps.some((gap) => block.startAbsMin >= gap.start && block.endAbsMin <= gap.end)) {
      warnings.push("Между днями может быть только сон.");
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
