<script lang="ts">
  import type { Shot } from '../capture';
  import { timestampName } from '../capture';
  import { canUseFolder, saveToFolder, downloadBlob } from '../save';
  import { canShareFile, shareFile, canCopyImage, copyImage } from '../share';

  let {
    shot,
    onRetake,
    onToast,
  }: {
    shot: Shot;
    onRetake: () => void;
    onToast: (message: string) => void;
  } = $props();

  let busy = $state(false);
  const folder = canUseFolder();
  const copyable = canCopyImage();
  const shareable = $derived(canShareFile(shot.blob, 'popstrip.png'));

  const today = new Date().toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  async function save(): Promise<void> {
    if (busy) return;
    busy = true;
    const name = timestampName();
    try {
      if (folder) {
        const result = await saveToFolder(shot.blob, name);
        onToast(result === 'saved' ? '✓ Saved to your folder' : 'Save cancelled');
      } else {
        downloadBlob(shot.blob, name);
        onToast('✓ Photo downloaded');
      }
    } catch {
      downloadBlob(shot.blob, name);
      onToast('✓ Photo downloaded');
    } finally {
      busy = false;
    }
  }

  async function share(): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      const result = await shareFile(shot.blob, timestampName());
      if (result === 'unsupported') onToast('Sharing isn’t available in this browser');
    } catch {
      onToast('Couldn’t open the share sheet');
    } finally {
      busy = false;
    }
  }

  async function copy(): Promise<void> {
    if (busy) return;
    busy = true;
    const ok = await copyImage(shot.blob);
    onToast(ok ? '✓ Copied to clipboard' : 'Copy isn’t available here');
    busy = false;
  }
</script>

<div class="review-body">
  <div class="photo">
    <img src={shot.url} alt="Your latest PopStrip capture" />
    <div class="caption">PopStrip · <b>{today}</b></div>
  </div>

  <div class="review-actions">
    <h2>Looks great!</h2>
    <p>Your photo is ready. Everything stayed on your device.</p>

    <button class="act primary" onclick={save} disabled={busy}>
      <span class="ic">💾</span>
      <span>Save<small>{folder ? 'to your PopStrip folder' : 'download the photo'}</small></span>
    </button>

    {#if shareable}
      <button class="act" onclick={share} disabled={busy}>
        <span class="ic">📤</span>
        <span>Share<small>Messages, Photos…</small></span>
      </button>
    {/if}

    {#if copyable}
      <button class="act" onclick={copy} disabled={busy}>
        <span class="ic">📋</span>
        <span>Copy<small>to the clipboard</small></span>
      </button>
    {/if}

    <button class="act" onclick={onRetake} disabled={busy}>
      <span class="ic">↺</span>
      <span>Retake<small>back to the booth</small></span>
    </button>
  </div>
</div>
