<script lang="ts">
  export let open: boolean = false;
  export let title: string = "";
  export let size: "" | "lg" = "";
  export let scrollable: boolean = false;
  export let onClose: () => void = () => {};
</script>

{#if open}
  <button class="modal-backdrop fade show modal-backdrop-button" type="button" aria-label="Закрыть" on:click={onClose}></button>
  <div class="modal fade show app-svelte-modal" tabindex="-1" aria-modal="true" role="dialog">
    <div class:modal-lg={size === "lg"} class:modal-dialog-scrollable={scrollable} class="modal-dialog modal-dialog-centered">
      <form class="modal-content app-modal" on:submit|preventDefault>
        <div class="modal-header">
          <h3 class="modal-title">{title}</h3>
          <button class="btn-close" type="button" aria-label="Закрыть" on:click={onClose}></button>
        </div>
        <div class="modal-body">
          <slot />
        </div>
      </form>
    </div>
  </div>
{/if}
