<script lang="ts">
  import { activeActivities, currentView, editMode, selectedActivityId, selectedPurchase, selectedSystem } from "../lib/stores";
  import PickerTree from "./PickerTree.svelte";
  import Modal from "./Modal.svelte";

  let pickerOpen = false;
</script>

<aside
  class:is-picker-visible={$currentView === "week" && $editMode}
  class:is-picker-disabled={$currentView !== "week" || !$editMode}
  class="activity-picker"
>
  {#if $currentView !== "week" || !$editMode}
    <div class="picker-head">
      <strong>Закуп</strong>
    </div>
    <div class="selected-purchase is-muted">
      <span class="activity-marker"></span>
      <div>
        <strong>Недоступен</strong>
        <small>включите редактирование на странице недели</small>
      </div>
    </div>
  {:else}
    <div class="picker-head">
      <strong>Закуп</strong>
      <button
        type="button"
        class="btn btn-outline-secondary btn-sm"
        title="Сбросить выбор"
        on:click={() => {
          selectedActivityId.set(null);
          selectedSystem.set(null);
        }}
      >
        <i class="bi bi-x-lg" aria-hidden="true"></i>
      </button>
    </div>
    <button type="button" class="selected-purchase" style={`--marker:${$selectedPurchase.color}`} on:click={() => (pickerOpen = true)}>
      <span class="activity-marker"></span>
      <div>
        <strong>{$selectedPurchase.title}</strong>
        <small>{$selectedPurchase.meta}</small>
      </div>
    </button>
    <div class="picker-actions">
      <button type="button" class="btn btn-dark btn-sm app-btn" on:click={() => (pickerOpen = true)}>
        <i class={`bi ${$selectedPurchase.icon}`} aria-hidden="true"></i>
        <span>Выбрать</span>
      </button>
    </div>
    <div class="picker-hint">Клик по блоку в режиме редактирования заменит его выбранным закупом.</div>
  {/if}
</aside>

<Modal open={pickerOpen} title="Закуп активности" scrollable={true} onClose={() => (pickerOpen = false)}>
  <PickerTree
    activities={$activeActivities}
    selectedId={$selectedActivityId}
    selectedSystem={$selectedSystem}
    allowSystem={true}
    onPick={(id) => {
      selectedActivityId.set(id);
      selectedSystem.set(null);
      pickerOpen = false;
    }}
    onPickSystem={(system) => {
      selectedActivityId.set(null);
      selectedSystem.set(system);
      pickerOpen = false;
    }}
  />
</Modal>
