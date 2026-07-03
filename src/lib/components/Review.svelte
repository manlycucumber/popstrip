<script lang="ts">
  import type { Layout, Shot } from '../capture';
  import { timestampName } from '../capture';
  import { extForMime } from '../record';
  import { canUseFolder, saveToFolder, downloadBlob } from '../save';
  import { canShareFile, shareFile, canCopyImage, copyImage } from '../share';

  let {
    shot,
    canEdit,
    currentLayout,
    onRetake,
    onRetakeCell,
    onRelayout,
    onToast,
  }: {
    shot: Shot;
    canEdit: boolean;
    currentLayout: Layout;
    onRetake: () => void;
    onRetakeCell: (index: number) => void;
    onRelayout: (layout: Layout) => void;
    onToast: (message: string) => void;
  } = $props();

  let busy = $state(false);
  let saved = $state(false);
  const folder = canUseFolder();
  const copyable = canCopyImage();
  const isVideo = $derived(shot.media === 'video');
  const ext = $derived(isVideo ? extForMime(shot.blob.type) : 'png');
  const shareable = $derived(canShareFile(shot.blob, `popstrip.${ext}`));
  // A movie clip is nominally kind:'single', so relayout/redo only apply to photos.
  const isQuad = $derived(!isVideo && (shot.kind === 'quad' || shot.kind === 'strip'));

  async function save(): Promise<void> {
    if (busy) return;
    busy = true;
    const name = timestampName(ext);
    const doneMsg = isVideo ? '✓ Movie downloaded' : '✓ Photo downloaded';
    try {
      if (folder) {
        const result = await saveToFolder(shot.blob, name);
        onToast(result === 'saved' ? '✓ Saved to your folder' : 'Save cancelled');
        if (result === 'saved') saved = true;
      } else {
        downloadBlob(shot.blob, name);
        onToast(doneMsg);
        saved = true;
      }
    } catch {
      downloadBlob(shot.blob, name);
      onToast(doneMsg);
      saved = true;
    } finally {
      busy = false;
    }
  }

  async function share(): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      const result = await shareFile(shot.blob, timestampName(ext));
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
  <div class="photo bare" class:strip={shot.kind === 'strip'} class:video={isVideo}>
    {#if isVideo}
      <!-- svelte-ignore a11y_media_has_caption -->
      <video src={shot.url} controls autoplay playsinline></video>
    {:else}
      <img src={shot.url} alt="Your latest PopStrip capture" />
    {/if}
  </div>

  <div class="review-actions">
    <h2>{isVideo ? 'Nice clip!' : 'Looks great!'}</h2>
    <p>Your {isVideo ? 'movie' : 'photo'} is ready. Everything stayed on your device.</p>

    {#if canEdit && isQuad}
      <div class="layouts" role="group" aria-label="Layout">
        <button class="chip" aria-pressed={currentLayout === 'quad'} onclick={() => onRelayout('quad')} disabled={busy}>
          ▦ Grid
        </button>
        <button class="chip" aria-pressed={currentLayout === 'strip'} onclick={() => onRelayout('strip')} disabled={busy}>
          ▤ Strip
        </button>
      </div>
      <div class="cellretakes">
        <span class="cr-label">Redo a shot</span>
        <div class="cr-row">
          {#each [0, 1, 2, 3] as i (i)}
            <button class="cr" onclick={() => onRetakeCell(i)} disabled={busy} aria-label={`Retake photo ${i + 1}`}>
              {i + 1}
            </button>
          {/each}
        </div>
      </div>
    {/if}

    <button class="act primary" class:saved onclick={save} disabled={busy}>
      <span class="ic">{saved ? '✓' : '💾'}</span>
      <span
        >{saved ? 'Saved' : 'Save'}<small
          >{saved
            ? folder
              ? 'in your PopStrip folder'
              : 'on your device'
            : folder
              ? 'to your PopStrip folder'
              : isVideo
                ? 'download the movie'
                : 'download the photo'}</small
        ></span
      >
    </button>

    {#if shareable}
      <button class="act" onclick={share} disabled={busy}>
        <span class="ic">📤</span>
        <span>Share<small>Messages, Photos…</small></span>
      </button>
    {/if}

    {#if copyable && !isVideo}
      <button class="act" onclick={copy} disabled={busy}>
        <span class="ic">📋</span>
        <span>Copy<small>to the clipboard</small></span>
      </button>
    {/if}

    <button class="act" onclick={onRetake} disabled={busy}>
      <span class="ic">↺</span>
      <span>{isVideo ? 'New clip' : isQuad ? 'New set' : 'Retake'}<small>back to the booth</small></span>
    </button>
  </div>
</div>
