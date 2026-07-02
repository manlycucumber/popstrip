<script lang="ts">
  import { camera, startCamera } from '../camera.svelte';

  type Msg = { icon: string; title: string; body: string };

  const messages: Record<string, Msg> = {
    insecure: {
      icon: '🔒',
      title: 'PopStrip needs a secure connection',
      body: 'Cameras only work over https. On the live site that’s automatic — and localhost works too.',
    },
    unsupported: {
      icon: '🧭',
      title: 'This browser can’t open the camera',
      body: 'Try a recent Chrome, Edge, Safari, or Firefox.',
    },
    notfound: {
      icon: '📷',
      title: 'We can’t see a camera',
      body: 'Check that a camera is plugged in and turned on, then try again.',
    },
    denied: {
      icon: '🚫',
      title: 'Camera permission is blocked',
      body: 'Allow camera access for popstrip.app in your browser’s site settings, then try again.',
    },
    inuse: {
      icon: '🎥',
      title: 'Your camera is busy',
      body: 'Another app (like Zoom or Teams) may be using it. Close that app, then try again.',
    },
    disconnected: {
      icon: '🔌',
      title: 'The camera was disconnected',
      body: 'Reconnect your camera and try again.',
    },
    overconstrained: {
      icon: '⚙️',
      title: 'The camera couldn’t start',
      body: 'We couldn’t match the requested settings. Try again, or pick another camera.',
    },
    unknown: {
      icon: '😕',
      title: 'Something went wrong with the camera',
      body: 'Give it another try. If it keeps happening, reload the page.',
    },
  };

  const info = $derived(messages[camera.error ?? 'unknown'] ?? messages.unknown);
</script>

<div class="fallback">
  <div class="card">
    <div class="icon">{info.icon}</div>
    <h2>{info.title}</h2>
    <p>{info.body}</p>
    <button class="retry" onclick={() => startCamera()}>Try again</button>
    {#if camera.error === 'denied'}
      <div class="help">Look for the camera icon in your address bar to re-enable it.</div>
    {/if}
  </div>
</div>
