(function ($) {
  let state = null;
  let currentView = "week";
  let selectedActivityId = null;
  let selectedSystem = null;
  let editMode = false;
  let pickerContext = null;
  let lastSyncStatus = "Загрузка";

  function applyTheme() {
    if (!state) return;
    const theme = state.settings.theme || "system";
    document.documentElement.dataset.themeMode = theme;
    const resolvedTheme = theme === "system" && window.matchMedia
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : theme;
    document.documentElement.setAttribute("data-bs-theme", resolvedTheme);
  }

  function showDialog(id) {
    bootstrap.Modal.getOrCreateInstance(document.getElementById(id)).show();
  }

  function hideDialog(id) {
    bootstrap.Modal.getOrCreateInstance(document.getElementById(id)).hide();
  }

  function render() {
    if (!state) return;
    applyTheme();
    $("#app-shell").toggleClass("has-picker", currentView === "week" && editMode);
    $("#activity-picker")
      .toggleClass("is-picker-visible", currentView === "week" && editMode)
      .toggleClass("is-picker-disabled", currentView !== "week" || !editMode);
    renderPicker();
    $(".nav-link[data-view]").removeClass("active").filter(`[data-view='${currentView}']`).addClass("active");
    $("#edit-mode")
      .toggleClass("active", editMode)
      .attr("title", editMode ? "Редактирование включено" : "Редактирование выключено")
      .attr("aria-label", editMode ? "Редактирование включено" : "Редактирование выключено");
    const $view = $("#view").empty();
    if (currentView === "week") {
      $view.html(window.RythmWeek.render(state, { editMode }));
      window.RythmWeek.bind($view, {
        editMode,
        insertAt,
        blockClick,
        dayEndClick
      });
    }
    if (currentView === "activities") {
      $view.html(window.RythmActivitiesView.render(state));
      window.RythmActivitiesView.bind($view, { openActivity });
    }
    if (currentView === "stats") {
      $view.html(window.RythmStatsView.render(state));
    }
  }

  function setState(next) {
    state = window.RythmState.normalizeState(next);
    render();
  }

  function mutate(fn) {
    fn(state);
    window.RythmState.touchState(state);
    render();
    window.RythmSync.saveAndSync(state);
  }

  function activeActivities() {
    return (state.activities || []).filter((activity) => !activity.archived);
  }

  function syncClass(status) {
    const text = String(status || "").toLowerCase();
    if (text.includes("ошибка")) return "is-error";
    if (text.includes("офлайн")) return "is-offline";
    if (text.includes("локаль") || text.includes("измен")) return "is-dirty";
    if (text.includes("синх")) return "is-syncing";
    if (text.includes("сохран")) return "is-saved";
    if (text.includes("сервер")) return "is-server";
    return "is-idle";
  }

  function updateSyncStatus(status) {
    lastSyncStatus = status || "Статус неизвестен";
    $("#sync-status")
      .removeClass("is-error is-offline is-dirty is-syncing is-saved is-server is-idle")
      .addClass(syncClass(lastSyncStatus))
      .attr("title", lastSyncStatus)
      .attr("aria-label", `Статус синхронизации: ${lastSyncStatus}`);
  }

  function parentOptions(selected, editingId) {
    const esc = window.RythmState.escapeHtml;
    const roots = [`<option value="">Без родителя</option>`];
    (state.activities || []).forEach((activity) => {
      if (activity.id === editingId) return;
      if (window.RythmState.getDepth(activity, state) >= 3) return;
      roots.push(`<option value="${esc(activity.id)}" ${activity.id === selected ? "selected" : ""}>${esc(activity.name)}</option>`);
    });
    return roots.join("");
  }

  function selectedLabel() {
    if (selectedSystem === "dayEnd") {
      return {
        title: "Конец дня",
        meta: "системный маркер",
        color: "#64748b",
        icon: "bi-layout-sidebar-inset"
      };
    }
    const activity = selectedActivityId ? window.RythmState.activityMap(state).get(selectedActivityId) : null;
    if (!activity) {
      return {
        title: "Ничего не выбрано",
        meta: "выберите активность для вставки или замены",
        color: "#cbd5e1",
        icon: "bi-bag"
      };
    }
    return {
      title: activity.name,
      meta: window.RythmState.durationText(activity.defaultDurationMin),
      color: window.RythmState.safeColor(activity.color),
      icon: "bi-bag-check"
    };
  }

  function selectActivity(id) {
    selectedActivityId = id;
    selectedSystem = null;
    renderPicker();
  }

  function selectSystem(system) {
    selectedActivityId = null;
    selectedSystem = system;
    renderPicker();
  }

  function pickerTree(items, children, level, selectedId) {
    const esc = window.RythmState.escapeHtml;
    return items.map((activity) => {
      const kids = children.get(activity.id) || [];
      const selected = activity.id === selectedId;
      return `
        <div class="picker-tree-node" style="--level:${level}">
          <button type="button" class="picker-tree-item ${kids.length ? "is-group" : "is-leaf"} ${selected ? "is-selected" : ""}" data-activity="${esc(activity.id)}">
            <span class="activity-marker" style="--marker:${window.RythmState.safeColor(activity.color)}"></span>
            <span class="picker-tree-title">${esc(activity.name)}</span>
            <small>${kids.length ? `${kids.length} влож.` : "лист"} · ${window.RythmState.durationText(activity.defaultDurationMin)}</small>
          </button>
          ${kids.length ? pickerTree(kids, children, level + 1, selectedId) : ""}
        </div>
      `;
    }).join("");
  }

  function renderPickerDialog() {
    const context = pickerContext || { type: "purchase", selectedId: selectedActivityId, allowSystem: true };
    const children = window.RythmState.childrenMap({ activities: activeActivities() });
    $("#picker-dialog-content").html(`
      <div class="picker-tree">
        ${pickerTree(children.get("root") || [], children, 1, context.selectedId)}
        ${context.allowSystem ? `
        <button type="button" class="picker-tree-item system ${selectedSystem === "dayEnd" && context.type === "purchase" ? "is-selected" : ""}" data-system="dayEnd">
          <span class="activity-marker"></span>
          <span class="picker-tree-title">Конец дня</span>
          <small>системный маркер</small>
        </button>
        ` : ""}
      </div>
    `);
  }

  function renderPicker() {
    const esc = window.RythmState.escapeHtml;
    const selected = selectedLabel();
    if (currentView !== "week" || !editMode) {
      $("#activity-picker").html(`
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
      `);
      renderPickerDialog();
      return;
    }
    $("#activity-picker").html(`
      <div class="picker-head">
        <strong>Закуп</strong>
        <button type="button" class="btn btn-outline-secondary btn-sm" data-picker-clear title="Сбросить выбор">
          <i class="bi bi-x-lg" aria-hidden="true"></i>
        </button>
      </div>
      <button type="button" class="selected-purchase" style="--marker:${selected.color}" data-open-picker>
        <span class="activity-marker"></span>
        <div>
          <strong>${esc(selected.title)}</strong>
          <small>${esc(selected.meta)}</small>
        </div>
      </button>
      <div class="picker-actions">
        <button type="button" class="btn btn-dark btn-sm app-btn" data-open-picker>
          <i class="bi ${selected.icon}" aria-hidden="true"></i>
          <span>Выбрать</span>
        </button>
      </div>
      <div class="picker-hint">Клик по блоку в режиме редактирования заменит его выбранным закупом.</div>
    `);
    renderPickerDialog();
  }

  function openPicker(context) {
    pickerContext = context || { type: "purchase", selectedId: selectedActivityId, allowSystem: true };
    renderPickerDialog();
    showDialog("picker-dialog");
  }

  function pickFromDialog(id) {
    if (pickerContext && pickerContext.type === "item") {
      const activity = window.RythmState.activityMap(state).get(id);
      $("#item-activity").val(id);
      $("#item-activity-name").text(activity ? activity.name : "Нет активности");
      $("#item-activity-meta").text(activity ? window.RythmState.durationText(activity.defaultDurationMin) : "");
      $("#item-activity-picker .activity-marker").css("--marker", window.RythmState.safeColor(activity ? activity.color : "#cbd5e1"));
      hideDialog("picker-dialog");
      pickerContext = null;
      return;
    }
    selectActivity(id);
    hideDialog("picker-dialog");
    pickerContext = null;
  }

  function pickSystemFromDialog(system) {
    selectSystem(system);
    hideDialog("picker-dialog");
    pickerContext = null;
  }

  function insertAt(atAbsMin, freeUntilAbsMin) {
    if (!editMode) {
      showToast("Включите режим редактирования.");
      return;
    }
    if (selectedSystem === "dayEnd") {
      addDayEndAt(atAbsMin);
      return;
    }
    if (!selectedActivityId) return;
    const activity = window.RythmState.activityMap(state).get(selectedActivityId);
    if (!activity) return;
    const step = state.settings.timeStepMin || 5;
    const startAbsMin = window.RythmState.clampToStep(atAbsMin, step);
    const defaultDuration = Math.max(step, window.RythmState.clampToStep(activity.defaultDurationMin, step));
    const freeDuration = Number.isFinite(freeUntilAbsMin) ? Math.max(0, freeUntilAbsMin - startAbsMin) : defaultDuration;
    const freeDurationByStep = Math.floor(freeDuration / step) * step;
    const duration = Number.isFinite(freeUntilAbsMin) ? Math.min(defaultDuration, freeDurationByStep) : defaultDuration;
    if (duration < step) {
      showToast("В этом промежутке меньше 5 минут.");
      return;
    }
    const endAbsMin = startAbsMin + duration;
    const candidate = { startAbsMin, endAbsMin };
    if (!window.RythmState.canPlace(state, candidate)) {
      showToast("Недостаточно свободного места для дефолтной длительности.");
      return;
    }
    mutate((draft) => {
      draft.timeline.push({
        id: window.RythmState.uid("item"),
        type: "activity",
        activityId: activity.id,
        startAbsMin,
        endAbsMin,
        createdAt: window.RythmState.now(),
        updatedAt: window.RythmState.now()
      });
    });
  }

  function blockClick(id) {
    if (selectedActivityId && editMode) {
      mutate((draft) => {
        const item = draft.timeline.find((entry) => entry.id === id);
        if (item) {
          item.activityId = selectedActivityId;
          item.updatedAt = window.RythmState.now();
        }
      });
      return;
    }
    openItem(id);
  }

  function addDayEndAt(atAbsMin) {
    mutate((draft) => {
      const step = draft.settings.timeStepMin || 5;
      draft.timeline.push({
        id: window.RythmState.uid("marker"),
        type: "dayEnd",
        atAbsMin: window.RythmState.clampToStep(atAbsMin, step),
        createdAt: window.RythmState.now(),
        updatedAt: window.RythmState.now()
      });
    });
  }

  function dayEndClick(id) {
    const marker = state.timeline.find((item) => item.id === id);
    if (!marker) return;
    const dialogId = "item-dialog";
    $("#item-dialog-title").text("Конец дня");
    $("#item-dialog-content").html(`
      <label class="form-label">Время</label>
      <input id="marker-time" class="form-control" type="time" step="300" value="${window.RythmState.formatClock(marker.atAbsMin, state)}">
      <div class="dialog-actions">
        <button type="button" class="btn btn-outline-danger" id="delete-marker">Удалить</button>
        <button type="button" class="btn btn-dark" id="save-marker">Сохранить</button>
      </div>
    `);
    $("#save-marker").off("click").on("click", function () {
      const next = window.RythmState.parseClock($("#marker-time").val(), marker.atAbsMin, state);
      mutate((draft) => {
        const item = draft.timeline.find((entry) => entry.id === id);
        item.atAbsMin = window.RythmState.clampToStep(next, draft.settings.timeStepMin || 5);
        item.updatedAt = window.RythmState.now();
      });
      hideDialog(dialogId);
    });
    $("#delete-marker").off("click").on("click", function () {
      if (!confirm("Удалить системный конец дня?")) return;
      mutate((draft) => {
        draft.timeline = draft.timeline.filter((entry) => entry.id !== id);
      });
      hideDialog(dialogId);
    });
    showDialog(dialogId);
  }

  function openItem(id) {
    const item = state.timeline.find((entry) => entry.id === id);
    if (!item) return;
    const dialogId = "item-dialog";
    const duration = item.endAbsMin - item.startAbsMin;
    $("#item-dialog-title").text("Блок недели");
    const currentActivity = window.RythmState.activityMap(state).get(item.activityId);
    $("#item-dialog-content").html(`
      <label class="form-label">Активность</label>
      <input id="item-activity" type="hidden" value="${window.RythmState.escapeHtml(item.activityId)}">
      <button id="item-activity-picker" class="activity-select-button" type="button">
        <span class="activity-marker" style="--marker:${window.RythmState.safeColor(currentActivity ? currentActivity.color : "#cbd5e1")}"></span>
        <span>
          <strong id="item-activity-name">${currentActivity ? window.RythmState.escapeHtml(currentActivity.name) : "Нет активности"}</strong>
          <small id="item-activity-meta">${currentActivity ? window.RythmState.durationText(currentActivity.defaultDurationMin) : ""}</small>
        </span>
        <i class="bi bi-chevron-right" aria-hidden="true"></i>
      </button>
      <div class="form-grid">
        <label class="form-label">Начало
          <input id="item-start" class="form-control" type="time" step="300" value="${window.RythmState.formatClock(item.startAbsMin, state)}">
        </label>
        <label class="form-label">Конец
          <input id="item-end" class="form-control" type="time" step="300" value="${window.RythmState.formatClock(item.endAbsMin, state)}">
        </label>
        <label class="form-label">Длительность, мин
          <input id="item-duration" class="form-control" type="number" min="5" step="5" value="${duration}">
        </label>
      </div>
      <small id="item-error" class="danger-text"></small>
      <div class="dialog-actions">
        <button type="button" class="btn btn-outline-danger" id="delete-item">Удалить</button>
        <button type="button" class="btn btn-outline-secondary" id="split-item">Распилить</button>
        <button type="button" class="btn btn-dark" id="save-item">Сохранить</button>
      </div>
    `);
    $("#item-activity-picker").off("click").on("click", function () {
      openPicker({ type: "item", selectedId: $("#item-activity").val(), allowSystem: false });
    });

    $("#item-start").on("change", function () {
      const start = window.RythmState.parseClock(this.value, item.startAbsMin, state);
      const nextEnd = start + Number($("#item-duration").val() || duration);
      $("#item-end").val(window.RythmState.formatClock(nextEnd, state));
    });
    $("#item-end").on("change", function () {
      const start = window.RythmState.parseClock($("#item-start").val(), item.startAbsMin, state);
      const end = window.RythmState.parseClock(this.value, item.endAbsMin, state);
      $("#item-duration").val(Math.max(5, end - start));
    });
    $("#item-duration").on("change", function () {
      const start = window.RythmState.parseClock($("#item-start").val(), item.startAbsMin, state);
      $("#item-end").val(window.RythmState.formatClock(start + Number(this.value || 5), state));
    });
    $("#save-item").off("click").on("click", function () {
      const start = window.RythmState.clampToStep(window.RythmState.parseClock($("#item-start").val(), item.startAbsMin, state), state.settings.timeStepMin || 5);
      const durationMin = window.RythmState.clampToStep($("#item-duration").val(), state.settings.timeStepMin || 5);
      const end = start + Math.max(5, durationMin);
      if (!window.RythmState.canPlace(state, { startAbsMin: start, endAbsMin: end }, id)) {
        $("#item-error").text("Это изменение создаст пересечение.");
        return;
      }
      mutate((draft) => {
        const entry = draft.timeline.find((row) => row.id === id);
        entry.activityId = $("#item-activity").val();
        entry.startAbsMin = start;
        entry.endAbsMin = end;
        entry.updatedAt = window.RythmState.now();
      });
      hideDialog(dialogId);
    });
    $("#delete-item").off("click").on("click", function () {
      mutate((draft) => {
        draft.timeline = draft.timeline.filter((entry) => entry.id !== id);
      });
      hideDialog(dialogId);
    });
    $("#split-item").off("click").on("click", function () {
      openSplit(item);
    });
    showDialog(dialogId);
  }

  function openSplit(item) {
    const total = item.endAbsMin - item.startAbsMin;
    $("#item-dialog-title").text("Распил блока");
    $("#item-dialog-content").html(`
      <p>Текущая длительность: ${window.RythmState.durationText(total)}</p>
      <label class="form-label">Первая часть, мин
        <input id="split-first" class="form-control" type="number" min="5" max="${total - 5}" step="5" value="${Math.floor(total / 2 / 5) * 5}">
      </label>
      <div class="dialog-actions">
        <button type="button" class="btn btn-outline-secondary" id="cancel-split">Назад</button>
        <button type="button" class="btn btn-dark" id="save-split">Распилить</button>
      </div>
    `);
    $("#cancel-split").on("click", () => openItem(item.id));
    $("#save-split").on("click", function () {
      const first = Math.min(total - 5, Math.max(5, window.RythmState.clampToStep($("#split-first").val(), state.settings.timeStepMin || 5)));
      mutate((draft) => {
        const index = draft.timeline.findIndex((entry) => entry.id === item.id);
        const original = draft.timeline[index];
        const splitAt = original.startAbsMin + first;
        draft.timeline.splice(index, 1,
          Object.assign({}, original, { id: window.RythmState.uid("item"), endAbsMin: splitAt, updatedAt: window.RythmState.now() }),
          Object.assign({}, original, { id: window.RythmState.uid("item"), startAbsMin: splitAt, updatedAt: window.RythmState.now() })
        );
      });
      hideDialog("item-dialog");
    });
  }

  function openActivity(id) {
    const esc = window.RythmState.escapeHtml;
    const activity = id ? state.activities.find((entry) => entry.id === id) : null;
    const dialogId = "activity-dialog";
    const color = activity ? activity.color : "#3b82f6";
    $("#activity-dialog-title").text(activity ? "Активность" : "Новая активность");
    $("#activity-dialog-content").html(`
      <label class="form-label">Название
        <input id="activity-name" class="form-control" value="${activity ? esc(activity.name) : ""}" maxlength="60" required>
      </label>
      <label class="form-label">Родитель
        <select id="activity-parent" class="form-select">${parentOptions(activity ? activity.parentId : "", id)}</select>
      </label>
      <div class="form-grid">
        <label class="form-label">Длительность, мин
          <input id="activity-duration" class="form-control" type="number" min="5" step="5" value="${activity ? activity.defaultDurationMin : 60}">
        </label>
        <label class="form-label">HEX
          <input id="activity-color" class="form-control" value="${esc(color)}" pattern="#[0-9a-fA-F]{6}">
        </label>
      </div>
      ${window.RythmColors.renderPicker(color)}
      <label class="check-line form-check">
        <input id="activity-archived" class="form-check-input" type="checkbox" ${activity && activity.archived ? "checked" : ""}>
        Архив
      </label>
      <div class="dialog-actions">
        ${activity ? "<button type='button' class='btn btn-outline-danger' id='delete-activity'>Удалить</button>" : ""}
        <button type="button" class="btn btn-dark" id="save-activity">Сохранить</button>
      </div>
    `);
    $(".color-swatch").on("click", function () {
      $("#activity-color").val($(this).data("color"));
      $(".color-swatch").removeClass("is-selected");
      $(this).addClass("is-selected");
    });
    $("#activity-color").on("input change", function () {
      const current = String($(this).val() || "").toLowerCase();
      $(".color-swatch").removeClass("is-selected").filter(function () {
        return String($(this).data("color") || "").toLowerCase() === current;
      }).addClass("is-selected");
    }).trigger("change");
    $("#save-activity").off("click").on("click", function () {
      const name = $("#activity-name").val().trim();
      if (!name) return;
      mutate((draft) => {
        if (activity) {
          const entry = draft.activities.find((row) => row.id === id);
          entry.name = name;
          entry.parentId = $("#activity-parent").val() || null;
          entry.defaultDurationMin = Math.max(5, window.RythmState.clampToStep($("#activity-duration").val(), draft.settings.timeStepMin || 5));
          entry.color = $("#activity-color").val();
          entry.archived = $("#activity-archived").is(":checked");
          entry.updatedAt = window.RythmState.now();
        } else {
          draft.activities.push({
            id: window.RythmState.uid("act"),
            parentId: $("#activity-parent").val() || null,
            name,
            color: $("#activity-color").val(),
            defaultDurationMin: Math.max(5, window.RythmState.clampToStep($("#activity-duration").val(), draft.settings.timeStepMin || 5)),
            archived: false,
            createdAt: window.RythmState.now(),
            updatedAt: window.RythmState.now()
          });
        }
      });
      hideDialog(dialogId);
    });
    $("#delete-activity").off("click").on("click", function () {
      const used = state.timeline.some((item) => item.activityId === id);
      const hasChildren = state.activities.some((item) => item.parentId === id);
      mutate((draft) => {
        if (used || hasChildren) {
          const entry = draft.activities.find((row) => row.id === id);
          entry.archived = true;
          entry.updatedAt = window.RythmState.now();
        } else {
          draft.activities = draft.activities.filter((row) => row.id !== id);
        }
      });
      hideDialog(dialogId);
    });
    showDialog(dialogId);
  }

  function openSettings() {
    const esc = window.RythmState.escapeHtml;
    const dialogId = "settings-dialog";
    $("#settings-content").html(`
      <label class="check-line form-check">
        <input id="settings-auth" class="form-check-input" type="checkbox" ${state.settings.authEnabled ? "checked" : ""}>
        Требовать пароль
      </label>
      <div class="form-grid">
        <label class="form-label">Старт недели
          <input id="settings-start" class="form-control" type="time" step="300" value="${window.RythmState.formatClock(0, state)}">
        </label>
        <label class="form-label">Высота 5 минут, px
          <input id="settings-scale" class="form-control" type="number" min="1" max="8" value="${state.settings.pxPer5Min || 2}">
        </label>
      </div>
      <label class="form-label">Тема
        <select id="settings-theme" class="form-select">
          <option value="system" ${state.settings.theme === "system" ? "selected" : ""}>Как в системе</option>
          <option value="light" ${state.settings.theme === "light" ? "selected" : ""}>Светлая</option>
          <option value="dark" ${state.settings.theme === "dark" ? "selected" : ""}>Тёмная</option>
        </select>
      </label>
      <label class="form-label">JSON
        <textarea id="settings-json" class="form-control font-monospace" rows="8">${esc(JSON.stringify(state, null, 2))}</textarea>
      </label>
      <div class="dialog-actions wrap">
        <button type="button" class="btn btn-outline-secondary" id="reset-cache">Сбросить кэш</button>
        <button type="button" class="btn btn-outline-secondary" id="logout">Выйти</button>
        <button type="button" class="btn btn-outline-secondary" id="import-json">Импорт</button>
        <button type="button" class="btn btn-dark" id="save-settings">Сохранить</button>
      </div>
    `);
    $("#save-settings").off("click").on("click", function () {
      mutate((draft) => {
        draft.settings.authEnabled = $("#settings-auth").is(":checked");
        const clock = $("#settings-start").val().split(":").map(Number);
        draft.settings.weekStartClockMin = clock[0] * 60 + clock[1];
        draft.settings.pxPer5Min = Number($("#settings-scale").val() || 2);
        draft.settings.theme = $("#settings-theme").val();
      });
      hideDialog(dialogId);
    });
    $("#import-json").off("click").on("click", function () {
      try {
        const imported = window.RythmState.normalizeState(JSON.parse($("#settings-json").val()));
        imported.updatedAt = window.RythmState.now();
        setState(imported);
        window.RythmSync.saveAndSync(imported);
        hideDialog(dialogId);
      } catch {
        showToast("JSON не удалось прочитать.");
      }
    });
    $("#reset-cache").off("click").on("click", async function () {
      await window.RythmStorage.del("state");
      await window.RythmStorage.del("dirty");
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }
      showToast("Локальный кэш сброшен.");
    });
    $("#logout").off("click").on("click", async function () {
      await window.RythmSync.request("/api/auth/logout", { method: "POST" }).catch(() => {});
      location.reload();
    });
    showDialog(dialogId);
  }

  function showToast(message) {
    const $toast = $("<div class='toast'></div>").text(message).appendTo(document.body);
    setTimeout(() => $toast.addClass("is-visible"), 20);
    setTimeout(() => $toast.removeClass("is-visible").remove(), 2400);
  }

  async function boot() {
    window.RythmSync.configure({
      onStatus: updateSyncStatus,
      getState: () => state,
      setState
    });
    const auth = await window.RythmSync.request("/api/auth/status").catch(() => ({ authEnabled: false, authenticated: true }));
    if (auth.authEnabled && !auth.authenticated) {
      $("#auth-screen").prop("hidden", false);
      return;
    }
    $("#app-shell").prop("hidden", false);
    await window.RythmSync.loadInitial();
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }

  $(document).on("click", ".nav-link[data-view]", function () {
    currentView = $(this).data("view");
    render();
  });
  $(document).on("click", "[data-open-picker]", function () {
    openPicker();
  });
  $(document).on("click", "#picker-dialog [data-activity]", function () {
    pickFromDialog(String($(this).data("activity")));
  });
  $(document).on("click", "#picker-dialog [data-system]", function () {
    pickSystemFromDialog(String($(this).data("system")));
  });
  $(document).on("click", "[data-picker-clear]", function () {
    selectedActivityId = null;
    selectedSystem = null;
    renderPicker();
  });
  $("#edit-mode").on("click", function () {
    editMode = !editMode;
    render();
    showToast(editMode ? "Редактирование включено" : "Редактирование выключено");
  });
  $("#settings-button").on("click", openSettings);
  $("#sync-status").on("click", function () {
    showToast(lastSyncStatus);
  });
  $(document).on("submit", ".app-modal", function (event) {
    event.preventDefault();
  });
  $("#login-form").on("submit", async function (event) {
    event.preventDefault();
    $("#login-error").text("");
    try {
      await window.RythmSync.request("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: $("#login-password").val() })
      });
      $("#auth-screen").prop("hidden", true);
      $("#app-shell").prop("hidden", false);
      await window.RythmSync.loadInitial();
    } catch {
      $("#login-error").text("Пароль не подошёл.");
    }
  });
  $(document).on("rythm:unauthorized", function () {
    $("#app-shell").prop("hidden", true);
    $("#auth-screen").prop("hidden", false);
  });

  boot();
}(jQuery));
