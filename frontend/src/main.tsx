import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { SettingsProvider } from './hooks/useSettings';
import { ScramblePreviewSettingsProvider } from './hooks/useScramblePreviewSettings';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <SettingsProvider>
      <ScramblePreviewSettingsProvider>
        <App />
      </ScramblePreviewSettingsProvider>
    </SettingsProvider>
  </React.StrictMode>,
);
