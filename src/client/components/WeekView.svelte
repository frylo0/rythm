<script lang="ts">
  import { onMount, tick } from "svelte";
  import { get } from "svelte/store";
  import { appState, editMode, mutateState, selectedActivityId, selectedSystem, showToast } from "../lib/stores";
  import {
    activityMap,
    blocksInColumn,
    canPlace,
    clampToStep,
    dayColumns,
    durationText,
    formatClock,
    now,
    safeColor,
    textColor,
    uid,
    validateState
  } from "../lib/state";
  import type { Activity, ActivityTimelineItem, DayColumn, RythmState } from "../lib/types";

  export let state: RythmState;
  export let onOpenItem: (id: string) => void = () => {};
  export let onOpenDayEnd: (id: string) => void = () => {};

  $: columns = dayColumns(state);
  $: map = activityMap(state);
  $: warnings = validateState(state);
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
    return `min-height:${px}px;--block-bg:${color};--block-text:${textColor(color)}`;
  }

  function gapHeight(from: number, to: number): string {
    return `min-height:${rowHeight(from, to)}px`;
  }

  function isCompact(item: ActivityTimelineItem): boolean {
    return item.endAbsMin - item.startAbsMin <= 15;
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
    const duration = Number.isFinite(freeUntilAbsMin) ? Math.min(defaultDuration, freeDurationByStep) : defaultDuration;
    if (duration < step) {
      showToast("В этом промежутке меньше 5 минут.");
      return;
    }
    const endAbsMin = startAbsMin + duration;
    if (!canPlace(current, { startAbsMin, endAbsMin })) {
      showToast("Недостаточно свободного места для дефолтной длительности.");
      return;
    }
    mutateState((draft) => {
      draft.timeline.push({
        id: uid("item"),
        type: "activity",
        activityId: activity.id,
        startAbsMin,
        endAbsMin,
        createdAt: now(),
        updatedAt: now()
      });
    });
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
    if ($selectedActivityId && $editMode) {
      mutateState((draft) => {
        const item = draft.timeline.find((entry) => entry.id === id);
        if (item?.type === "activity") {
          item.activityId = $selectedActivityId;
          item.updatedAt = now();
        }
      });
      return;
    }
    onOpenItem(id);
  }
</script>

<div class="week-screen">
  <div class="screen-head">
    <div>
      <h1>Неделя</h1>
    </div>
  </div>
  {#if warnings.length}
    <div class="warnings">
      {#each warnings as warning}
        <div>{warning}</div>
      {/each}
    </div>
  {/if}
  <div class="week-scroll">
    <div class="week-grid" style={`--day-count:${columns.length};--five-min-height:${state.settings.pxPer5Min || 2}px`}>
      {#each columns as column}
        {@const blocks = blocksInColumn(state, column)}
        <section class:is-extra={column.extra} class:is-today={column.index === todayIndex && !column.extra} class="day-column" tabindex="-1" aria-current={column.index === todayIndex && !column.extra ? "date" : undefined}>
          <header>
            <strong>{column.label}</strong>
            <span>{column.index === todayIndex && !column.extra ? "сегодня" : durationText(column.end - column.start)}</span>
          </header>
          <div class="day-body">
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
                <button
                  type="button"
                  class:is-editing={$editMode}
                  class:is-compact={isCompact(item)}
                  class="week-block"
                  style={blockStyle(activity, item)}
                  on:click={() => blockClick(item.id)}
                >
                  <span class="resize-trigger resize-trigger-start" aria-hidden="true"></span>
                  <strong class="week-block-title">{activity ? activity.name : "Нет активности"}</strong>
                  <span class="week-block-times">
                    <span>{formatClock(item.startAbsMin, state)}</span>
                    <span>{formatClock(item.endAbsMin, state)}</span>
                  </span>
                  <em class="week-block-duration">{durationText(item.endAbsMin - item.startAbsMin)}</em>
                  {#if activity?.archived}<small>архив</small>{/if}
                  <span class="resize-trigger resize-trigger-end" aria-hidden="true"></span>
                </button>
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
