import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Auth from './Auth';

// Mock supabase auth methods
const mockSignIn = vi.fn();
const mockSignUp = vi.fn();
const mockResetPassword = vi.fn();
const mockUpdateUser = vi.fn();

vi.mock('../services/auth', () => ({
  supabase: {
    auth: {
      signInWithPassword: (...args: unknown[]) => mockSignIn(...args),
      signUp: (...args: unknown[]) => mockSignUp(...args),
      resetPasswordForEmail: (...args: unknown[]) => mockResetPassword(...args),
      updateUser: (...args: unknown[]) => mockUpdateUser(...args),
    },
  },
  supabaseConfigMissing: false,
}));

// Mock toast
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const renderAuth = () =>
  render(
    <MemoryRouter initialEntries={['/login']}>
      <Auth />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  // Default hash: no recovery
  Object.defineProperty(window, 'location', {
    value: { hash: '', origin: 'http://localhost' },
    writable: true,
  });
});

describe('Auth modes', () => {
  it('renders login mode by default', () => {
    renderAuth();
    expect(screen.getByText('Login to Ao5')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Email')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Login' })).toBeInTheDocument();
  });

  it('switches to signup mode via link', () => {
    renderAuth();
    fireEvent.click(screen.getByText("Don't have an account? Sign Up"));
    expect(screen.getByText('Sign Up for Ao5')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign Up' })).toBeInTheDocument();
  });

  it('switches to reset mode via link', () => {
    renderAuth();
    fireEvent.click(screen.getByText('Forgot your password?'));
    expect(screen.getByText('Reset Password')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Email')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Password')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send Reset Link' })).toBeInTheDocument();
  });

  it('renders update mode when URL hash contains type=recovery', () => {
    Object.defineProperty(window, 'location', {
      value: { hash: '#type=recovery&token=abc', origin: 'http://localhost' },
      writable: true,
    });
    renderAuth();
    expect(screen.getByRole('heading', { name: 'Update Password' })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Email')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('New Password')).toBeInTheDocument();
  });

  it('shows Back to timer link in login mode', () => {
    renderAuth();
    expect(screen.getByText('Back to timer')).toBeInTheDocument();
  });

  it('does not show Back to timer in signup mode', () => {
    renderAuth();
    fireEvent.click(screen.getByText("Don't have an account? Sign Up"));
    expect(screen.queryByText('Back to timer')).not.toBeInTheDocument();
  });
});

describe('Auth submit success paths', () => {
  it('login: calls signInWithPassword and navigates to /', async () => {
    mockSignIn.mockResolvedValue({ error: null });
    renderAuth();
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));
    await waitFor(() => expect(mockSignIn).toHaveBeenCalledWith({ email: 'a@b.com', password: 'secret' }));
    expect(mockNavigate).toHaveBeenCalledWith('/');
    expect(mockToastSuccess).not.toHaveBeenCalled();
  });

  it('signup: calls signUp and shows confirmation toast', async () => {
    mockSignUp.mockResolvedValue({ error: null });
    renderAuth();
    fireEvent.click(screen.getByText("Don't have an account? Sign Up"));
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign Up' }));
    await waitFor(() => expect(mockSignUp).toHaveBeenCalled());
    expect(mockToastSuccess).toHaveBeenCalledWith('Check your email for the confirmation link!');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('reset: calls resetPasswordForEmail, shows toast, and switches to login', async () => {
    mockResetPassword.mockResolvedValue({ error: null });
    renderAuth();
    fireEvent.click(screen.getByText('Forgot your password?'));
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'a@b.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send Reset Link' }));
    await waitFor(() => expect(mockResetPassword).toHaveBeenCalled());
    expect(mockToastSuccess).toHaveBeenCalledWith('Check your email for the password reset link.');
    // Should switch back to login
    await waitFor(() => expect(screen.getByText('Login to Ao5')).toBeInTheDocument());
  });

  it('update: calls updateUser, shows toast, and switches to login', async () => {
    Object.defineProperty(window, 'location', {
      value: { hash: '#type=recovery&token=abc', origin: 'http://localhost' },
      writable: true,
    });
    mockUpdateUser.mockResolvedValue({ error: null });
    renderAuth();
    fireEvent.change(screen.getByPlaceholderText('New Password'), { target: { value: 'newpass' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update Password' }));
    await waitFor(() => expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'newpass' }));
    expect(mockToastSuccess).toHaveBeenCalledWith('Password updated successfully!');
    await waitFor(() => expect(screen.getByText('Login to Ao5')).toBeInTheDocument());
  });
});

describe('Auth submit error paths', () => {
  it('login: shows error toast on Supabase error', async () => {
    mockSignIn.mockResolvedValue({ error: new Error('Invalid credentials') });
    renderAuth();
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Invalid credentials'));
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('signup: shows error toast on Supabase error', async () => {
    mockSignUp.mockResolvedValue({ error: new Error('Email already taken') });
    renderAuth();
    fireEvent.click(screen.getByText("Don't have an account? Sign Up"));
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign Up' }));
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Email already taken'));
  });
});
