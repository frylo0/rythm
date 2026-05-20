(function () {
  const STATE_KEY = "state";
  const DIRTY_KEY = "dirty";
  let statusHandler = () => {};
  let stateProvider = () => null;
  let stateConsumer = () => {};
  let busy = false;

  function setStatus(value) {
    statusHandler(value);
  }

  async function request(url, options) {
    const response = await fetch(url, Object.assign({ credentials: "same-origin" }, options || {}));
    const json = await response.json().catch(() => ({}));
    if (!response.ok || json.ok === false) {
      const error = new Error(json.code || "REQUEST_FAILED");
      error.payload = json;
      error.status = response.status;
      throw error;
    }
    return json;
  }

  async function loadInitial() {
    const localState = await window.RythmStorage.get(STATE_KEY);
    if (localState) {
      stateConsumer(window.RythmState.normalizeState(localState));
      setStatus(navigator.onLine ? "Есть локальная копия" : "Офлайн");
    }
    await syncNow();
  }

  async function saveLocal(state, dirty) {
    await window.RythmStorage.set(STATE_KEY, state);
    await window.RythmStorage.set(DIRTY_KEY, Boolean(dirty));
    setStatus(navigator.onLine ? (dirty ? "Есть локальные изменения" : "Сохранено") : "Офлайн, есть локальные изменения");
  }

  async function saveAndSync(state) {
    await saveLocal(state, true);
    syncNow();
  }

  function hasContent(state) {
    return Boolean(
      state &&
      ((Array.isArray(state.activities) && state.activities.length) ||
        (Array.isArray(state.timeline) && state.timeline.length))
    );
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
      const localState = (await window.RythmStorage.get(STATE_KEY)) || stateProvider();
      const dirty = await window.RythmStorage.get(DIRTY_KEY);
      const server = await request("/api/state");
      const serverState = window.RythmState.normalizeState(server.state);
      if (!hasContent(localState) && hasContent(serverState)) {
        stateConsumer(serverState);
        await saveLocal(serverState, false);
        setStatus("Серверная версия свежее");
        return;
      }
      if (!localState) {
        stateConsumer(serverState);
        await saveLocal(serverState, false);
        setStatus("Сохранено");
        return;
      }
      const localTime = new Date(localState.updatedAt || 0).getTime();
      const serverTime = new Date(serverState.updatedAt || 0).getTime();
      if (serverTime > localTime) {
        stateConsumer(serverState);
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
      if (error.status === 401) {
        setStatus("Нужен вход");
        $(document).trigger("rythm:unauthorized");
      } else if (error.payload && error.payload.code === "SERVER_STATE_IS_NEWER" && error.payload.state) {
        stateConsumer(window.RythmState.normalizeState(error.payload.state));
        await saveLocal(error.payload.state, false);
        setStatus("Серверная версия свежее");
      } else {
        setStatus("Ошибка синхронизации");
      }
    } finally {
      busy = false;
    }
  }

  function configure(options) {
    statusHandler = options.onStatus || statusHandler;
    stateProvider = options.getState || stateProvider;
    stateConsumer = options.setState || stateConsumer;
    window.addEventListener("online", syncNow);
    window.addEventListener("offline", () => setStatus("Офлайн"));
  }

  window.RythmSync = {
    configure,
    loadInitial,
    saveLocal,
    saveAndSync,
    syncNow,
    request
  };
}());
