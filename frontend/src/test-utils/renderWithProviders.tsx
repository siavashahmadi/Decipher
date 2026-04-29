import type { ReactElement, ReactNode } from 'react';
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../contexts/AuthContext';
import { SettingsProvider } from '../hooks/useSettings';
import { ScramblePreviewSettingsProvider } from '../hooks/useScramblePreviewSettings';

export interface ProviderOptions {
  initialEntries?: string[];
}

export const AppProviders = ({
  children,
  initialEntries = ['/'],
}: { children: ReactNode } & ProviderOptions): ReactElement => (
  <MemoryRouter initialEntries={initialEntries}>
    <AuthProvider>
      <SettingsProvider>
        <ScramblePreviewSettingsProvider>{children}</ScramblePreviewSettingsProvider>
      </SettingsProvider>
    </AuthProvider>
  </MemoryRouter>
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
