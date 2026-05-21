<script lang="ts">
  import { activeActivities, mutateState } from "../lib/stores";
  import { activityMap, clampToStep, DAY_MIN, durationText, formatClock, now, parseClock, safeColor, uid } from "../lib/state";
  import type { ActivityTimelineItem, DayEndTimelineItem, RythmState } from "../lib/types";
  import Modal from "./Modal.svelte";
  import PickerTree from "./PickerTree.svelte";

  export let state: RythmState;
  export let itemId: string | null = null;
  export let markerId: string | null = null;
  export let draftItem: { activityId: string; startAbsMin: number; endAbsMin: number; replaceItemId?: string } | null = null;
  export let open: boolean = false;
  export let onClose: () => void = () => {};

  let activityId = "";
  let startValue = "";
  let endValue = "";
  let durationMin = 5;
  let durationHours = 0;
  let durationMinutes = 5;
  let markerTime = "";
  let error = "";
  let pickerOpen = false;
  let splitMode = false;
  let splitFirst = 5;

  $: item = itemId ? state.timeline.find((entry): entry is ActivityTimelineItem => entry.type === "activity" && entry.id === itemId) : null;
  $: marker = markerId ? state.timeline.find((entry): entry is DayEndTimelineItem => entry.type === "dayEnd" && entry.id === markerId) : null;
  $: map = state ? activityMap(state) : new Map();
  $: currentActivity = item || draftItem ? map.get(activityId || item?.activityId || draftItem?.activityId || "") : null;
  $: title = marker ? "Конец дня" : splitMode ? "Распил блока" : draftItem ? "Добавить в неделю" : "Блок недели";
  $: if (open) {
    if (item) {
      activityId = item.activityId;
      startValue = formatClock(item.startAbsMin, state);
      endValue = formatClock(item.endAbsMin, state);
      setDuration(item.endAbsMin - item.startAbsMin);
      splitFirst = Math.floor(durationMin / 2 / 5) * 5;
      error = "";
    }
    if (draftItem) {
      activityId = draftItem.activityId;
      startValue = formatClock(draftItem.startAbsMin, state);
      endValue = formatClock(draftItem.endAbsMin, state);
      setDuration(draftItem.endAbsMin - draftItem.startAbsMin);
      splitMode = false;
      error = "";
    }
    if (marker) {
      markerTime = formatClock(marker.atAbsMin, state);
      error = "";
    }
  }

  function setDuration(minutes: number): void {
    durationMin = Math.max(5, Math.round(Number(minutes || 0)));
    durationHours = Math.floor(durationMin / 60);
    durationMinutes = durationMin % 60;
  }

  function durationFromParts(): number {
    return Math.max(5, Number(durationHours || 0) * 60 + Number(durationMinutes || 0));
  }

  function updateEndFromStart() {
    const fallbackStart = item?.startAbsMin ?? draftItem?.startAbsMin;
    if (fallbackStart == null) return;
    const start = parseClock(startValue, fallbackStart, state);
    setDuration(durationFromParts());
    endValue = formatClock(start + durationMin, state);
  }

  function updateDurationFromEnd() {
    const fallbackStart = item?.startAbsMin ?? draftItem?.startAbsMin;
    const fallbackEnd = item?.endAbsMin ?? draftItem?.endAbsMin;
    if (fallbackStart == null || fallbackEnd == null) return;
    const start = parseClock(startValue, fallbackStart, state);
    let end = parseClock(endValue, fallbackEnd, state);
    while (end <= start) end += DAY_MIN;
    setDuration(end - start);
  }

  function updateEndFromDuration() {
    const fallbackStart = item?.startAbsMin ?? draftItem?.startAbsMin;
    if (fallbackStart == null) return;
    const start = parseClock(startValue, fallbackStart, state);
    setDuration(durationFromParts());
    endValue = formatClock(start + durationMin, state);
  }

  function saveItem() {
    if (!item && !draftItem) return;
    const step = state.settings.timeStepMin || 5;
    const fallbackStart = item?.startAbsMin ?? draftItem!.startAbsMin;
    const start = clampToStep(parseClock(startValue, fallbackStart, state), step);
    const duration = clampToStep(durationFromParts(), step);
    const end = start + Math.max(5, duration);
    mutateState((draft) => {
      if (item) {
        const entry = draft.timeline.find((row) => row.id === item.id);
        if (!entry || entry.type !== "activity") return;
        entry.activityId = activityId;
        entry.startAbsMin = start;
        entry.endAbsMin = end;
        entry.updatedAt = now();
        return;
      }
      if (!draftItem) return;
      draft.timeline = draft.timeline.filter((entry) => entry.id !== draftItem.replaceItemId);
      draft.timeline.push({
        id: uid("item"),
        type: "activity",
        activityId,
        startAbsMin: start,
        endAbsMin: end,
        createdAt: now(),
        updatedAt: now()
      });
    });
    onClose();
  }

  function deleteItem() {
    if (!item) return;
    mutateState((draft) => {
      draft.timeline = draft.timeline.filter((entry) => entry.id !== item.id);
    });
    onClose();
  }

  function splitItem() {
    if (!item) return;
    const total = item.endAbsMin - item.startAbsMin;
    const first = Math.min(total - 5, Math.max(5, clampToStep(splitFirst, state.settings.timeStepMin || 5)));
    mutateState((draft) => {
      const index = draft.timeline.findIndex((entry) => entry.id === item.id);
      const original = draft.timeline[index];
      if (!original || original.type !== "activity") return;
      const splitAt = original.startAbsMin + first;
      draft.timeline.splice(index, 1,
        Object.assign({}, original, { id: uid("item"), endAbsMin: splitAt, updatedAt: now() }),
        Object.assign({}, original, { id: uid("item"), startAbsMin: splitAt, updatedAt: now() })
      );
    });
    onClose();
  }

  function saveMarker() {
    if (!marker) return;
    mutateState((draft) => {
      const entry = draft.timeline.find((row) => row.id === marker.id);
      if (!entry || entry.type !== "dayEnd") return;
      const next = parseClock(markerTime, marker.atAbsMin, state);
      entry.atAbsMin = clampToStep(next, draft.settings.timeStepMin || 5);
      entry.updatedAt = now();
    });
    onClose();
  }

  function deleteMarker() {
    if (!marker) return;
    if (!confirm("Удалить системный конец дня?")) return;
    mutateState((draft) => {
      draft.timeline = draft.timeline.filter((entry) => entry.id !== marker.id);
    });
    onClose();
  }
</script>

<Modal {open} {title} onClose={onClose}>
  {#if marker}
    <label class="form-label">Время
      <input class="form-control" type="time" step="300" bind:value={markerTime}>
    </label>
    <div class="dialog-actions">
      <button type="button" class="btn btn-outline-danger" on:click={deleteMarker}>Удалить</button>
      <button type="button" class="btn btn-dark" on:click={saveMarker}>Сохранить</button>
    </div>
  {:else if item && splitMode}
    <p>Текущая длительность: {durationText(item.endAbsMin - item.startAbsMin)}</p>
    <label class="form-label">Первая часть, мин
      <input class="form-control" type="number" min="5" max={item.endAbsMin - item.startAbsMin - 5} step="5" bind:value={splitFirst}>
    </label>
    <div class="dialog-actions">
      <button type="button" class="btn btn-outline-secondary" on:click={() => (splitMode = false)}>Назад</button>
      <button type="button" class="btn btn-dark" on:click={splitItem}>Распилить</button>
    </div>
  {:else if item || draftItem}
    <div class="form-label">Активность</div>
    <button class="activity-select-button" type="button" on:click={() => (pickerOpen = true)}>
      <span class="activity-marker" style={`--marker:${safeColor(currentActivity ? currentActivity.color : "#cbd5e1")}`}></span>
      <span>
        <strong>{currentActivity ? currentActivity.name : "Нет активности"}</strong>
        <small>{currentActivity ? durationText(currentActivity.defaultDurationMin) : ""}</small>
      </span>
      <i class="bi bi-chevron-right" aria-hidden="true"></i>
    </button>
    <div class="form-grid">
      <label class="form-label">Начало
        <input class="form-control" type="time" step="300" bind:value={startValue} on:change={updateEndFromStart}>
      </label>
      <label class="form-label">Конец
        <input class="form-control" type="time" step="300" bind:value={endValue} on:change={updateDurationFromEnd}>
      </label>
      <fieldset class="duration-field">
        <legend>Длительность</legend>
        <label class="form-label">Часы
          <input class="form-control" type="number" min="0" step="1" bind:value={durationHours} on:change={updateEndFromDuration}>
        </label>
        <label class="form-label">Минуты
          <input class="form-control" type="number" min="0" max="55" step="5" bind:value={durationMinutes} on:change={updateEndFromDuration}>
        </label>
      </fieldset>
    </div>
    <small class="danger-text">{error}</small>
    <div class="dialog-actions">
      {#if item}
        <button type="button" class="btn btn-outline-danger" on:click={deleteItem}>Удалить</button>
        <button type="button" class="btn btn-outline-secondary" on:click={() => (splitMode = true)}>Распилить</button>
      {/if}
      <button type="button" class="btn btn-dark" on:click={saveItem}>{draftItem ? "Добавить" : "Сохранить"}</button>
    </div>
  {/if}
</Modal>

<Modal open={pickerOpen} title="Закуп активности" scrollable={true} onClose={() => (pickerOpen = false)}>
  <PickerTree
    activities={$activeActivities}
    selectedId={activityId}
    allowSystem={false}
    onPick={(id) => {
      activityId = id;
      pickerOpen = false;
    }}
  />
</Modal>
