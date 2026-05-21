<script lang="ts">
  import { childrenMap, durationText, safeColor } from "../lib/state";
  import type { Activity, RythmState } from "../lib/types";

  export let state: RythmState;
  export let onOpenActivity: (id: string | null) => void = () => {};

  $: children = childrenMap(state);
</script>

{#snippet node(activity: Activity, level: number)}
  {@const kids = children.get(activity.id) || []}
  <div
    class:is-group={kids.length > 0}
    class:is-leaf={!kids.length}
    class:is-archived={activity.archived}
    class="activity-row"
    style={`--marker:${safeColor(activity.color)};--level:${level}`}
  >
    <span class="activity-marker"></span>
    <div class="activity-main">
      <strong>{activity.name}</strong>
      <small>{kids.length ? `${kids.length} влож.` : "лист"} · {durationText(activity.defaultDurationMin)}</small>
    </div>
    <span>{durationText(activity.defaultDurationMin)}</span>
    <button type="button" class="btn btn-outline-secondary btn-sm" on:click={() => onOpenActivity(activity.id)}>
      <i class="bi bi-pencil" aria-hidden="true"></i>
      <span>Править</span>
    </button>
  </div>
  {#each kids as child (child.id)}
    {@render node(child, level + 1)}
  {/each}
{/snippet}

<div class="activities-screen">
  <div class="screen-head">
    <div>
      <h1>Активности</h1>
      <p>Иерархия до 3 уровней; группы тоже можно ставить в неделю.</p>
    </div>
    <button type="button" class="btn btn-dark btn-sm app-btn" on:click={() => onOpenActivity(null)}>
      <i class="bi bi-plus-lg" aria-hidden="true"></i>
      <span>Добавить</span>
    </button>
  </div>
  <div class="activity-tree">
    {#each children.get("root") || [] as activity (activity.id)}
      {@render node(activity, 1)}
    {/each}
  </div>
</div>
