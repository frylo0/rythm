<script lang="ts">
  import { del } from "../lib/storage";
  import { importState, mutateState, showToast } from "../lib/stores";
  import { formatClock } from "../lib/state";
  import { request } from "../lib/api";
  import type { RythmState, ThemeMode } from "../lib/types";
  import Modal from "./Modal.svelte";

  export let state: RythmState;
  export let open: boolean = false;
  export let onClose: () => void = () => {};

  let authEnabled = false;
  let startClock = "07:00";
  let scale = 2;
  let smartWeekGrid = true;
  let mobileWeekScale = 1;
  let theme: ThemeMode = "system";
  let glowEnabled = true;
  let jsonText = "";

  $: if (open && state) {
    authEnabled = Boolean(state.settings.authEnabled);
    startClock = formatClock(0, state);
    scale = state.settings.pxPer5Min || 2;
    smartWeekGrid = state.settings.smartWeekGrid !== false;
    mobileWeekScale = state.settings.mobileWeekScale || 1;
    theme = state.settings.theme || "system";
    glowEnabled = state.settings.glowEnabled !== false;
    jsonText = JSON.stringify(state, null, 2);
  }

  function save() {
    mutateState((draft) => {
      draft.settings.authEnabled = authEnabled;
      const [hours, minutes] = startClock.split(":").map(Number);
      draft.settings.weekStartClockMin = hours * 60 + minutes;
      draft.settings.pxPer5Min = Number(scale || 2);
      draft.settings.smartWeekGrid = smartWeekGrid;
      draft.settings.mobileWeekScale = Math.min(1.8, Math.max(0.7, Number(mobileWeekScale || 1)));
      draft.settings.theme = theme;
      draft.settings.glowEnabled = glowEnabled;
    });
    onClose();
  }

  function doImport() {
    try {
      importState(JSON.parse(jsonText));
      onClose();
    } catch {
      showToast("JSON не удалось прочитать.");
    }
  }

  async function resetCache() {
    await del("state");
    await del("dirty");
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
    showToast("Локальный кэш сброшен.");
  }

  async function logout() {
    await request("/api/auth/logout", { method: "POST" }).catch(() => {});
    location.reload();
  }
</script>

<Modal {open} title="Настройки" size="lg" onClose={onClose}>
  <label class="check-line form-check">
    <input class="form-check-input" type="checkbox" bind:checked={authEnabled}>
    Требовать пароль
  </label>
  <div class="form-grid">
    <label class="form-label">Старт недели
      <input class="form-control" type="time" step="300" bind:value={startClock}>
    </label>
    <label class="form-label">Высота 5 минут, px
      <input class="form-control" type="number" min="0.5" max="8" step="0.25" bind:value={scale}>
    </label>
    <label class="form-label">Мобильный масштаб недели
      <input class="form-control" type="number" min="0.7" max="1.8" step="0.05" bind:value={mobileWeekScale}>
    </label>
  </div>
  <label class="form-label">Тема
    <select class="form-select" bind:value={theme}>
      <option value="system">Как в системе</option>
      <option value="light">Светлая</option>
      <option value="dark">Тёмная</option>
    </select>
  </label>
  <label class="check-line form-check">
    <input class="form-check-input" type="checkbox" bind:checked={glowEnabled}>
    Включить glow-эффекты
  </label>
  <label class="check-line form-check">
    <input class="form-check-input" type="checkbox" bind:checked={smartWeekGrid}>
    Умная сетка недели
  </label>
  <label class="form-label">JSON
    <textarea class="form-control font-monospace" rows="8" bind:value={jsonText}></textarea>
  </label>
  <div class="dialog-actions wrap">
    <button type="button" class="btn btn-outline-secondary" on:click={resetCache}>Сбросить кэш</button>
    <button type="button" class="btn btn-outline-secondary" on:click={logout}>Выйти</button>
    <button type="button" class="btn btn-outline-secondary" on:click={doImport}>Импорт</button>
    <button type="button" class="btn btn-dark" on:click={save}>Сохранить</button>
  </div>
</Modal>
