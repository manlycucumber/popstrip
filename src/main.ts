import './app.css';
import { mount } from 'svelte';
import App from './App.svelte';
import { registerSW } from './lib/pwa';

const app = mount(App, {
  target: document.getElementById('app')!,
});

registerSW();

export default app;
