import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './index.css';
import App from './App';
import { SettingsProvider } from './hooks/useSettings';
import { ScramblePreviewSettingsProvider } from './hooks/useScramblePreviewSettings';
import ThemedToaster from './components/ThemedToaster';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');

// H.3: shared query cache. Stats (useAllSolves) and the timer's mutation
// callbacks share keys, so creating a solve on the timer invalidates the
// Stats cache automatically.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <SettingsProvider>
        <ScramblePreviewSettingsProvider>
          <App />
          <ThemedToaster />
        </ScramblePreviewSettingsProvider>
      </SettingsProvider>
    </QueryClientProvider>
  </StrictMode>,
);
