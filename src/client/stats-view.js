(function () {
  function addTotals(row, dayIndex, minutes) {
    row.days[dayIndex] = (row.days[dayIndex] || 0) + minutes;
    row.total += minutes;
  }

  function ensureRow(rows, activity, level, label) {
    const key = label ? `${activity.id}:${label}` : activity.id;
    if (!rows.has(key)) {
      rows.set(key, {
        key,
        id: activity.id,
        name: label || activity.name,
        color: activity.color,
        level,
        days: [],
        total: 0
      });
    }
    return rows.get(key);
  }

  function ancestorChain(activity, map) {
    const chain = [activity];
    let current = activity;
    while (current && current.parentId) {
      current = map.get(current.parentId);
      if (current) chain.unshift(current);
    }
    return chain;
  }

  function buildRows(state, columns) {
    const map = window.RythmState.activityMap(state);
    const rows = new Map();
    columns.forEach((column, dayIndex) => {
      window.RythmState.blocksInColumn(state, column).forEach((item) => {
        const activity = map.get(item.activityId);
        if (!activity) return;
        const minutes = item.endAbsMin - item.startAbsMin;
        const chain = ancestorChain(activity, map);
        chain.forEach((node, index) => {
          addTotals(ensureRow(rows, node, index + 1), dayIndex, minutes);
        });
        if (window.RythmState.descendantsOf(activity.id, state).length) {
          addTotals(ensureRow(rows, activity, chain.length + 1, `Напрямую как ${activity.name}`), dayIndex, minutes);
        }
      });
    });
    return Array.from(rows.values()).sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }

  function render(state) {
    const esc = window.RythmState.escapeHtml;
    const columns = window.RythmState.dayColumns(state);
    const rows = buildRows(state, columns);
    const busyByDay = columns.map((column) => window.RythmState.blocksInColumn(state, column).reduce((sum, item) => sum + item.endAbsMin - item.startAbsMin, 0));
    const totalBusy = busyByDay.reduce((sum, value) => sum + value, 0);
    return `
      <div class="stats-screen">
        <div class="screen-head">
          <div>
            <h1>Статистика</h1>
            <p>Занято ${window.RythmState.durationText(totalBusy)} из 168ч.</p>
          </div>
        </div>
        <div class="stats-scroll">
          <table class="stats-table" style="--day-count:${columns.length}">
            <thead>
              <tr>
                <th>Активность</th>
                ${columns.map((column) => `<th class="${column.extra ? "warn-col" : ""}">${column.label}</th>`).join("")}
                <th>Итого</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((row) => `
                <tr>
                  <th style="--marker:${window.RythmState.safeColor(row.color)};--level:${row.level}"><span class="activity-marker"></span>${esc(row.name)}</th>
                  ${columns.map((column, index) => `<td>${row.days[index] ? window.RythmState.durationText(row.days[index]) : "—"}</td>`).join("")}
                  <td><strong>${window.RythmState.durationText(row.total)}</strong></td>
                </tr>
              `).join("")}
              <tr class="service-row"><th>Занято всего</th>${busyByDay.map((min) => `<td>${window.RythmState.durationText(min)}</td>`).join("")}<td>${window.RythmState.durationText(totalBusy)}</td></tr>
              <tr class="service-row"><th>Не распределено</th>${columns.map((column, index) => `<td>${window.RythmState.durationText(Math.max(0, column.end - column.start - busyByDay[index]))}</td>`).join("")}<td>${window.RythmState.durationText(Math.max(0, window.RythmState.WEEK_MIN - totalBusy))}</td></tr>
              <tr class="service-row"><th>Всего в дне</th>${columns.map((column) => `<td>${window.RythmState.durationText(column.end - column.start)}</td>`).join("")}<td>${window.RythmState.durationText(columns.reduce((sum, column) => sum + column.end - column.start, 0))}</td></tr>
              <tr class="service-row"><th>Отклонение от 24 часов</th>${columns.map((column) => `<td>${window.RythmState.durationText(column.end - column.start - window.RythmState.DAY_MIN)}</td>`).join("")}<td></td></tr>
              <tr class="service-row"><th>Отклонение от 168 часов</th>${columns.map(() => "<td></td>").join("")}<td>${window.RythmState.durationText(columns.reduce((sum, column) => sum + column.end - column.start, 0) - window.RythmState.WEEK_MIN)}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  window.RythmStatsView = { render };
}());
