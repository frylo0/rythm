import { get, set } from "./storage";
import { normalizeState } from "./state";
import { request } from "./api";
import type { RequestError, RythmState, SyncService } from "./types";

const STATE_KEY = "state";
const DIRTY_KEY = "dirty";

let busy = false;

interface SyncOptions {
  getState: () => RythmState | null;
  setState: (state: RythmState) => void;
  setStatus: (status: string) => void;
  onUnauthorized: () => void;
}

function hasContent(state: RythmState | null | undefined): boolean {
  return Boolean(
    state &&
      ((Array.isArray(state.activities) && state.activities.length) ||
        (Array.isArray(state.timeline) && state.timeline.length))
  );
}

export function createSync({ getState, setState, setStatus, onUnauthorized }: SyncOptions): SyncService {
  async function saveLocal(state: RythmState, dirty: boolean): Promise<void> {
    await set(STATE_KEY, state);
    await set(DIRTY_KEY, Boolean(dirty));
    setStatus(navigator.onLine ? (dirty ? "Есть локальные изменения" : "Сохранено") : "Офлайн, есть локальные изменения");
  }

  async function saveAndSync(state: RythmState): Promise<void> {
    await saveLocal(state, true);
    syncNow();
  }

  async function syncNow() {
    if (busy) return;
    if (!navigator.onLine) {
      setStatus("Офлайн");
      return;
    }
    busy = true;
    setStatus("Синхронизация");
    try {
      const localState = (await get<RythmState>(STATE_KEY)) || getState();
      const dirty = await get<boolean>(DIRTY_KEY);
      const server = await request<{ ok: true; state: unknown }>("/api/state");
      const serverState = normalizeState(server.state);
      if (!hasContent(localState) && hasContent(serverState)) {
        setState(serverState);
        await saveLocal(serverState, false);
        setStatus("Серверная версия свежее");
        return;
      }
      if (!localState) {
        setState(serverState);
        await saveLocal(serverState, false);
        setStatus("Сохранено");
        return;
      }
      const localTime = new Date(localState.updatedAt || 0).getTime();
      const serverTime = new Date(serverState.updatedAt || 0).getTime();
      if (serverTime > localTime) {
        setState(serverState);
        await saveLocal(serverState, false);
        setStatus("Серверная версия свежее");
      } else if (dirty || localTime > serverTime) {
        await request("/api/state", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state: localState })
        });
        await saveLocal(localState, false);
        setStatus("Локальная версия отправлена");
      } else {
        await saveLocal(localState, false);
        setStatus("Сохранено");
      }
    } catch (error) {
      const syncError = error as RequestError;
      if (syncError.status === 401) {
        setStatus("Нужен вход");
        onUnauthorized();
      } else if (syncError.payload && syncError.payload.code === "SERVER_STATE_IS_NEWER" && syncError.payload.state) {
        const serverState = normalizeState(syncError.payload.state);
        setState(serverState);
        await saveLocal(serverState, false);
        setStatus("Серверная версия свежее");
      } else {
        setStatus("Ошибка синхронизации");
      }
    } finally {
      busy = false;
    }
  }

  async function loadInitial() {
    const localState = await get<RythmState>(STATE_KEY);
    if (localState) {
      setState(normalizeState(localState));
      setStatus(navigator.onLine ? "Есть локальная копия" : "Офлайн");
    }
    await syncNow();
  }

  window.addEventListener("online", syncNow);
  window.addEventListener("offline", () => setStatus("Офлайн"));

  return { loadInitial, saveLocal, saveAndSync, syncNow };
}
