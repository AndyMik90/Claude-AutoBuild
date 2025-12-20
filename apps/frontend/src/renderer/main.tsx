// Initialize browser mock before anything else (no-op in Electron)
import './lib/browser-mock';

// Initialize i18n before React
import '../shared/i18n';

import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './styles/globals.css';

// Listen for main process logs and display them in DevTools
if (window.electronAPI?.onMainProcessLog) {
  window.electronAPI.onMainProcessLog((data: { level: string; args: string[] }) => {
    const prefix = '[MAIN]';
    const logArgs = [prefix, ...data.args];

    switch (data.level) {
      case 'log':
        console.log(...logArgs);
        break;
      case 'warn':
        console.warn(...logArgs);
        break;
      case 'error':
        console.error(...logArgs);
        break;
    }
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
