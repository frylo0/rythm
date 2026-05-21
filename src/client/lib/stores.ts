import { derived, get, writable } from "svelte/store";
import { clone, normalizeState, reconcileDayModel, touchState } from "./state";
import type { Activity, RythmState, SyncService, SystemPurchase, ViewName } from "./types";

export const appState = writable<RythmState | null>(null);
export const currentView = writable<ViewName>("week");
export const editMode = writable(false);
export const selectedActivityId = writable<string | null>(null);
export const selectedSystem = writable<SystemPurchase | null>(null);
export const syncStatus = writable("Загрузка");
export const authRequired = writable(false);
export const toastMessage = writable("");

let syncService: SyncService | null = null;

export function setSyncService(service: SyncService): void {
  syncService = service;
}

export function setState(next: unknown): void {
  appState.set(normalizeState(next));
}

export function mutateState(fn: (draft: RythmState) => void): void {
  const current = get(appState);
  if (!current) return;
  const draft = clone(current);
  fn(draft);
  reconcileDayModel(draft);
  touchState(draft);
  appState.set(draft);
  syncService?.saveAndSync(draft);
}

export function importState(next: unknown): void {
  const normalized = normalizeState(next);
  touchState(normalized);
  appState.set(normalized);
  syncService?.saveAndSync(normalized);
}

export function showToast(message: string): void {
  toastMessage.set(message);
  window.setTimeout(() => toastMessage.set(""), 2400);
}

export function switchView(view: ViewName): void {
  const update = () => currentView.set(view);
  if (document.startViewTransition) {
    document.startViewTransition(update);
  } else {
    update();
  }
}

export const activeActivities = derived(appState, ($state): Activity[] => ($state?.activities || []).filter((activity) => !activity.archived));
