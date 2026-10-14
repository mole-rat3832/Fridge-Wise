import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
// Optional fonts (Settings > Text and font). Only @font-face rules: a font file downloads only when it's picked.
import '@fontsource-variable/nunito/wght.css';
import '@fontsource-variable/lexend/wght.css';
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import './index.css';

// Service worker: offline app shell + push notifications. Updates apply on the next load.
if ('serviceWorker' in navigator) {
  registerSW({ immediate: true });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
