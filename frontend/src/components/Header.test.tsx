import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, within } from '@testing-library/react';
import { renderWithProviders } from '../test-utils/renderWithProviders';
import Header from './Header';
import type { PuzzleType } from '../types';

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ isGuest: true, session: null }),
  useOptionalAuth: () => ({ isGuest: true, session: null }),
  AuthProvider: ({ children }: { children: unknown }) => children,
}));

vi.mock('../services/authClient', () => ({
  supabaseAuthClient: {
    signOut: vi.fn().mockResolvedValue({ error: null }),
  },
}));

const defaultProps = {
  type: '3x3' as PuzzleType,
  handleTypeChange: vi.fn(),
};

let matchMediaOverride: ((query: string) => boolean) | null = null;

beforeEach(() => {
  matchMediaOverride = null;

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn((query: string) => {
      const matches = matchMediaOverride ? matchMediaOverride(query) : false;
      return {
        matches,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      };
    }),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function setMobileViewport() {
  matchMediaOverride = (query: string) => {
    if (query === '(max-width: 600px)') return true;
    return false;
  };
}

function setDesktopViewport() {
  matchMediaOverride = () => false;
}

describe('Header mobile hamburger menu', () => {
  describe('at phone width (393px)', () => {
    beforeEach(() => {
      setMobileViewport();
    });

    it('renders hamburger button with correct aria attributes', () => {
      renderWithProviders(<Header {...defaultProps} />);
      const hamburger = screen.getByLabelText('Menu');
      expect(hamburger).toBeInTheDocument();
      expect(hamburger).toHaveAttribute('aria-expanded', 'false');
      expect(hamburger).toHaveAttribute('aria-haspopup', 'menu');
    });

    it('renders only logo, puzzle picker, and hamburger as top-level header children', () => {
      renderWithProviders(<Header {...defaultProps} />);
      const header = screen.getByRole('banner');
      expect(within(header).getByText('Ao5')).toBeInTheDocument();
      expect(within(header).getByRole('combobox')).toBeInTheDocument();
      expect(within(header).getByLabelText('Menu')).toBeInTheDocument();
      expect(within(header).queryByText('Timer')).not.toBeInTheDocument();
      expect(within(header).queryByText('Stats')).not.toBeInTheDocument();
      expect(within(header).queryByText('Trainers')).not.toBeInTheDocument();
      expect(within(header).queryByLabelText('Settings')).not.toBeInTheDocument();
      expect(within(header).queryByText('Sign In')).not.toBeInTheDocument();
    });

    it('sets aria-expanded to true when hamburger is clicked', () => {
      renderWithProviders(<Header {...defaultProps} />);
      const hamburger = screen.getByLabelText('Menu');
      fireEvent.click(hamburger);
      expect(hamburger).toHaveAttribute('aria-expanded', 'true');
    });

    it('shows menu with items in correct order when opened', () => {
      renderWithProviders(<Header {...defaultProps} />);
      fireEvent.click(screen.getByLabelText('Menu'));
      const menu = screen.getByRole('menu');
      const items = within(menu).getAllByRole('menuitem');
      expect(items).toHaveLength(5);
      expect(items[0]).toHaveTextContent('Timer');
      expect(items[1]).toHaveTextContent('Stats');
      expect(items[2]).toHaveTextContent('Trainers');
      expect(items[3]).toHaveTextContent('Settings');
      expect(items[4]).toHaveTextContent('Sign In');
    });

    it('closes menu when Escape is pressed', () => {
      renderWithProviders(<Header {...defaultProps} />);
      fireEvent.click(screen.getByLabelText('Menu'));
      expect(screen.getByRole('menu')).toBeInTheDocument();
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Menu')).toHaveAttribute('aria-expanded', 'false');
    });

    it('closes menu when clicking outside', () => {
      renderWithProviders(<Header {...defaultProps} />);
      fireEvent.click(screen.getByLabelText('Menu'));
      expect(screen.getByRole('menu')).toBeInTheDocument();
      fireEvent.pointerDown(document.body);
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('traps focus within the open menu', () => {
      renderWithProviders(<Header {...defaultProps} />);
      fireEvent.click(screen.getByLabelText('Menu'));
      const menu = screen.getByRole('menu');
      const items = within(menu).getAllByRole('menuitem');
      const first = items[0]!;
      const last = items[items.length - 1]!;

      first.focus();
      expect(document.activeElement).toBe(first);

      fireEvent.keyDown(menu, { key: 'Tab', shiftKey: true });
      expect(document.activeElement).toBe(last);

      fireEvent.keyDown(menu, { key: 'Tab' });
      expect(document.activeElement).toBe(first);
    });

    it('closes menu when a nav item is clicked', () => {
      renderWithProviders(<Header {...defaultProps} />);
      fireEvent.click(screen.getByLabelText('Menu'));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Stats' }));
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('opens SettingsPanel as modal with role=dialog and aria-modal=true', () => {
      renderWithProviders(<Header {...defaultProps} />);
      fireEvent.click(screen.getByLabelText('Menu'));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Settings' }));
      const dialog = screen.getByRole('dialog', { name: 'Settings' });
      expect(dialog).toHaveAttribute('aria-modal', 'true');
    });
  });

  describe('at desktop width (1024px)', () => {
    beforeEach(() => {
      setDesktopViewport();
    });

    it('renders the horizontal Header with nav links and no hamburger', () => {
      renderWithProviders(<Header {...defaultProps} />);
      expect(screen.queryByLabelText('Menu')).not.toBeInTheDocument();
      expect(screen.getByText('Timer')).toBeInTheDocument();
      expect(screen.getByText('Stats')).toBeInTheDocument();
      expect(screen.getByText('Trainers')).toBeInTheDocument();
      expect(screen.getByLabelText('Settings')).toBeInTheDocument();
    });
  });
});
