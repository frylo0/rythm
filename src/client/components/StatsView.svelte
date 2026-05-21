<script lang="ts">
  import {
    WEEK_MIN,
    DAY_MIN,
    activityMap,
    blocksInColumn,
    childrenMap,
    dayColumns,
    descendantsOf,
    durationText,
    safeColor
  } from "../lib/state";
  import type { Activity, DayColumn, RythmState } from "../lib/types";

  export let state: RythmState;

  interface StatsRow {
    key: string;
    id: string;
    name: string;
    color: string;
    level: number;
    days: number[];
    total: number;
    direct?: boolean;
  }

  function addTotals(row: StatsRow, dayIndex: number, minutes: number): void {
    row.days[dayIndex] = (row.days[dayIndex] || 0) + minutes;
    row.total += minutes;
  }

  function ensureRow(rows: Map<string, StatsRow>, activity: Activity, level: number, label?: string, direct = false): StatsRow {
    const key = label ? `${activity.id}:${label}` : activity.id;
    if (!rows.has(key)) {
      rows.set(key, {
        key,
        id: activity.id,
        name: label || activity.name,
        color: activity.color,
        level,
        days: [],
        total: 0,
        direct
      });
    }
    return rows.get(key)!;
  }

  function ancestorChain(activity: Activity, map: Map<string, Activity>): Activity[] {
    const chain = [activity];
    let current: Activity | undefined = activity;
    while (current && current.parentId) {
      current = map.get(current.parentId);
      if (current) chain.unshift(current);
    }
    return chain;
  }

  function buildRows(columns: DayColumn[]): StatsRow[] {
    const map = activityMap(state);
    const tree = childrenMap(state);
    const rows = new Map<string, StatsRow>();
    columns.forEach((column, dayIndex) => {
      blocksInColumn(state, column).forEach((item) => {
        const activity = map.get(item.activityId);
        if (!activity) return;
        const minutes = item.endAbsMin - item.startAbsMin;
        const chain = ancestorChain(activity, map);
        chain.forEach((node, index) => addTotals(ensureRow(rows, node, index + 1), dayIndex, minutes));
        if (descendantsOf(activity.id, state).length) {
          addTotals(ensureRow(rows, activity, chain.length + 1, "direct", true), dayIndex, minutes);
        }
      });
    });

    function collect(activity: Activity, level: number): StatsRow[] {
      const own = rows.get(activity.id);
      const direct = rows.get(`${activity.id}:direct`);
      const childRows = (tree.get(activity.id) || []).flatMap((child) => collect(child, level + 1));
      if (!own && !direct && !childRows.length) return [];
      const normalizedOwn = own || {
        key: activity.id,
        id: activity.id,
        name: activity.name,
        color: activity.color,
        level,
        days: [],
        total: 0
      };
      normalizedOwn.level = level;
      if (direct) direct.level = level + 1;
      return [normalizedOwn, ...(direct ? [direct] : []), ...childRows];
    }

    return (tree.get("root") || []).flatMap((activity) => collect(activity, 1));
  }

  $: columns = dayColumns(state);
  $: rows = buildRows(columns);
  $: busyByDay = columns.map((column) => blocksInColumn(state, column).reduce((sum, item) => sum + item.endAbsMin - item.startAbsMin, 0));
  $: totalBusy = busyByDay.reduce((sum, value) => sum + value, 0);
  $: columnTotal = columns.reduce((sum, column) => sum + column.end - column.start, 0);
</script>

<div class="stats-screen">
  <div class="screen-head">
    <div>
      <h1>Статистика</h1>
      <p>Занято {durationText(totalBusy)} из 168ч.</p>
    </div>
  </div>
  <div class="stats-scroll">
    <table class="stats-table" style={`--day-count:${columns.length}`}>
      <thead>
        <tr>
          <th>Активность</th>
          {#each columns as column}
            <th class:warn-col={column.extra}>{column.label}</th>
          {/each}
          <th>Итого</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as row (row.key)}
          <tr class:is-direct={row.direct}>
            <th style={`--marker:${safeColor(row.color)};--level:${row.level}`}>
              <span class="activity-marker"></span>
              {#if row.direct}<i class="bi bi-arrow-return-right direct-icon" aria-label="Использовано напрямую"></i>{/if}
              <span>{row.direct ? "сам блок" : row.name}</span>
            </th>
            {#each columns as column, index}
              <td>{row.days[index] ? durationText(row.days[index]) : "—"}</td>
            {/each}
            <td><strong>{durationText(row.total)}</strong></td>
          </tr>
        {/each}
        <tr class="service-row"><th>Занято всего</th>{#each busyByDay as min}<td>{durationText(min)}</td>{/each}<td>{durationText(totalBusy)}</td></tr>
        <tr class="service-row"><th>Не распределено</th>{#each columns as column, index}<td>{durationText(Math.max(0, column.end - column.start - busyByDay[index]))}</td>{/each}<td>{durationText(Math.max(0, WEEK_MIN - totalBusy))}</td></tr>
        <tr class="service-row"><th>Всего в дне</th>{#each columns as column}<td>{durationText(column.end - column.start)}</td>{/each}<td>{durationText(columnTotal)}</td></tr>
        <tr class="service-row"><th>Отклонение от 24 часов</th>{#each columns as column}<td>{durationText(column.end - column.start - DAY_MIN)}</td>{/each}<td></td></tr>
        <tr class="service-row"><th>Отклонение от 168 часов</th>{#each columns as _}<td></td>{/each}<td>{durationText(columnTotal - WEEK_MIN)}</td></tr>
      </tbody>
    </table>
  </div>
</div>
