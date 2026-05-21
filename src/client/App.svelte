<script lang="ts">
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import ActivitiesView from "./components/ActivitiesView.svelte";
  import ActivityDialog from "./components/ActivityDialog.svelte";
  import ItemDialog from "./components/ItemDialog.svelte";
  import SettingsDialog from "./components/SettingsDialog.svelte";
  import StatsView from "./components/StatsView.svelte";
  import WeekView from "./components/WeekView.svelte";
  import { request } from "./lib/api";
  import { createSync } from "./lib/sync";
  import {
    appState,
    authRequired,
    currentView,
    editMode,
    setState,
    setSyncService,
    showToast,
    switchView,
    syncStatus,
    toastMessage
  } from "./lib/stores";
  import type { RythmState, SyncService, ViewName } from "./lib/types";

  let loginPassword = "";
  let loginError = "";
  let settingsOpen = false;
  let activityDialogOpen = false;
  let activityId: string | null = null;
  let itemDialogOpen = false;
  let itemId: string | null = null;
  let markerId: string | null = null;
  let draftItem: { activityId: string; startAbsMin: number; endAbsMin: number; replaceItemId?: string } | null = null;
  let syncingViewToUrl = false;

  $: syncClass = classifySync($syncStatus);
  $: applyTheme($appState);

  function readViewFromUrl(): ViewName {
    const value = new URLSearchParams(window.location.search).get("view");
    return value === "activities" || value === "stats" || value === "week" ? value : "week";
  }

  function writeViewToUrl(view: ViewName): void {
    const url = new URL(window.location.href);
    if (view === "week") {
      url.searchParams.delete("view");
    } else {
      url.searchParams.set("view", view);
    }
    const next = `${url.pathname}${url.search}${url.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (next !== current) {
      window.history.pushState({ view }, "", next);
    }
  }

  function navigate(view: ViewName): void {
    switchView(view);
  }

  function classifySync(status: string): string {
    const text = String(status || "").toLowerCase();
    if (text.includes("ошибка")) return "is-error";
    if (text.includes("офлайн")) return "is-offline";
    if (text.includes("локаль") || text.includes("измен")) return "is-dirty";
    if (text.includes("синх")) return "is-syncing";
    if (text.includes("сохран")) return "is-saved";
    if (text.includes("сервер")) return "is-server";
    return "is-idle";
  }

  function applyTheme(state: RythmState | null): void {
    if (!state) return;
    const theme = state.settings.theme || "system";
    document.documentElement.dataset.themeMode = theme;
    const resolvedTheme = theme === "system" && window.matchMedia
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : theme;
    document.documentElement.setAttribute("data-bs-theme", resolvedTheme);
    document.documentElement.dataset.glowEffects = state.settings.glowEnabled === false ? "off" : "on";
  }

  function openActivity(id: string | null): void {
    activityId = id;
    activityDialogOpen = true;
  }

  function openItem(id: string): void {
    itemId = id;
    markerId = null;
    draftItem = null;
    itemDialogOpen = true;
  }

  function openDayEnd(id: string): void {
    markerId = id;
    itemId = null;
    draftItem = null;
    itemDialogOpen = true;
  }

  function openDraftItem(draft: { activityId: string; startAbsMin: number; endAbsMin: number; replaceItemId?: string }): void {
    draftItem = draft;
    itemId = null;
    markerId = null;
    itemDialogOpen = true;
  }

  async function login() {
    loginError = "";
    try {
      await request("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: loginPassword })
      });
      authRequired.set(false);
      await syncService.loadInitial();
      registerServiceWorker();
    } catch {
      loginError = "Пароль не подошёл.";
    }
  }

  let syncService: SyncService;
  function registerServiceWorker() {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }

  onMount(() => {
    currentView.set(readViewFromUrl());
    const unsubscribeView = currentView.subscribe((view) => {
      if (syncingViewToUrl) return;
      writeViewToUrl(view);
    });
    const handlePopState = () => {
      syncingViewToUrl = true;
      switchView(readViewFromUrl());
      syncingViewToUrl = false;
    };
    window.addEventListener("popstate", handlePopState);

    async function boot(): Promise<void> {
      syncService = createSync({
        getState: () => get(appState),
        setState,
        setStatus: (status) => syncStatus.set(status),
        onUnauthorized: () => authRequired.set(true)
      });
      setSyncService(syncService);
      const auth = await request<{ authEnabled: boolean; authenticated: boolean }>("/api/auth/status").catch(() => ({ authEnabled: false, authenticated: true }));
      if (auth.authEnabled && !auth.authenticated) {
        authRequired.set(true);
        return;
      }
      await syncService.loadInitial();
      registerServiceWorker();
    }
    boot();

    return () => {
      unsubscribeView();
      window.removeEventListener("popstate", handlePopState);
    };
  });
</script>

{#if $authRequired}
  <div class="auth-screen">
    <form class="auth-box" on:submit|preventDefault={login}>
      <h1>rythm</h1>
      <p>Введите пароль, чтобы открыть личный недельный ритм.</p>
      <input class="form-control" type="password" autocomplete="current-password" placeholder="Пароль" required bind:value={loginPassword}>
      <button class="btn btn-dark w-100" type="submit">Войти</button>
      <small class="danger-text">{loginError}</small>
    </form>
  </div>
{:else if $appState}
  <div class="app-shell">
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark"></span>
        <div>
          <strong>rythm</strong>
          <small>168 часов как сборка недели</small>
        </div>
      </div>
      <nav class="nav nav-pills app-tabs desktop-tabs" aria-label="Разделы">
        <button class:active={$currentView === "week"} class="nav-link" type="button" on:click={() => navigate("week")}>Неделя</button>
        <button class:active={$currentView === "activities"} class="nav-link" type="button" on:click={() => navigate("activities")}>Активности</button>
        <button class:active={$currentView === "stats"} class="nav-link" type="button" on:click={() => navigate("stats")}>Статистика</button>
      </nav>
      <div class="top-actions">
        <button
          id="edit-mode"
          class:active={$editMode}
          class="btn btn-outline-secondary btn-sm icon-button"
          type="button"
          title={$editMode ? "Редактирование включено" : "Редактирование выключено"}
          aria-label={$editMode ? "Редактирование включено" : "Редактирование выключено"}
          on:click={() => {
            const next = !$editMode;
            editMode.set(next);
            showToast(next ? "Редактирование включено" : "Редактирование выключено");
          }}
        >
          <i class="bi bi-pencil-square" aria-hidden="true"></i>
        </button>
        <button class="btn btn-outline-secondary btn-sm icon-button" type="button" title="Настройки" aria-label="Настройки" on:click={() => (settingsOpen = true)}>
          <i class="bi bi-gear" aria-hidden="true"></i>
        </button>
        <button class={`sync-status ${syncClass}`} type="button" title={$syncStatus} aria-label={`Статус синхронизации: ${$syncStatus}`} on:click={() => showToast($syncStatus)}>
          <span class="sync-dot"></span>
        </button>
      </div>
    </header>

    <main class="main">
      <section class="view">
        {#if $currentView === "week"}
          <WeekView state={$appState} onOpenItem={openItem} onOpenDraftItem={openDraftItem} onOpenDayEnd={openDayEnd} onOpenDayStart={openDayEnd} />
        {:else if $currentView === "activities"}
          <ActivitiesView state={$appState} onOpenActivity={openActivity} />
        {:else}
          <StatsView state={$appState} />
        {/if}
      </section>
    </main>

    <nav class="mobile-nav nav nav-pills" aria-label="Разделы">
      <button class:active={$currentView === "week"} class="nav-link" type="button" on:click={() => navigate("week")}>
        <i class="bi bi-calendar-week" aria-hidden="true"></i><span>Неделя</span>
      </button>
      <button class:active={$currentView === "activities"} class="nav-link" type="button" on:click={() => navigate("activities")}>
        <i class="bi bi-diagram-3" aria-hidden="true"></i><span>Активности</span>
      </button>
      <button class:active={$currentView === "stats"} class="nav-link" type="button" on:click={() => navigate("stats")}>
        <i class="bi bi-bar-chart" aria-hidden="true"></i><span>Статистика</span>
      </button>
    </nav>
  </div>

  <ActivityDialog state={$appState} open={activityDialogOpen} activityId={activityId} onClose={() => (activityDialogOpen = false)} />
  <ItemDialog state={$appState} open={itemDialogOpen} {itemId} {markerId} {draftItem} onClose={() => { itemDialogOpen = false; itemId = null; markerId = null; draftItem = null; }} />
  <SettingsDialog state={$appState} open={settingsOpen} onClose={() => (settingsOpen = false)} />
{:else}
  <div class="auth-screen">
    <div class="auth-box">
      <h1>rythm</h1>
      <p>Загрузка недельного ритма.</p>
    </div>
  </div>
{/if}

{#if $toastMessage}
  <div class="toast is-visible">{$toastMessage}</div>
{/if}
