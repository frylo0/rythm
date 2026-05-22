<script lang="ts">
  import { onMount, tick } from "svelte";
  import { get } from "svelte/store";
  import { appState, editMode, mutateState, selectedActivityId, selectedSystem, showToast } from "../lib/stores";
  import {
  	activityMap,
  	blocksInColumn,
  	clampToStep,
  	DAY_MIN,
  	colorWithAlpha,
  	dayColumns,
  	durationText,
  	formatClock,
  	now,
  	parseClock,
  	safeColor,
  	sleepAfterColumn,
  	textColor,
  	uid,
  	validateState,
  	WEEK_MIN
  } from "../lib/state";
  import {
    EMPTY_WEEK_LAYOUT,
    absMinuteFromAxis,
    createWeekLayout as createWeekLayoutModel,
    dayOffsetsEm,
    describeWeekLayout,
    minuteFromY,
    projectAbsMinute,
    rangeHeightEm
  } from "../lib/weekLayout.mjs";
  import type { Activity, ActivityTimelineItem, DayColumn, DayEndTimelineItem, DayStartTimelineItem, RythmState } from "../lib/types";

  const ROOT_FONT_PX = 16;
  const MIN_GAP_HEIGHT_EM = 20 / ROOT_FONT_PX;
  const MIN_VIEW_BLOCK_HEIGHT_EM = 30 / ROOT_FONT_PX;
  const MIN_EDIT_BLOCK_HEIGHT_EM = 44 / ROOT_FONT_PX;

  export let state: RythmState;
  export let onOpenItem: (id: string) => void = () => {};
  export let onOpenDraftItem: (draft: { activityId: string; startAbsMin: number; endAbsMin: number; replaceItemId?: string }) => void = () => {};
  export let onOpenDayEnd: (id: string) => void = () => {};
  export let onOpenDayStart: (id: string) => void = () => {};

  let currentDate = new Date();
  let lastTap = { id: "", at: 0 };
  let suppressClickUntil = 0;
  let weekLayout: WeekLayout = { ...EMPTY_WEEK_LAYOUT };
  let drag:
    | {
        id: string;
        mode: "start" | "end" | "move";
        pointerId: number;
        pointerStartY: number;
        itemStart: number;
        itemEnd: number;
        duration: number;
        pointerOffsetMin: number;
        pointerOffsetEm: number;
        columnIndex: number;
        columnStart: number;
        columnEnd: number;
        layout: WeekLayout;
        target: HTMLElement;
        scrollContainer: HTMLElement | null;
        scrollStartTop: number;
        windowScrollStartY: number;
      }
    | null = null;

  $: columns = dayColumns(state);
  $: rowsByColumn = columns.map((column) => columnRows(column));
  $: afterRowsByColumn = columns.map((column, columnIndex) => columnAfterRows(column, columnIndex));
  $: if (!drag) weekLayout = createWeekLayout(columns, rowsByColumn, $editMode);
  $: renderLayout = drag?.layout || weekLayout;
  $: if (state.settings.weekMapLogging && !drag) logWeekMap(columns, rowsByColumn, weekLayout);
  $: map = activityMap(state);
  $: warnings = validateState(state);
  $: visibleWarnings = warnings.filter((warning) =>
    warning !== "Есть пересечения активностей." &&
    (!$editMode || warning !== "Есть активность, пересекающая системный конец дня.")
  );
  $: todayIndex = currentWeekdayIndex(currentDate);
  $: currentAbsMin = currentScenarioMinute(currentDate);

  function currentWeekdayIndex(date: Date): number {
    return (date.getDay() + 6) % 7;
  }

  function currentScenarioMinute(date: Date): number {
    const clock = date.getHours() * 60 + date.getMinutes();
    const weekStart = state.settings.weekStartClockMin || 0;
    const dayMinute = ((clock - weekStart) % DAY_MIN + DAY_MIN) % DAY_MIN;
    return todayIndex * DAY_MIN + dayMinute;
  }

  function hasCurrentTime(column: DayColumn): boolean {
    return !column.extra && column.index === todayIndex && currentAbsMin >= column.start && currentAbsMin <= column.end;
  }

  function currentTimeStyle(column: DayColumn): string {
    return `top:${weekUnit(0.5 + offsetEm(column, currentAbsMin, renderLayout))}`;
  }

  function isCurrentActivity(item: ActivityTimelineItem): boolean {
    return currentAbsMin >= item.startAbsMin && currentAbsMin < item.endAbsMin;
  }

  function weekUnit(value: number): string {
    return value === 0 ? "0px" : `calc(var(--week-unit) * ${value})`;
  }

  async function focusToday(): Promise<void> {
    await tick();
    const today = document.querySelector<HTMLElement>(".day-column.is-today");
    if (!today) return;
    today.focus({ preventScroll: true });
    const scroll = today.closest<HTMLElement>(".week-scroll");
    const target = today.querySelector<HTMLElement>(".current-time-marker") || today;
    if (!scroll) {
      target.scrollIntoView({ block: "center", inline: "center" });
      return;
    }
    const scrollRect = scroll.getBoundingClientRect();
    const todayRect = today.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const left = scroll.scrollLeft + todayRect.left - scrollRect.left - (scroll.clientWidth - todayRect.width) / 2;
    const top = scroll.scrollTop + targetRect.top - scrollRect.top - (scroll.clientHeight - targetRect.height) / 2;
    scroll.scrollTo({ left: Math.max(0, left), top: Math.max(0, top), behavior: "smooth" });
  }

  onMount(() => {
    const timer = window.setInterval(() => {
      currentDate = new Date();
    }, 60_000);
    focusToday();
    return () => window.clearInterval(timer);
  });

  type WeekLayout = {
    step: number;
    baseSlotEm: number;
    fallbackTimeMin?: number;
    pointsMin: number[];
    segmentHeightsEm: number[];
    cumulativeEm: number[];
    smart: boolean;
    strategy: string;
  };

  type TimeRule = {
    id: string;
    topEm: number;
  };

  type WeekMapPoint = {
    label: string;
    atAbsMin: number;
    durationMin?: number;
    yPx: number;
    yEm: number;
  };

  type WeekMapDay = {
    column: DayColumn;
    startOffsetPx: number;
    startOffsetEm: number;
    endOffsetPx: number;
    endOffsetEm: number;
    points: WeekMapPoint[];
  };

  type WeekMapSegment = {
    fromAxisMin: number;
    toAxisMin: number;
    durationMin: number;
    yPx: number;
    yEm: number;
    heightPx: number;
    heightEm: number;
  };

  function blockMinHeightEm(editing: boolean): number {
    return editing ? MIN_EDIT_BLOCK_HEIGHT_EM : MIN_VIEW_BLOCK_HEIGHT_EM;
  }

  function createWeekLayout(dayColumns: DayColumn[], columnRowsList: ColumnRow[][], editing: boolean): WeekLayout {
    return createWeekLayoutModel({
      columns: dayColumns,
      rowsByColumn: columnRowsList,
      step: 5,
      baseSlotEm: Math.max(0.01, Number(state.settings.pxPer5Min || 2) / ROOT_FONT_PX),
      minSegmentHeightEm: blockMinHeightEm(editing),
      smart: state.settings.smartWeekGrid !== false,
      strategy: state.settings.weekLayoutStrategy
    });
  }

  function projectionEm(column: DayColumn, atAbsMin: number, layout = renderLayout): number {
    return projectAbsMinute(column, atAbsMin, layout);
  }

  function rowHeightEm(column: DayColumn, from: number, to: number, minHeightEm: number, layout = renderLayout): number {
    return rangeHeightEm(column, from, to, layout, minHeightEm);
  }

  function rowHeightStyle(column: DayColumn, from: number, to: number, minHeightEm = MIN_GAP_HEIGHT_EM, layout = renderLayout): string {
    const height = rowHeightEm(column, from, to, minHeightEm, layout);
    const minHeight = layout.smart ? 0 : minHeightEm;
    return `height:${weekUnit(height)};min-height:${weekUnit(minHeight)}`;
  }

  function offsetEm(column: DayColumn, atAbsMin: number, layout = renderLayout): number {
    return projectionEm(column, atAbsMin, layout);
  }

  function dayStartOffsetStyle(column: DayColumn): string {
    return `height:${weekUnit(dayOffsetsEm(column, renderLayout).startOffset)}`;
  }

  function dayEndOffsetStyle(column: DayColumn): string {
    return `height:${weekUnit(dayOffsetsEm(column, renderLayout).endOffset)}`;
  }

  function layoutClock(column: DayColumn, axisMin: number, layout: WeekLayout): string {
    return formatClock(absMinuteFromAxis(column, axisMin, layout), state);
  }

  function logWeekMap(dayColumns: DayColumn[], columnRowsList: ColumnRow[][], layout: WeekLayout): void {
    if (typeof console === "undefined") return;
    const description = describeWeekLayout(dayColumns, columnRowsList, layout);
    console.groupCollapsed(`[rythm] Week map: ${description.smart ? description.strategy : "uniform"}, fbt ${Math.round(description.fallbackTimeMin)}м, height ${description.heightPx.toFixed(1)}px / ${description.heightEm.toFixed(2)}em`);
    (description.days as WeekMapDay[]).forEach((day) => {
      const column = day.column;
      console.groupCollapsed(`${column.label}: ${formatClock(column.start, state)} -> ${formatClock(column.end, state)}, top ${day.startOffsetPx.toFixed(1)}px / ${day.startOffsetEm.toFixed(2)}em, bottom ${day.endOffsetPx.toFixed(1)}px / ${day.endOffsetEm.toFixed(2)}em`);
      console.table(day.points.map((point: WeekMapPoint) => ({
        point: point.label,
        time: formatClock(point.atAbsMin, state),
        absMin: point.atAbsMin,
        duration: point.durationMin == null ? "" : durationText(point.durationMin),
        yPx: point.yPx.toFixed(1),
        yEm: point.yEm.toFixed(2)
      })));
      console.groupEnd();
    });
    console.table((description.segments as WeekMapSegment[]).map((segment) => ({
      from: layoutClock(dayColumns[0], segment.fromAxisMin, layout),
      to: layoutClock(dayColumns[0], segment.toAxisMin, layout),
      durationMin: segment.durationMin,
      yPx: segment.yPx.toFixed(1),
      yEm: segment.yEm.toFixed(2),
      heightPx: segment.heightPx.toFixed(1),
      heightEm: segment.heightEm.toFixed(2)
    })));
    console.groupEnd();
  }

  function hourRules(column: DayColumn): TimeRule[] {
    if (state.settings.smartWeekGrid === false) return [];
    const firstHour = Math.ceil(column.start / 60) * 60;
    const rules: TimeRule[] = [];
    for (let at = firstHour; at < column.end; at += 60) {
      if (at <= column.start) continue;
      rules.push({ id: `${column.index}-${at}`, topEm: 0.5 + offsetEm(column, at, renderLayout) });
    }
    return rules;
  }

  function blockStyle(column: DayColumn, activity: Activity | undefined, item: ActivityTimelineItem, editing: boolean): string {
    const color = safeColor(activity ? activity.color : "#e5e7eb");
    const background = colorWithAlpha(color, activity?.opacity ?? 1);
    return `${rowHeightStyle(column, item.startAbsMin, item.endAbsMin, blockMinHeightEm(editing))};--block-bg:${background};--block-ink:${color};--block-text:${textColor(color)}`;
  }

  function floatingRowHeightStyle(from: number, to: number, minHeightEm = MIN_GAP_HEIGHT_EM): string {
    const durationSlots = Math.max(1, (to - from) / renderLayout.step);
    const height = Math.max(minHeightEm, durationSlots * renderLayout.baseSlotEm);
    return `height:${weekUnit(height)};min-height:${weekUnit(minHeightEm)}`;
  }

  function floatingBlockStyle(activity: Activity | undefined, item: ActivityTimelineItem, editing: boolean): string {
    const color = safeColor(activity ? activity.color : "#e5e7eb");
    const background = colorWithAlpha(color, activity?.opacity ?? 1);
    return `${floatingRowHeightStyle(item.startAbsMin, item.endAbsMin, blockMinHeightEm(editing))};--block-bg:${background};--block-ink:${color};--block-text:${textColor(color)}`;
  }

  function isCompact(item: ActivityTimelineItem): boolean {
    return item.endAbsMin - item.startAbsMin <= 15;
  }

  function shouldShowEndTime(rows: ColumnRow[], rowIndex: number, item: ActivityTimelineItem): boolean {
    const next = rows[rowIndex + 1];
    return !(next?.type === "block" && next.item.startAbsMin === item.endAbsMin);
  }

  function itemOverlaps(item: ActivityTimelineItem): boolean {
    return state.timeline.some((entry) =>
      entry.type === "activity" &&
      entry.id !== item.id &&
      item.startAbsMin < entry.endAbsMin &&
      item.endAbsMin > entry.startAbsMin
    );
  }

  function isSleepItem(item: ActivityTimelineItem): boolean {
    return item.systemRole === "sleep" || item.activityId === state.settings.sleepActivityId;
  }

  function isOutsideDay(item: ActivityTimelineItem, column: DayColumn): boolean {
    return !isSleepItem(item) && (item.startAbsMin < column.start || item.endAbsMin > column.end);
  }

  function nextColumnStart(columnIndex: number): number {
    return columns[columnIndex + 1]?.start ?? ((columns[0]?.start ?? 0) + WEEK_MIN);
  }

  function blocksAfterDayEnd(column: DayColumn, columnIndex: number): ActivityTimelineItem[] {
    if (!column.marker) return [];
    const gapEnd = nextColumnStart(columnIndex);
    return (state.timeline || [])
      .filter((item): item is ActivityTimelineItem =>
        item.type === "activity" &&
        !isSleepItem(item) &&
        item.startAbsMin >= column.end &&
        item.startAbsMin < gapEnd
      )
      .slice()
      .sort((a, b) => a.startAbsMin - b.startAbsMin || a.endAbsMin - b.endAbsMin);
  }

  type ColumnRow =
    | { type: "gap"; id: string; from: number; to: number }
    | { type: "block"; id: string; item: ActivityTimelineItem };

  function columnRows(column: DayColumn): ColumnRow[] {
    const rows: ColumnRow[] = [];
    let cursor = column.start;
    blocksInColumn(state, column).forEach((item) => {
      if (item.startAbsMin > cursor) {
        rows.push({ type: "gap", id: `gap-${column.index}-${cursor}`, from: cursor, to: item.startAbsMin });
      }
      rows.push({ type: "block", id: item.id, item });
      cursor = Math.max(cursor, item.endAbsMin);
    });
    if (column.end > cursor) {
      rows.push({ type: "gap", id: `gap-${column.index}-${cursor}`, from: cursor, to: column.end });
    }
    return rows;
  }

  function columnAfterRows(column: DayColumn, columnIndex: number): ColumnRow[] {
    const items = [
      ...blocksAfterDayEnd(column, columnIndex)
    ].sort((a, b) => a.startAbsMin - b.startAbsMin || a.endAbsMin - b.endAbsMin);
    const rows: ColumnRow[] = [];
    let cursor = column.end;
    items.forEach((item) => {
      if (item.startAbsMin > cursor) {
        rows.push({ type: "gap", id: `after-gap-${column.index}-${cursor}`, from: cursor, to: item.startAbsMin });
      }
      rows.push({ type: "block", id: `after-${item.id}`, item });
      cursor = Math.max(cursor, item.endAbsMin);
    });
    return rows;
  }

  function insertAt(atAbsMin: number, freeUntilAbsMin: number): void {
    if (!$editMode) {
      showToast("Включите режим редактирования.");
      return;
    }
    if ($selectedSystem === "dayEnd") {
      addDayEndAt(atAbsMin);
      return;
    }
    if ($selectedSystem === "dayStart") {
      addDayStartAt(atAbsMin);
      return;
    }
    if (!$selectedActivityId) return;
    const current = get(appState);
    if (!current) return;
    const activity = activityMap(current).get($selectedActivityId);
    if (!activity) return;
    const step = current.settings.timeStepMin || 5;
    const startAbsMin = clampToStep(atAbsMin, step);
    const defaultDuration = Math.max(step, clampToStep(activity.defaultDurationMin, step));
    const freeDuration = Number.isFinite(freeUntilAbsMin) ? Math.max(0, freeUntilAbsMin - startAbsMin) : defaultDuration;
    const freeDurationByStep = Math.floor(freeDuration / step) * step;
    const duration = Math.max(step, Number.isFinite(freeUntilAbsMin) ? Math.min(defaultDuration, freeDurationByStep || defaultDuration) : defaultDuration);
    if (duration < step) {
      showToast("В этом промежутке меньше 5 минут.");
      return;
    }
    const endAbsMin = startAbsMin + duration;
    selectedActivityId.set(null);
    selectedSystem.set(null);
    onOpenDraftItem({ activityId: activity.id, startAbsMin, endAbsMin });
  }

  function addDayEndAt(atAbsMin: number): void {
    mutateState((draft) => {
      const step = draft.settings.timeStepMin || 5;
      draft.timeline.push({
        id: uid("marker"),
        type: "dayEnd",
        atAbsMin: clampToStep(atAbsMin, step),
        createdAt: now(),
        updatedAt: now()
      });
    });
  }

  function addDayStartAt(atAbsMin: number): void {
    mutateState((draft) => {
      const step = draft.settings.timeStepMin || 5;
      draft.timeline.push({
        id: uid("start"),
        type: "dayStart",
        atAbsMin: clampToStep(atAbsMin, step),
        createdAt: now(),
        updatedAt: now()
      });
    });
  }

  function blockClick(id: string): void {
    if (Date.now() < suppressClickUntil) return;
    if ($selectedActivityId && $editMode) {
      const item = state.timeline.find((entry): entry is ActivityTimelineItem => entry.type === "activity" && entry.id === id);
      const activity = $selectedActivityId ? map.get($selectedActivityId) : null;
      if (!item || !activity) return;
      if (item.systemRole === "sleep") {
        showToast("Сон нельзя заменить другой активностью.");
        selectedActivityId.set(null);
        return;
      }
      const step = state.settings.timeStepMin || 5;
      const duration = Math.max(step, clampToStep(activity.defaultDurationMin, step));
      selectedActivityId.set(null);
      selectedSystem.set(null);
      onOpenDraftItem({
        activityId: activity.id,
        startAbsMin: item.startAbsMin,
        endAbsMin: item.startAbsMin + duration,
        replaceItemId: item.id
      });
      return;
    }
    const timestamp = Date.now();
    if (lastTap.id === id && timestamp - lastTap.at < 360) {
      onOpenItem(id);
      lastTap = { id: "", at: 0 };
      return;
    }
    lastTap = { id, at: timestamp };
  }

  function blockKeydown(event: KeyboardEvent, id: string): void {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    if ($selectedActivityId && $editMode) {
      blockClick(id);
      return;
    }
    onOpenItem(id);
  }

  function updateItem(id: string, patch: Partial<ActivityTimelineItem>): void {
    mutateState((draft) => {
      const item = draft.timeline.find((entry) => entry.type === "activity" && entry.id === id);
      if (!item || item.type !== "activity") return;
      if (item.systemRole === "sleep") {
        const endMarker = draft.timeline.find((entry): entry is DayEndTimelineItem => entry.type === "dayEnd" && entry.atAbsMin === item.startAbsMin);
        const startMarker = draft.timeline.find((entry): entry is DayStartTimelineItem => entry.type === "dayStart" && entry.atAbsMin === item.endAbsMin);
        if (endMarker && patch.startAbsMin != null) {
          endMarker.atAbsMin = Math.min(patch.startAbsMin, item.endAbsMin - (draft.settings.timeStepMin || 5));
          item.startAbsMin = endMarker.atAbsMin;
          endMarker.updatedAt = now();
        }
        if (startMarker && patch.endAbsMin != null) {
          startMarker.atAbsMin = Math.max(patch.endAbsMin, item.startAbsMin + (draft.settings.timeStepMin || 5));
          item.endAbsMin = startMarker.atAbsMin;
          startMarker.updatedAt = now();
        }
        item.updatedAt = now();
        return;
      }
      Object.assign(item, patch, { updatedAt: now() });
    });
  }

  function updateStart(item: ActivityTimelineItem, value: string): void {
    const step = state.settings.timeStepMin || 5;
    const next = clampToStep(parseClock(value, item.startAbsMin, state), step);
    updateItem(item.id, { startAbsMin: Math.min(next, item.endAbsMin - step) });
  }

  function updateEnd(item: ActivityTimelineItem, value: string): void {
    const step = state.settings.timeStepMin || 5;
    let next = clampToStep(parseClock(value, item.endAbsMin, state), step);
    while (next <= item.startAbsMin) next += DAY_MIN;
    updateItem(item.id, { endAbsMin: Math.max(next, item.startAbsMin + step) });
  }

  function updateDuration(item: ActivityTimelineItem, value: string | number): void {
    const step = state.settings.timeStepMin || 5;
    const duration = Math.max(step, clampToStep(value, step));
    updateItem(item.id, { endAbsMin: item.startAbsMin + duration });
  }

  function updateDurationParts(item: ActivityTimelineItem, hours: string | number, minutes: string | number): void {
    updateDuration(item, Number(hours || 0) * 60 + Number(minutes || 0));
  }

  function bodyPointerY(event: PointerEvent, body: HTMLElement): number {
    const rect = body.getBoundingClientRect();
    const styles = getComputedStyle(body);
    const paddingTop = Number.parseFloat(styles.paddingTop) || 0;
    return Math.max(0, event.clientY - rect.top - paddingTop);
  }

  function bodyFontPx(body: HTMLElement): number {
    return Number.parseFloat(getComputedStyle(body).fontSize) || ROOT_FONT_PX;
  }

  function pointerEmInBody(event: PointerEvent, body: HTMLElement): number {
    return bodyPointerY(event, body) / bodyFontPx(body);
  }

  function minuteFromLayout(column: DayColumn, yEm: number, layout = renderLayout): number {
    return minuteFromY(column, yEm, layout);
  }

  function pointerMinuteInBody(event: PointerEvent, body: HTMLElement, layout = renderLayout): number {
    const columnIndex = Number(body.dataset.columnIndex);
    const column = columns[columnIndex];
    if (!column) return Number(body.dataset.start);
    return minuteFromLayout(column, pointerEmInBody(event, body), layout);
  }

  function dragScrollDeltaY(): number {
    if (!drag) return 0;
    if (drag.scrollContainer) return drag.scrollContainer.scrollTop - drag.scrollStartTop;
    return window.scrollY - drag.windowScrollStartY;
  }

  function minuteFromPointer(event: PointerEvent, duration = 0, pointerOffsetMin = 0): number | null {
    const body = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>(".day-body");
    if (!body) return null;
    const start = Number(body.dataset.start);
    const end = Number(body.dataset.end);
    const raw = pointerMinuteInBody(event, body, drag?.layout || renderLayout) - pointerOffsetMin;
    const maxStart = Math.max(start, end - duration);
    return Math.min(maxStart, Math.max(start, clampToStep(raw, state.settings.timeStepMin || 5)));
  }

  function minuteFromPointerTop(event: PointerEvent, duration = 0, pointerOffsetEm = 0): number | null {
    const body = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>(".day-body");
    if (!body) return null;
    const columnIndex = Number(body.dataset.columnIndex);
    const column = columns[columnIndex];
    if (!column) return null;
    const raw = minuteFromLayout(column, pointerEmInBody(event, body) - pointerOffsetEm, drag?.layout || renderLayout);
    const maxStart = Math.max(column.start, column.end - duration);
    return Math.min(maxStart, Math.max(column.start, clampToStep(raw, state.settings.timeStepMin || 5)));
  }

  function minuteFromOriginalColumn(event: PointerEvent, pointerOffsetMin = 0): number | null {
    if (!drag) return null;
    const body = document.querySelector<HTMLElement>(`.day-body[data-column-index="${drag.columnIndex}"]`);
    if (!body) return null;
    const raw = pointerMinuteInBody(event, body, drag.layout) - pointerOffsetMin;
    return Math.min(drag.columnEnd, Math.max(drag.columnStart, clampToStep(raw, state.settings.timeStepMin || 5)));
  }

  function startDrag(event: PointerEvent, item: ActivityTimelineItem, mode: "start" | "end" | "move"): void {
    if (!$editMode || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture?.(event.pointerId);
    const body = target.closest<HTMLElement>(".day-body");
    const scrollContainer = target.closest<HTMLElement>(".week-scroll");
    const columnIndex = body ? Number(body.dataset.columnIndex) : columns.findIndex((column) => item.startAbsMin >= column.start && item.startAbsMin < column.end);
    const layout = {
      step: renderLayout.step,
      baseSlotEm: renderLayout.baseSlotEm,
      pointsMin: renderLayout.pointsMin.slice(),
      segmentHeightsEm: renderLayout.segmentHeightsEm.slice(),
      cumulativeEm: renderLayout.cumulativeEm.slice(),
      smart: renderLayout.smart,
      strategy: renderLayout.strategy,
      fallbackTimeMin: renderLayout.fallbackTimeMin
    };
    const pointerMin = body ? pointerMinuteInBody(event, body, layout) : item.startAbsMin;
    const anchorMin = mode === "end" ? item.endAbsMin : item.startAbsMin;
    const pointerOffsetMin = body
      ? Math.min(item.endAbsMin - item.startAbsMin, Math.max(-(item.endAbsMin - item.startAbsMin), pointerMin - anchorMin))
      : 0;
    const column = columns[columnIndex];
    const pointerOffsetEm = body && column && mode === "move"
      ? Math.max(0, pointerEmInBody(event, body) - projectionEm(column, item.startAbsMin, layout))
      : 0;
    drag = {
      id: item.id,
      mode,
      pointerId: event.pointerId,
      pointerStartY: event.clientY,
      itemStart: item.startAbsMin,
      itemEnd: item.endAbsMin,
      duration: item.endAbsMin - item.startAbsMin,
      pointerOffsetMin,
      pointerOffsetEm,
      columnIndex,
      columnStart: body ? Number(body.dataset.start) : Math.floor(item.startAbsMin / DAY_MIN) * DAY_MIN,
      columnEnd: body ? Number(body.dataset.end) : Math.ceil(item.endAbsMin / DAY_MIN) * DAY_MIN,
      layout,
      target,
      scrollContainer,
      scrollStartTop: scrollContainer?.scrollTop || 0,
      windowScrollStartY: window.scrollY
    };
    window.addEventListener("pointermove", moveDrag);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
  }

  function moveDrag(event: PointerEvent): void {
    if (!drag) return;
    event.preventDefault();
    const step = state.settings.timeStepMin || 5;
    const fallbackSlotPx = Math.max(1, drag.layout.baseSlotEm * ROOT_FONT_PX);
    const delta = clampToStep(((event.clientY - drag.pointerStartY + dragScrollDeltaY()) / fallbackSlotPx) * drag.layout.step, step);
    if (drag.mode === "start") {
      const nextStart = minuteFromOriginalColumn(event, drag.pointerOffsetMin) ?? drag.itemStart + delta;
      updateItem(drag.id, { startAbsMin: Math.min(nextStart, drag.itemEnd - step) });
    } else if (drag.mode === "end") {
      const nextEnd = minuteFromOriginalColumn(event, drag.pointerOffsetMin) ?? drag.itemEnd + delta;
      updateItem(drag.id, { endAbsMin: Math.max(nextEnd, drag.itemStart + step) });
    } else {
      const nextStart = minuteFromPointerTop(event, drag.duration, drag.pointerOffsetEm) ?? minuteFromPointer(event, drag.duration, drag.pointerOffsetMin);
      if (nextStart == null) return;
      updateItem(drag.id, { startAbsMin: nextStart, endAbsMin: nextStart + drag.duration });
    }
  }

  function decorativeBlockStyle(activity: Activity | undefined, editing: boolean): string {
    const color = safeColor(activity ? activity.color : "#e5e7eb");
    const background = colorWithAlpha(color, activity?.opacity ?? 1);
    const minHeight = blockMinHeightEm(editing);
    return `height:${weekUnit(minHeight)};min-height:${weekUnit(minHeight)};--block-bg:${background};--block-ink:${color};--block-text:${textColor(color)}`;
  }

  function endDrag(event: PointerEvent): void {
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag.target.releasePointerCapture?.(event.pointerId);
    drag = null;
    suppressClickUntil = Date.now() + 250;
    window.removeEventListener("pointermove", moveDrag);
    window.removeEventListener("pointerup", endDrag);
    window.removeEventListener("pointercancel", endDrag);
  }
</script>

<div class="week-screen">
  {#if visibleWarnings.length}
    <div class="warnings">
      {#each visibleWarnings as warning}
        <div>{warning}</div>
      {/each}
    </div>
  {/if}
  <div class="week-scroll">
    <div class="week-grid" style={`--day-count:${columns.length};--five-min-height:${weekUnit(renderLayout.baseSlotEm)};--mobile-week-scale:${state.settings.mobileWeekScale || 1}`}>
      {#each columns as column, columnIndex}
        {@const rows = rowsByColumn[columnIndex] || []}
        <section class:is-extra={column.extra} class:is-today={column.index === todayIndex && !column.extra} class="day-column" tabindex="-1" aria-current={column.index === todayIndex && !column.extra ? "date" : undefined}>
          <header>
            <strong>{column.label}</strong>
            <span>{column.index === todayIndex && !column.extra ? "сегодня" : durationText(column.end - column.start)}</span>
          </header>
          <div class="day-body" data-column-index={columnIndex} data-start={column.start} data-end={column.end}>
            {#if hasCurrentTime(column)}
              <span class="current-time-marker" style={currentTimeStyle(column)} aria-label={`Сейчас ${formatClock(currentAbsMin, state)}`}></span>
            {/if}
            <div class="day-start-offset" style={dayStartOffsetStyle(column)} aria-hidden="true"></div>
            {#if column.startMarker}
              <button type="button" class="day-start" on:click={() => onOpenDayStart(column.startMarker!.id)}>
                <span>{formatClock(column.startMarker.atAbsMin, state)}</span>
                Начало дня
              </button>
            {/if}
            {#each hourRules(column) as rule (rule.id)}
              <span class="time-rule" style={`top:${weekUnit(rule.topEm)}`} aria-hidden="true"></span>
            {/each}
            {#each rows as row, rowIndex (row.id)}
              {#if row.type === "gap"}
                <button
                  type="button"
                  class:is-editable={$editMode}
                  class="gap"
                  style={rowHeightStyle(column, row.from, row.to)}
                  on:click={() => insertAt(row.from, row.to)}
                >
                  <span>{durationText(row.to - row.from)}</span>
                </button>
              {:else}
                {@const item = row.item}
                {@const activity = map.get(item.activityId)}
                {@const isCurrent = isCurrentActivity(item)}
                {@const showEndTime = isCurrent || shouldShowEndTime(rows, rowIndex, item)}
                <div
                  role="button"
                  tabindex="0"
                  class:is-editing={$editMode}
                  class:is-compact={isCompact(item)}
                  class:has-overlap={itemOverlaps(item)}
                  class:is-outside-day={isOutsideDay(item, column)}
                  class:is-current-activity={isCurrent}
                  class="week-block"
                  style={blockStyle(column, activity, item, $editMode)}
                  on:click={() => blockClick(item.id)}
                  on:keydown={(event) => blockKeydown(event, item.id)}
                  on:dblclick|stopPropagation={() => onOpenItem(item.id)}
                >
                  <span class="resize-trigger resize-trigger-start" aria-hidden="true" on:pointerdown={(event) => startDrag(event, item, "start")}></span>
                  <strong class="week-block-title" on:pointerdown={(event) => startDrag(event, item, "move")}>{activity ? activity.name : "Нет активности"}</strong>
                  {#if $editMode}
                    <span class="week-block-times is-editable">
                      <input aria-label="Начало" type="time" step="300" value={formatClock(item.startAbsMin, state)} on:click|stopPropagation on:pointerdown|stopPropagation on:change={(event) => updateStart(item, event.currentTarget.value)}>
                      <input aria-label="Конец" type="time" step="300" value={formatClock(item.endAbsMin, state)} on:click|stopPropagation on:pointerdown|stopPropagation on:change={(event) => updateEnd(item, event.currentTarget.value)}>
                    </span>
                    <span class="week-block-duration is-editable">
                      <input aria-label="Часы длительности" type="number" min="0" step="1" value={Math.floor((item.endAbsMin - item.startAbsMin) / 60)} on:click|stopPropagation on:pointerdown|stopPropagation on:change={(event) => updateDurationParts(item, event.currentTarget.value, (item.endAbsMin - item.startAbsMin) % 60)}>
                      <input aria-label="Минуты длительности" type="number" min="0" max="55" step="5" value={(item.endAbsMin - item.startAbsMin) % 60} on:click|stopPropagation on:pointerdown|stopPropagation on:change={(event) => updateDurationParts(item, Math.floor((item.endAbsMin - item.startAbsMin) / 60), event.currentTarget.value)}>
                    </span>
                  {:else}
                    <span class:has-single-time={!showEndTime} class="week-block-times">
                      <span>{formatClock(item.startAbsMin, state)}</span>
                      {#if showEndTime}
                        <span>{formatClock(item.endAbsMin, state)}</span>
                      {/if}
                    </span>
                    <em class="week-block-duration">{durationText(item.endAbsMin - item.startAbsMin)}</em>
                  {/if}
                  {#if activity?.archived}<small>архив</small>{/if}
                  <span class="resize-trigger resize-trigger-end" aria-hidden="true" on:pointerdown={(event) => startDrag(event, item, "end")}></span>
                </div>
              {/if}
            {/each}
            {#if column.marker}
              {@const marker = column.marker}
              <button type="button" class="day-end" on:click={() => onOpenDayEnd(marker.id)}>
                <span>{formatClock(marker.atAbsMin, state)}</span>
                Конец дня
              </button>
            {/if}
            {#each afterRowsByColumn[columnIndex] || [] as row, rowIndex (row.id)}
              {#if row.type === "gap"}
                <button
                  type="button"
                  class:is-editable={$editMode}
                  class="gap after-day-gap"
                  style={floatingRowHeightStyle(row.from, row.to)}
                  on:click={() => insertAt(row.from, row.to)}
                >
                  <span>{durationText(row.to - row.from)}</span>
                </button>
              {:else}
                {@const item = row.item}
                {@const activity = map.get(item.activityId)}
                {@const isCurrent = isCurrentActivity(item)}
                {@const showEndTime = isCurrent || shouldShowEndTime(afterRowsByColumn[columnIndex] || [], rowIndex, item)}
                <div
                  role="button"
                  tabindex="0"
                  class:is-editing={$editMode}
                  class:is-compact={isCompact(item)}
                  class:has-overlap={itemOverlaps(item)}
                  class:is-outside-day={isOutsideDay(item, column)}
                  class:system-sleep={isSleepItem(item)}
                  class:is-current-activity={isCurrent}
                  class="week-block"
                  style={floatingBlockStyle(activity, item, $editMode)}
                  on:click={() => blockClick(item.id)}
                  on:keydown={(event) => blockKeydown(event, item.id)}
                  on:dblclick|stopPropagation={() => onOpenItem(item.id)}
                >
                  <span class="resize-trigger resize-trigger-start" aria-hidden="true" on:pointerdown={(event) => startDrag(event, item, "start")}></span>
                  <strong class="week-block-title" on:pointerdown={(event) => startDrag(event, item, "move")}>{activity ? activity.name : (isSleepItem(item) ? "Сон" : "Нет активности")}</strong>
                  {#if $editMode}
                    <span class="week-block-times is-editable">
                      <input aria-label="Начало" type="time" step="300" value={formatClock(item.startAbsMin, state)} on:click|stopPropagation on:pointerdown|stopPropagation on:change={(event) => updateStart(item, event.currentTarget.value)}>
                      <input aria-label="Конец" type="time" step="300" value={formatClock(item.endAbsMin, state)} on:click|stopPropagation on:pointerdown|stopPropagation on:change={(event) => updateEnd(item, event.currentTarget.value)}>
                    </span>
                    <span class="week-block-duration is-editable">
                      <input aria-label="Часы длительности" type="number" min="0" step="1" value={Math.floor((item.endAbsMin - item.startAbsMin) / 60)} on:click|stopPropagation on:pointerdown|stopPropagation on:change={(event) => updateDurationParts(item, event.currentTarget.value, (item.endAbsMin - item.startAbsMin) % 60)}>
                      <input aria-label="Минуты длительности" type="number" min="0" max="55" step="5" value={(item.endAbsMin - item.startAbsMin) % 60} on:click|stopPropagation on:pointerdown|stopPropagation on:change={(event) => updateDurationParts(item, Math.floor((item.endAbsMin - item.startAbsMin) / 60), event.currentTarget.value)}>
                    </span>
                  {:else}
                    <span class:has-single-time={!showEndTime} class="week-block-times">
                      <span>{formatClock(item.startAbsMin, state)}</span>
                      {#if showEndTime}
                        <span>{formatClock(item.endAbsMin, state)}</span>
                      {/if}
                    </span>
                    <em class="week-block-duration">{durationText(item.endAbsMin - item.startAbsMin)}</em>
                  {/if}
                  {#if activity?.archived}<small>архив</small>{/if}
                  <span class="resize-trigger resize-trigger-end" aria-hidden="true" on:pointerdown={(event) => startDrag(event, item, "end")}></span>
                </div>
              {/if}
            {/each}
            <div class="day-end-offset" style={dayEndOffsetStyle(column)} aria-hidden="true"></div>
            {#if sleepAfterColumn(state, column)}
              {@const sleep = sleepAfterColumn(state, column)!}
              {@const activity = map.get(sleep.activityId)}
              <div
                role="button"
                tabindex="0"
                class:is-editing={$editMode}
                class:is-compact={isCompact(sleep)}
                class="week-block system-sleep"
                style={decorativeBlockStyle(activity, $editMode)}
                on:click={() => blockClick(sleep.id)}
                on:keydown={(event) => blockKeydown(event, sleep.id)}
                on:dblclick|stopPropagation={() => onOpenItem(sleep.id)}
              >
                <span class="resize-trigger resize-trigger-start" aria-hidden="true" on:pointerdown={(event) => startDrag(event, sleep, "start")}></span>
                <strong class="week-block-title" on:pointerdown={(event) => startDrag(event, sleep, "move")}>{activity ? activity.name : "Сон"}</strong>
                {#if $editMode}
                  <span class="week-block-times is-editable">
                    <input aria-label="Начало" type="time" step="300" value={formatClock(sleep.startAbsMin, state)} on:click|stopPropagation on:pointerdown|stopPropagation on:change={(event) => updateStart(sleep, event.currentTarget.value)}>
                    <input aria-label="Конец" type="time" step="300" value={formatClock(sleep.endAbsMin, state)} on:click|stopPropagation on:pointerdown|stopPropagation on:change={(event) => updateEnd(sleep, event.currentTarget.value)}>
                  </span>
                  <span class="week-block-duration is-editable">
                    <input aria-label="Часы длительности" type="number" min="0" step="1" value={Math.floor((sleep.endAbsMin - sleep.startAbsMin) / 60)} on:click|stopPropagation on:pointerdown|stopPropagation on:change={(event) => updateDurationParts(sleep, event.currentTarget.value, (sleep.endAbsMin - sleep.startAbsMin) % 60)}>
                    <input aria-label="Минуты длительности" type="number" min="0" max="55" step="5" value={(sleep.endAbsMin - sleep.startAbsMin) % 60} on:click|stopPropagation on:pointerdown|stopPropagation on:change={(event) => updateDurationParts(sleep, Math.floor((sleep.endAbsMin - sleep.startAbsMin) / 60), event.currentTarget.value)}>
                  </span>
                {:else}
                  <span class="week-block-times">
                    <span>{formatClock(sleep.startAbsMin, state)}</span>
                    <span>{formatClock(sleep.endAbsMin, state)}</span>
                  </span>
                  <em class="week-block-duration">{durationText(sleep.endAbsMin - sleep.startAbsMin)}</em>
                {/if}
                <span class="resize-trigger resize-trigger-end" aria-hidden="true" on:pointerdown={(event) => startDrag(event, sleep, "end")}></span>
              </div>
            {/if}
          </div>
        </section>
      {/each}
    </div>
  </div>
</div>
