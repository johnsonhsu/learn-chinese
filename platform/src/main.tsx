import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './ui/ui-kit.css';
import './theme/theme-indigo.css';
import './theme/theme-midnight.css';
import './theme/theme-sakura.css';
import './theme/theme-matcha.css';

// Stamp the shipped content version into the DOM (and thus the bundle). This makes
// the JS change whenever data changes, so the service-worker update banner fires on
// content-only releases too — see vite.config define __CONTENT_VERSION__.
document.documentElement.dataset.contentVersion = __CONTENT_VERSION__;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
