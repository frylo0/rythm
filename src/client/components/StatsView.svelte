<script lang="ts">
  import { onMount, tick } from "svelte";
  import {
    WEEK_MIN,
    activityMap,
    blocksInColumn,
    childrenMap,
    dayColumns,
    descendantsOf,
    durationText,
    safeColor,
    sleepAfterColumn
  } from "../lib/state";
  import type { Activity, DayColumn, RythmState } from "../lib/types";

  export let state: RythmState;

  type SortKey = "hierarchy" | "name" | "total" | `day:${number}`;
  type SortDir = "asc" | "desc";
  let sortKey: SortKey = "hierarchy";
  let sortDir: SortDir = "desc";
  let statsScroll: HTMLElement;
  let statsTable: HTMLTableElement;
  let fixedHeaderActive = false;
  let fixedHeaderStyle = "";
  let fixedHeaderTableStyle = "";
  let statsLeftShift = 0;
  let mounted = false;
  let updateFrame = 0;

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
      [...blocksInColumn(state, column), sleepAfterColumn(state, column)].forEach((item) => {
        if (!item) return;
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

  function sortedRows(source: StatsRow[]): StatsRow[] {
    if (sortKey === "hierarchy") return source;
    const direction = sortDir === "asc" ? 1 : -1;
    return source.slice().sort((a, b) => {
      if (sortKey === "name") return direction * a.name.localeCompare(b.name, "ru");
      if (sortKey === "total") return direction * (a.total - b.total || a.name.localeCompare(b.name, "ru"));
      const dayIndex = Number(sortKey.split(":")[1]);
      return direction * ((a.days[dayIndex] || 0) - (b.days[dayIndex] || 0) || a.name.localeCompare(b.name, "ru"));
    });
  }

  function sortTitle(key: SortKey): string {
    if (sortKey !== key) return "";
    if (key === "hierarchy") return " · иерархия";
    return sortDir === "asc" ? " · ↑" : " · ↓";
  }

  function setSort(key: SortKey): void {
    if (key === "name" && sortKey === "name" && sortDir === "asc") {
      sortKey = "hierarchy";
      sortDir = "desc";
      return;
    }
    if (sortKey === key) {
      sortDir = sortDir === "asc" ? "desc" : "asc";
      return;
    }
    sortKey = key;
    sortDir = key === "name" ? "asc" : "desc";
  }

  function topbarBottom(): number {
    return Math.max(0, document.querySelector<HTMLElement>(".topbar")?.getBoundingClientRect().bottom || 0);
  }

  function updateStatsFixedLayers(): void {
    updateFrame = 0;
    if (!statsScroll || !statsTable) return;
    const scrollRect = statsScroll.getBoundingClientRect();
    const tableRect = statsTable.getBoundingClientRect();
    const header = statsTable.querySelector<HTMLElement>("thead");
    const headerHeight = header?.getBoundingClientRect().height || 0;
    const top = topbarBottom();
    statsLeftShift = statsScroll.scrollLeft;
    fixedHeaderActive = headerHeight > 0 && tableRect.top < top && tableRect.bottom > top + headerHeight;
    if (!fixedHeaderActive) return;
    const left = Math.max(0, scrollRect.left);
    const width = Math.max(0, Math.min(scrollRect.width, window.innerWidth - left));
    fixedHeaderStyle = `top:${top}px;left:${left}px;width:${width}px;height:${headerHeight}px`;
    fixedHeaderTableStyle = `--day-count:${columns.length};--stats-left-shift:${statsLeftShift}px;width:${statsTable.offsetWidth}px;transform:translateX(${-statsLeftShift}px)`;
  }

  function scheduleStatsFixedUpdate(): void {
    if (!mounted || updateFrame) return;
    updateFrame = window.requestAnimationFrame(updateStatsFixedLayers);
  }

  onMount(() => {
    mounted = true;
    const updateAfterRender = () => void tick().then(scheduleStatsFixedUpdate);
    updateAfterRender();
    window.addEventListener("scroll", scheduleStatsFixedUpdate, { passive: true });
    window.addEventListener("resize", scheduleStatsFixedUpdate);
    statsScroll?.addEventListener("scroll", scheduleStatsFixedUpdate, { passive: true });
    return () => {
      mounted = false;
      if (updateFrame) window.cancelAnimationFrame(updateFrame);
      window.removeEventListener("scroll", scheduleStatsFixedUpdate);
      window.removeEventListener("resize", scheduleStatsFixedUpdate);
      statsScroll?.removeEventListener("scroll", scheduleStatsFixedUpdate);
    };
  });

  $: columns = dayColumns(state);
  $: rows = buildRows(columns);
  $: visibleRows = sortedRows(rows);
  $: busyByDay = columns.map((column) => [...blocksInColumn(state, column), sleepAfterColumn(state, column)].reduce((sum, item) => item ? sum + item.endAbsMin - item.startAbsMin : sum, 0));
  $: totalBusy = busyByDay.reduce((sum, value) => sum + value, 0);
  $: columnDurations = columns.map((column) => column.end - column.start + (sleepAfterColumn(state, column)?.endAbsMin || 0) - (sleepAfterColumn(state, column)?.startAbsMin || 0));
  $: columnTotal = columnDurations.reduce((sum, value) => sum + value, 0);
  $: totalFree = Math.max(0, WEEK_MIN - totalBusy);
  $: if (mounted) {
    columns;
    visibleRows;
    sortKey;
    sortDir;
    void tick().then(scheduleStatsFixedUpdate);
  }
</script>

<div class="stats-screen">
  <div class="stats-title-block">
    <h1 class="stats-title">Статистика</h1>
    <figure class="stats-quote" aria-label="Цитата из аниме Блич">
      <blockquote>
        Мы <span>страшимся</span> того, что нельзя узреть —
        Мы <span>почитаем</span> то, что не видим
      </blockquote>
      <figcaption>Ичиго, “Блич”, 1 серия</figcaption>
    </figure>
  </div>
  <div class="stats-scroll" bind:this={statsScroll}>
    <table
      bind:this={statsTable}
      class:is-left-fixed={statsLeftShift > 0}
      class="stats-table"
      style={`--day-count:${columns.length};--stats-left-shift:${statsLeftShift}px`}
    >
      <thead>
        <tr>
          <th><button class="stats-sort" type="button" on:click={() => setSort("name")}>Активность{sortTitle(sortKey === "hierarchy" ? "hierarchy" : "name")}</button></th>
          {#each columns as column, index}
            <th class:is-weekend={column.index === 5 || column.index === 6} class:warn-col={column.extra}><button class="stats-sort" type="button" on:click={() => setSort(`day:${index}`)}>{column.label}{sortTitle(`day:${index}`)}</button></th>
          {/each}
          <th><button class="stats-sort" type="button" on:click={() => setSort("total")}>Итого{sortTitle("total")}</button></th>
        </tr>
      </thead>
      <tbody>
        {#each visibleRows as row (row.key)}
          <tr class:is-direct={row.direct}>
            <th style={`--marker:${safeColor(row.color)};--level:${row.level}`}>
              <span class="activity-marker"></span>
              {#if row.direct}<i class="bi bi-arrow-return-right direct-icon" aria-label="Использовано напрямую"></i>{/if}
              <span>{row.direct ? "сам блок" : row.name}</span>
            </th>
            {#each columns as column, index}
              <td class:is-empty={!row.days[index]}>{row.days[index] ? durationText(row.days[index]) : "—"}</td>
            {/each}
            <td><strong>{durationText(row.total)}</strong></td>
          </tr>
        {/each}
      </tbody>
      <tbody class="stats-summary-body" aria-label="Суммари">
        <tr class="summary-row"><th>Занято всего</th>{#each busyByDay as min}<td>{durationText(min)}</td>{/each}<td>{durationText(totalBusy)}</td></tr>
        <tr class="summary-row"><th>Не распределено</th>{#each columnDurations as min, index}<td>{durationText(Math.max(0, min - busyByDay[index]))}</td>{/each}<td>{durationText(totalFree)}</td></tr>
        <tr class="summary-row"><th>Всего в дне</th>{#each columnDurations as min}<td>{durationText(min)}</td>{/each}<td>{durationText(columnTotal)}</td></tr>
      </tbody>
    </table>
  </div>
  {#if fixedHeaderActive}
    <div class="stats-fixed-header" style={fixedHeaderStyle}>
      <table
        class:is-left-fixed={statsLeftShift > 0}
        class="stats-table stats-fixed-header-table"
        style={fixedHeaderTableStyle}
      >
        <thead>
          <tr>
            <th><button class="stats-sort" type="button" on:click={() => setSort("name")}>Активность{sortTitle(sortKey === "hierarchy" ? "hierarchy" : "name")}</button></th>
            {#each columns as column, index}
              <th class:is-weekend={column.index === 5 || column.index === 6} class:warn-col={column.extra}><button class="stats-sort" type="button" on:click={() => setSort(`day:${index}`)}>{column.label}{sortTitle(`day:${index}`)}</button></th>
            {/each}
            <th><button class="stats-sort" type="button" on:click={() => setSort("total")}>Итого{sortTitle("total")}</button></th>
          </tr>
        </thead>
      </table>
    </div>
  {/if}
</div>
