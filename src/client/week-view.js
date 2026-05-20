(function () {
  function blockStyle(activity, state, item) {
    const px = Math.max(26, ((item.endAbsMin - item.startAbsMin) / 5) * (state.settings.pxPer5Min || 2));
    const color = window.RythmState.safeColor(activity ? activity.color : "#e5e7eb");
    return `min-height:${px}px;background:${color};color:${window.RythmState.textColor(color)}`;
  }

  function renderWarnings(state) {
    const warnings = window.RythmState.validateState(state);
    if (!warnings.length) return "";
    return `
      <div class="warnings">
        ${warnings.map((warning) => `<div>${warning}</div>`).join("")}
      </div>
    `;
  }

  function gapHtml(column, from, to, editable) {
    const duration = Math.max(0, to - from);
    if (!duration) return "";
    return `
      <button type="button" class="gap ${editable ? "is-editable" : ""}" data-day="${column.index}" data-at="${from}" data-to="${to}" style="min-height:${Math.min(46, Math.max(14, duration / 12))}px">
        <span>${window.RythmState.durationText(duration)}</span>
      </button>
    `;
  }

  function render(state, ui) {
    const esc = window.RythmState.escapeHtml;
    const map = window.RythmState.activityMap(state);
    const columns = window.RythmState.dayColumns(state);
    const editable = ui.editMode;
    return `
      <div class="week-screen">
        <div class="screen-head">
          <div>
            <h1>Неделя</h1>
          </div>
        </div>
        ${renderWarnings(state)}
        <div class="week-scroll">
          <div class="week-grid" style="--day-count:${columns.length}">
            ${columns.map((column) => {
              const blocks = window.RythmState.blocksInColumn(state, column);
              let cursor = column.start;
              return `
                <section class="day-column ${column.extra ? "is-extra" : ""}">
                  <header>
                    <strong>${column.label}</strong>
                    <span>${window.RythmState.durationText(column.end - column.start)}</span>
                  </header>
                  <div class="day-body">
                    ${blocks.map((item) => {
                      const activity = map.get(item.activityId);
                      const gap = gapHtml(column, cursor, item.startAbsMin, editable);
                      cursor = Math.max(cursor, item.endAbsMin);
                      return `
                        ${gap}
                        <button type="button" class="week-block" data-id="${esc(item.id)}" style="${blockStyle(activity, state, item)}">
                          <strong>${activity ? esc(activity.name) : "Нет активности"}</strong>
                          <span class="week-block-times">
                            <span>${window.RythmState.formatClock(item.startAbsMin, state)}</span>
                            <span>${window.RythmState.formatClock(item.endAbsMin, state)}</span>
                          </span>
                          <em>${window.RythmState.durationText(item.endAbsMin - item.startAbsMin)}</em>
                          ${activity && activity.archived ? "<small>архив</small>" : ""}
                        </button>
                      `;
                    }).join("")}
                    ${gapHtml(column, cursor, column.end, editable)}
                    ${column.marker ? `
                      <button type="button" class="day-end" data-id="${esc(column.marker.id)}">
                        <span>${window.RythmState.formatClock(column.marker.atAbsMin, state)}</span>
                        Конец дня
                      </button>
                    ` : ""}
                  </div>
                </section>
              `;
            }).join("")}
          </div>
        </div>
      </div>
    `;
  }

  function bind($root, ui) {
    $root.on("click", ".gap", function () {
      ui.insertAt(Number($(this).data("at")), Number($(this).data("to")));
    });
    $root.on("click", ".week-block", function () {
      ui.blockClick(String($(this).data("id")));
    });
    $root.on("click", ".day-end", function () {
      ui.dayEndClick(String($(this).data("id")));
    });
  }

  window.RythmWeek = { render, bind };
}());
