<script lang="ts">
  import { colorFamilies } from "../lib/colors";

  export let value: string = "#3b82f6";
  export let onPick: (color: string) => void = () => {};
</script>

<div class="color-grid">
  {#each colorFamilies as family}
    <section class="color-family">
      <div class="color-family-title">{family.name}</div>
      <div class="color-family-swatches">
        {#each family.colors as color}
          <button
            type="button"
            class:is-selected={color.toLowerCase() === String(value || "").toLowerCase()}
            class="color-swatch"
            style={`--swatch:${color}`}
            title={`${family.name}: ${color}`}
            on:click={() => onPick(color)}
          ></button>
        {/each}
      </div>
    </section>
  {/each}
</div>
