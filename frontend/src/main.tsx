import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { ThemeProvider } from './hooks/useTheme';
import { ScramblePreviewSettingsProvider } from './hooks/useScramblePreviewSettings';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <ThemeProvider>
      <ScramblePreviewSettingsProvider>
        <App />
      </ScramblePreviewSettingsProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
