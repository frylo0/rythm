(function () {
  function tree(items, children, level) {
    const esc = window.RythmState.escapeHtml;
    return items.map((activity) => {
      const kids = children.get(activity.id) || [];
      const isGroup = kids.length > 0;
      return `
        <div class="activity-row ${isGroup ? "is-group" : "is-leaf"} ${activity.archived ? "is-archived" : ""}" data-id="${esc(activity.id)}" style="--marker:${window.RythmState.safeColor(activity.color)};--level:${level}">
          <span class="activity-marker"></span>
          <div class="activity-main">
            <strong>${esc(activity.name)}</strong>
            <small>${isGroup ? `${kids.length} влож.` : "лист"} · ${window.RythmState.durationText(activity.defaultDurationMin)}</small>
          </div>
          <span>${window.RythmState.durationText(activity.defaultDurationMin)}</span>
          <button type="button" class="btn btn-outline-secondary btn-sm" data-action="edit-activity" data-id="${esc(activity.id)}">
            <i class="bi bi-pencil" aria-hidden="true"></i>
            <span>Править</span>
          </button>
        </div>
        ${kids.length ? tree(kids, children, level + 1) : ""}
      `;
    }).join("");
  }

  function render(state) {
    const children = window.RythmState.childrenMap(state);
    return `
      <div class="activities-screen">
        <div class="screen-head">
          <div>
            <h1>Активности</h1>
            <p>Иерархия до 3 уровней; группы тоже можно ставить в неделю.</p>
          </div>
          <button type="button" class="btn btn-dark btn-sm app-btn" data-action="new-activity">
            <i class="bi bi-plus-lg" aria-hidden="true"></i>
            <span>Добавить</span>
          </button>
        </div>
        <div class="activity-tree">
          ${tree(children.get("root") || [], children, 1)}
        </div>
      </div>
    `;
  }

  function bind($root, ui) {
    $root.on("click", "[data-action='new-activity']", function () {
      ui.openActivity(null);
    });
    $root.on("click", "[data-action='edit-activity']", function () {
      ui.openActivity(String($(this).data("id")));
    });
  }

  window.RythmActivitiesView = { render, bind };
}());
