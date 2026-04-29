import type { ReactElement, ReactNode } from 'react';
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../contexts/AuthContext';
import { SettingsProvider } from '../hooks/useSettings';
import { ScramblePreviewSettingsProvider } from '../hooks/useScramblePreviewSettings';

export interface ProviderOptions {
  initialEntries?: string[];
}

// Build a fresh QueryClient per test so query state never leaks between
// renders. Disable retries in tests so failure paths surface immediately.
export const createTestQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });

export const AppProviders = ({
  children,
  initialEntries = ['/'],
}: { children: ReactNode } & ProviderOptions): ReactElement => (
  <QueryClientProvider client={createTestQueryClient()}>
    <MemoryRouter initialEntries={initialEntries}>
      <AuthProvider>
        <SettingsProvider>
          <ScramblePreviewSettingsProvider>{children}</ScramblePreviewSettingsProvider>
        </SettingsProvider>
      </AuthProvider>
    </MemoryRouter>
  </QueryClientProvider>
);

export const wrapperFactory = (options: ProviderOptions = {}) =>
  ({ children }: { children: ReactNode }): ReactElement =>
    <AppProviders {...options}>{children}</AppProviders>;

export const renderWithProviders = (
  ui: ReactElement,
  options: ProviderOptions & Omit<RenderOptions, 'wrapper'> = {},
): RenderResult => {
  const { initialEntries, ...rest } = options;
  return render(ui, { wrapper: wrapperFactory({ initialEntries }), ...rest });
};
