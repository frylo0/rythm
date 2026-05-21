<script lang="ts">
  import { mutateState } from "../lib/stores";
  import { clampToStep, getDepth, now, safeColor, uid } from "../lib/state";
  import type { Activity, RythmState } from "../lib/types";
  import ColorPicker from "./ColorPicker.svelte";
  import Modal from "./Modal.svelte";

  export let state: RythmState;
  export let activityId: string | null = null;
  export let open: boolean = false;
  export let onClose: () => void = () => {};

  let name = "";
  let parentId = "";
  let defaultDurationMin = 60;
  let color = "#3b82f6";
  let opacity = 1;
  let archived = false;

  $: activity = activityId ? state.activities.find((entry) => entry.id === activityId) : null;
  $: if (open) {
    name = activity ? activity.name : "";
    parentId = activity ? activity.parentId || "" : "";
    defaultDurationMin = activity ? activity.defaultDurationMin : 60;
    color = activity ? activity.color : "#3b82f6";
    opacity = activity ? activity.opacity ?? 1 : 1;
    archived = Boolean(activity?.archived);
  }
  $: parentChoices = state.activities.filter((item) => item.id !== activityId && getDepth(item, state) < 3);

  function save() {
    const trimmed = name.trim();
    if (!trimmed) return;
    mutateState((draft) => {
      if (activity) {
        const entry = draft.activities.find((row) => row.id === activityId);
        if (!entry) return;
        entry.name = trimmed;
        entry.parentId = parentId || null;
        entry.defaultDurationMin = Math.max(5, clampToStep(defaultDurationMin, draft.settings.timeStepMin || 5));
        entry.color = color;
        entry.opacity = Math.min(1, Math.max(0.08, Number(opacity || 1)));
        entry.archived = archived;
        entry.updatedAt = now();
      } else {
        draft.activities.push({
          id: uid("act"),
          parentId: parentId || null,
          name: trimmed,
          color,
          opacity: Math.min(1, Math.max(0.08, Number(opacity || 1))),
          defaultDurationMin: Math.max(5, clampToStep(defaultDurationMin, draft.settings.timeStepMin || 5)),
          archived: false,
          createdAt: now(),
          updatedAt: now()
        });
      }
    });
    onClose();
  }

  function remove() {
    if (activityId === state.settings.sleepActivityId) return;
    mutateState((draft) => {
      const used = draft.timeline.some((item) => item.type === "activity" && item.activityId === activityId);
      const hasChildren = draft.activities.some((item) => item.parentId === activityId);
      if (used || hasChildren) {
        const entry = draft.activities.find((row) => row.id === activityId);
        if (!entry) return;
        entry.archived = true;
        entry.updatedAt = now();
      } else {
        draft.activities = draft.activities.filter((row) => row.id !== activityId);
      }
    });
    onClose();
  }
</script>

<Modal {open} title={activity ? "Активность" : "Новая активность"} onClose={onClose}>
  <label class="form-label">Название
    <input class="form-control" bind:value={name} maxlength="60" required>
  </label>
  <label class="form-label">Родитель
    <select class="form-select" bind:value={parentId}>
      <option value="">Без родителя</option>
      {#each parentChoices as choice (choice.id)}
        <option value={choice.id}>{choice.name}</option>
      {/each}
    </select>
  </label>
  <div class="form-grid">
    <label class="form-label">Длительность, мин
      <input class="form-control" type="number" min="5" step="5" bind:value={defaultDurationMin}>
    </label>
    <label class="form-label">HEX
      <input class="form-control" bind:value={color} pattern="#[0-9a-fA-F]{6}">
    </label>
    <label class="form-label">Прозрачность, %
      <input class="form-control" type="range" min="8" max="100" step="1" value={Math.round(opacity * 100)} on:input={(event) => (opacity = Number(event.currentTarget.value) / 100)}>
      <small>{Math.round(opacity * 100)}%</small>
    </label>
  </div>
  <ColorPicker value={safeColor(color)} onPick={(next) => (color = next)} />
  <label class="check-line form-check">
    <input class="form-check-input" type="checkbox" bind:checked={archived}>
    Архив
  </label>
  <div class="dialog-actions">
    {#if activity && activity.id !== state.settings.sleepActivityId}
      <button type="button" class="btn btn-outline-danger" on:click={remove}>Удалить</button>
    {/if}
    <button type="button" class="btn btn-dark" on:click={save}>Сохранить</button>
  </div>
</Modal>
