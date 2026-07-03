<script lang="ts">
  // The ⚙ Controls dropdown — pockets the six booth toggles behind one button so
  // the toolbar breathes. Closes on outside-click or Esc (Esc captured so it
  // beats the app-level key handler). Theme + mirror/sound/flash flip settings
  // directly; countdown + fullscreen are driven by the parent.
  import { onMount } from 'svelte';
  import { settings, toggleTheme } from '../settings.svelte';

  let {
    countdownLabel,
    onCountdown,
    isFullscreen,
    onFullscreen,
    locked,
  }: {
    countdownLabel: string;
    onCountdown: () => void;
    isFullscreen: boolean;
    onFullscreen: () => void;
    locked: boolean;
  } = $props();

  let open = $state(false);
  let root = $state<HTMLDivElement | null>(null);

  onMount(() => {
    const onDoc = (e: MouseEvent): void => {
      if (open && root && !root.contains(e.target as Node)) open = false;
    };
    const onKey = (e: KeyboardEvent): void => {
      if (open && e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        open = false;
      }
    };
    document.addEventListener('click', onDoc);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('click', onDoc);
      window.removeEventListener('keydown', onKey, true);
    };
  });
</script>

<div class="ctrl-anchor" bind:this={root}>
  <button
    class="controls-btn"
    class:on={open}
    onclick={() => (open = !open)}
    aria-expanded={open}
    aria-haspopup="menu"
    aria-label="Controls"
    title="Controls"
  >
    ⚙ <span class="clabel">Controls</span>
  </button>
  {#if open}
    <div class="ctrl-menu" role="menu">
      <button class="cm-row" role="menuitem" onclick={toggleTheme}>
        <span class="cm-ic">{settings.theme === 'light' ? '🌙' : '☀'}</span> Theme
        <span class="cm-v">{settings.theme === 'light' ? 'Light' : 'Dark'}</span>
      </button>
      <button class="cm-row" role="menuitem" onclick={onCountdown} disabled={locked}>
        <span class="cm-ic">⏱</span> Countdown <span class="cm-v">{countdownLabel}</span>
      </button>
      <button
        class="cm-row"
        role="menuitemcheckbox"
        onclick={() => (settings.mirror = !settings.mirror)}
        disabled={locked}
        aria-checked={settings.mirror}
      >
        <span class="cm-ic">🪞</span> Mirror <span class="cm-v">{settings.mirror ? 'On' : 'Off'}</span>
      </button>
      <button class="cm-row" role="menuitemcheckbox" onclick={() => (settings.sound = !settings.sound)} aria-checked={settings.sound}>
        <span class="cm-ic">🔊</span> Sound <span class="cm-v">{settings.sound ? 'On' : 'Off'}</span>
      </button>
      <button class="cm-row" role="menuitemcheckbox" onclick={() => (settings.flash = !settings.flash)} aria-checked={settings.flash}>
        <span class="cm-ic">⚡</span> Flash <span class="cm-v">{settings.flash ? 'On' : 'Off'}</span>
      </button>
      <button class="cm-row" role="menuitemcheckbox" onclick={onFullscreen} aria-checked={isFullscreen}>
        <span class="cm-ic">⛶</span> Fullscreen <span class="cm-v">{isFullscreen ? 'On' : 'Off'}</span>
      </button>
    </div>
  {/if}
</div>
