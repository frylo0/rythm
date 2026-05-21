<script lang="ts">
  import { childrenMap, durationText, safeColor } from "../lib/state";
  import type { Activity, SystemPurchase } from "../lib/types";

  export let activities: Activity[] = [];
  export let selectedId: string | null = null;
  export let selectedSystem: SystemPurchase | null = null;
  export let allowSystem: boolean = true;
  export let onPick: (id: string) => void = () => {};
  export let onPickSystem: (system: SystemPurchase) => void = () => {};

  $: children = childrenMap({ activities });

  function roots(): Activity[] {
    return children.get("root") || [];
  }
</script>

{#snippet node(activity: Activity, level: number)}
  {@const kids = children.get(activity.id) || []}
  <div class="picker-tree-node">
    <button
      type="button"
      class:is-group={kids.length}
      class:is-leaf={!kids.length}
      class:is-selected={activity.id === selectedId}
      class="picker-tree-item"
      style={`--level:${level}`}
      on:click={() => onPick(activity.id)}
    >
      <span class="activity-marker" style={`--marker:${safeColor(activity.color)}`}></span>
      <span class="picker-tree-title">{activity.name}</span>
      <small>{kids.length ? `${kids.length} влож.` : "лист"} · {durationText(activity.defaultDurationMin)}</small>
    </button>
    {#each kids as child (child.id)}
      {@render node(child, level + 1)}
    {/each}
  </div>
{/snippet}

<div class="picker-tree">
  {#each roots() as activity (activity.id)}
    {@render node(activity, 1)}
  {/each}
  {#if allowSystem}
    <button
      type="button"
      class:is-selected={selectedSystem === "dayStart"}
      class="picker-tree-item system"
      on:click={() => onPickSystem("dayStart")}
    >
      <span class="activity-marker"></span>
      <span class="picker-tree-title">Начало дня</span>
      <small>системный маркер</small>
    </button>
    <button
      type="button"
      class:is-selected={selectedSystem === "dayEnd"}
      class="picker-tree-item system"
      on:click={() => onPickSystem("dayEnd")}
    >
      <span class="activity-marker"></span>
      <span class="picker-tree-title">Конец дня</span>
      <small>системный маркер</small>
    </button>
  {/if}
</div>
