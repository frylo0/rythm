<script lang="ts">
  import { onMount, tick } from "svelte";
  import { get } from "svelte/store";
  import { activeActivities, appState, editMode, mutateState, selectedActivityId, selectedSystem, showToast } from "../lib/stores";
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
    textColor,
    uid,
    validateState
  } from "../lib/state";
  import type { Activity, ActivityTimelineItem, DayColumn, RythmState } from "../lib/types";
  import Modal from "./Modal.svelte";
  import PickerTree from "./PickerTree.svelte";

  export let state: RythmState;
  export let onOpenItem: (id: string) => void = () => {};
  export let onOpenDraftItem: (draft: { activityId: string; startAbsMin: number; endAbsMin: number; replaceItemId?: string }) => void = () => {};
  export let onOpenDayEnd: (id: string) => void = () => {};

  let pickerOpen = false;
  let lastTap = { id: "", at: 0 };
  let suppressClickUntil = 0;
  let drag:
    | {
        id: string;
        mode: "start" | "end" | "move";
        pointerId: number;
        pointerStartY: number;
        itemStart: number;
        itemEnd: number;
        duration: number;
        columnStart: number;
        columnEnd: number;
      }
    | null = null;

  $: columns = dayColumns(state);
  $: map = activityMap(state);
  $: warnings = validateState(state);
  $: visibleWarnings = warnings.filter((warning) =>
    warning !== "Есть пересечения активностей." &&
    (!$editMode || warning !== "Есть активность, пересекающая системный конец дня.")
  );
  $: todayIndex = currentWeekdayIndex();

  function currentWeekdayIndex(): number {
    return (new Date().getDay() + 6) % 7;
  }

  async function focusToday(): Promise<void> {
    await tick();
    const today = document.querySelector<HTMLElement>(".day-column.is-today");
    if (!today) return;
    today.focus({ preventScroll: true });
    today.scrollIntoView({ block: "nearest", inline: "center" });
  }

  onMount(() => {
    focusToday();
  });

  function rowHeight(from: number, to: number): number {
    const duration = Math.max(0, to - from);
    return Math.max(20, (duration / 5) * (state.settings.pxPer5Min || 2));
  }

  function blockStyle(activity: Activity | undefined, item: ActivityTimelineItem): string {
    const px = rowHeight(item.startAbsMin, item.endAbsMin);
    const color = safeColor(activity ? activity.color : "#e5e7eb");
    const background = colorWithAlpha(color, activity?.opacity ?? 1);
    return `min-height:${px}px;--block-bg:${background};--block-ink:${color};--block-text:${textColor(color)}`;
  }

  function gapHeight(from: number, to: number): string {
    return `min-height:${rowHeight(from, to)}px`;
  }

  function isCompact(item: ActivityTimelineItem): boolean {
    return item.endAbsMin - item.startAbsMin <= 15;
  }

  function itemOverlaps(item: ActivityTimelineItem): boolean {
    return state.timeline.some((entry) =>
      entry.type === "activity" &&
      entry.id !== item.id &&
      item.startAbsMin < entry.endAbsMin &&
      item.endAbsMin > entry.startAbsMin
    );
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

  function insertAt(atAbsMin: number, freeUntilAbsMin: number): void {
    if (!$editMode) {
      showToast("Включите режим редактирования.");
      return;
    }
    if ($selectedSystem === "dayEnd") {
      addDayEndAt(atAbsMin);
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

  function blockClick(id: string): void {
    if (Date.now() < suppressClickUntil) return;
    if ($selectedActivityId && $editMode) {
      const item = state.timeline.find((entry): entry is ActivityTimelineItem => entry.type === "activity" && entry.id === id);
      const activity = $selectedActivityId ? map.get($selectedActivityId) : null;
      if (!item || !activity) return;
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

  function adjustMobileScale(delta: number): void {
    mutateState((draft) => {
      const current = draft.settings.mobileWeekScale || 1;
      draft.settings.mobileWeekScale = Math.min(1.8, Math.max(0.7, Math.round((current + delta) * 100) / 100));
    });
  }

  function minuteFromPointer(event: PointerEvent, duration = 0): number | null {
    const body = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>(".day-body");
    if (!body) return null;
    const start = Number(body.dataset.start);
    const end = Number(body.dataset.end);
    const rect = body.getBoundingClientRect();
    const scale = (state.settings.pxPer5Min || 2) / 5;
    const y = Math.max(0, event.clientY - rect.top - 8);
    const raw = start + y / scale;
    const maxStart = Math.max(start, end - duration);
    return Math.min(maxStart, Math.max(start, clampToStep(raw, state.settings.timeStepMin || 5)));
  }

  function minuteFromOriginalColumn(event: PointerEvent): number | null {
    if (!drag) return null;
    const body = document.querySelector<HTMLElement>(`.day-body[data-start="${drag.columnStart}"]`);
    if (!body) return null;
    const rect = body.getBoundingClientRect();
    const scale = (state.settings.pxPer5Min || 2) / 5;
    const y = Math.max(0, event.clientY - rect.top - 8);
    const raw = drag.columnStart + y / scale;
    return Math.min(drag.columnEnd, Math.max(drag.columnStart, clampToStep(raw, state.settings.timeStepMin || 5)));
  }

  function startDrag(event: PointerEvent, item: ActivityTimelineItem, mode: "start" | "end" | "move"): void {
    if (!$editMode || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const body = (event.currentTarget as HTMLElement).closest<HTMLElement>(".day-body");
    drag = {
      id: item.id,
      mode,
      pointerId: event.pointerId,
      pointerStartY: event.clientY,
      itemStart: item.startAbsMin,
      itemEnd: item.endAbsMin,
      duration: item.endAbsMin - item.startAbsMin,
      columnStart: body ? Number(body.dataset.start) : Math.floor(item.startAbsMin / DAY_MIN) * DAY_MIN,
      columnEnd: body ? Number(body.dataset.end) : Math.ceil(item.endAbsMin / DAY_MIN) * DAY_MIN
    };
    window.addEventListener("pointermove", moveDrag);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
  }

  function moveDrag(event: PointerEvent): void {
    if (!drag) return;
    event.preventDefault();
    const step = state.settings.timeStepMin || 5;
    const scale = (state.settings.pxPer5Min || 2) / 5;
    const delta = clampToStep((event.clientY - drag.pointerStartY) / scale, step);
    if (drag.mode === "start") {
      const nextStart = minuteFromOriginalColumn(event) ?? drag.itemStart + delta;
      updateItem(drag.id, { startAbsMin: Math.min(nextStart, drag.itemEnd - step) });
    } else if (drag.mode === "end") {
      const nextEnd = minuteFromOriginalColumn(event) ?? drag.itemEnd + delta;
      updateItem(drag.id, { endAbsMin: Math.max(nextEnd, drag.itemStart + step) });
    } else {
      const nextStart = minuteFromPointer(event, drag.duration);
      if (nextStart == null) return;
      updateItem(drag.id, { startAbsMin: nextStart, endAbsMin: nextStart + drag.duration });
    }
  }

  function endDrag(event: PointerEvent): void {
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag = null;
    suppressClickUntil = Date.now() + 250;
    window.removeEventListener("pointermove", moveDrag);
    window.removeEventListener("pointerup", endDrag);
    window.removeEventListener("pointercancel", endDrag);
  }
</script>

<div class="week-screen">
  <div class="screen-head">
    <div>
      <h1>Неделя</h1>
    </div>
    {#if $editMode}
      <div class="week-head-actions">
        <span class="mobile-scale-actions">
          <button class="btn btn-outline-secondary btn-sm icon-button" type="button" title="Уменьшить неделю" aria-label="Уменьшить неделю" on:click={() => adjustMobileScale(-0.05)}>
            <i class="bi bi-dash-lg" aria-hidden="true"></i>
          </button>
          <button class="btn btn-outline-secondary btn-sm icon-button" type="button" title="Увеличить неделю" aria-label="Увеличить неделю" on:click={() => adjustMobileScale(0.05)}>
            <i class="bi bi-plus-lg" aria-hidden="true"></i>
          </button>
        </span>
        <button class="btn btn-dark btn-sm icon-button" type="button" title="Добавить активность" aria-label="Добавить активность" on:click={() => (pickerOpen = true)}>
          <i class="bi bi-plus-lg" aria-hidden="true"></i>
        </button>
      </div>
    {/if}
  </div>
  {#if visibleWarnings.length}
    <div class="warnings">
      {#each visibleWarnings as warning}
        <div>{warning}</div>
      {/each}
    </div>
  {/if}
  <div class="week-scroll">
    <div class="week-grid" style={`--day-count:${columns.length};--five-min-height:${state.settings.pxPer5Min || 2}px;--mobile-week-scale:${state.settings.mobileWeekScale || 1}`}>
      {#each columns as column}
        {@const blocks = blocksInColumn(state, column)}
        <section class:is-extra={column.extra} class:is-today={column.index === todayIndex && !column.extra} class="day-column" tabindex="-1" aria-current={column.index === todayIndex && !column.extra ? "date" : undefined}>
          <header>
            <strong>{column.label}</strong>
            <span>{column.index === todayIndex && !column.extra ? "сегодня" : durationText(column.end - column.start)}</span>
          </header>
          <div class="day-body" data-start={column.start} data-end={column.end}>
            {#each columnRows(column) as row (row.id)}
              {#if row.type === "gap"}
                <button
                  type="button"
                  class:is-editable={$editMode}
                  class="gap"
                  style={gapHeight(row.from, row.to)}
                  on:click={() => insertAt(row.from, row.to)}
                >
                  <span>{durationText(row.to - row.from)}</span>
                </button>
              {:else}
                {@const item = row.item}
                {@const activity = map.get(item.activityId)}
                <div
                  role="button"
                  tabindex="0"
                  class:is-editing={$editMode}
                  class:is-compact={isCompact(item)}
                  class:has-overlap={itemOverlaps(item)}
                  class="week-block"
                  style={blockStyle(activity, item)}
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
                    <span class="week-block-times">
                      <span>{formatClock(item.startAbsMin, state)}</span>
                      <span>{formatClock(item.endAbsMin, state)}</span>
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
          </div>
        </section>
      {/each}
    </div>
  </div>
</div>

<Modal open={pickerOpen} title="Добавить в неделю" scrollable={true} onClose={() => (pickerOpen = false)}>
  <PickerTree
    activities={$activeActivities}
    selectedId={$selectedActivityId}
    selectedSystem={$selectedSystem}
    allowSystem={true}
    onPick={(id) => {
      selectedActivityId.set(id);
      selectedSystem.set(null);
      pickerOpen = false;
      showToast("Выберите место на неделе.");
    }}
    onPickSystem={(system) => {
      selectedActivityId.set(null);
      selectedSystem.set(system);
      pickerOpen = false;
      showToast("Выберите место конца дня.");
    }}
  />
</Modal>
