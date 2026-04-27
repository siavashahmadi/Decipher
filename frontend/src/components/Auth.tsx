import React, { useState, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '../services/auth';
import './Auth.css';

type AuthMode = 'login' | 'signup' | 'reset' | 'update';

interface SubmitContext {
  email: string;
  password: string;
}

interface ModeSpec {
  title: string;
  cta: string;
  showEmail: boolean;
  showPassword: boolean;
  passwordPlaceholder?: string;
  submit: (ctx: SubmitContext) => Promise<{ message?: string; nextMode?: AuthMode }>;
  links?: AuthMode[];
  linkLabel?: Partial<Record<AuthMode, string>>;
}

const MODE_CONFIG: Record<AuthMode, ModeSpec> = {
  login: {
    title: 'Login to Ao5',
    cta: 'Login',
    showEmail: true,
    showPassword: true,
    submit: async ({ email, password }) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return {};
    },
    links: ['signup', 'reset'],
  },
  signup: {
    title: 'Sign Up for Ao5',
    cta: 'Sign Up',
    showEmail: true,
    showPassword: true,
    submit: async ({ email, password }) => {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      return { message: 'Check your email for the confirmation link!' };
    },
    links: ['login'],
  },
  reset: {
    title: 'Reset Password',
    cta: 'Send Reset Link',
    showEmail: true,
    showPassword: false,
    submit: async ({ email }) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });
      if (error) throw error;
      return { message: 'Check your email for the password reset link.', nextMode: 'login' };
    },
    links: ['login'],
    linkLabel: { login: 'Back to Login' },
  },
  update: {
    title: 'Update Password',
    cta: 'Update Password',
    showEmail: false,
    showPassword: true,
    passwordPlaceholder: 'New Password',
    submit: async ({ password }) => {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      window.location.hash = '';
      return { message: 'Password updated successfully!', nextMode: 'login' };
    },
    linkLabel: { login: 'Back to Login' },
  },
};

const LINK_LABELS: Record<AuthMode, string> = {
  login: 'Already have an account? Login',
  signup: "Don't have an account? Sign Up",
  reset: 'Forgot your password?',
  update: 'Update Password',
};

export default function Auth(): React.ReactElement {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<AuthMode>('login');

  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.includes('type=recovery')) {
      setMode('update');
    }
  }, []);

  const config = MODE_CONFIG[mode];

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { message, nextMode } = await config.submit({ email, password });
      if (message) toast.success(message);
      if (nextMode) {
        setMode(nextMode);
      } else if (mode === 'login') {
        navigate('/');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <h1 className="auth-logo-text">Ao5</h1>
      <div className="auth-box">
        <h2>{config.title}</h2>
        <form onSubmit={handleSubmit}>
          {config.showEmail && (
            <div className="form-group">
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="auth-input"
              />
            </div>
          )}
          {config.showPassword && (
            <div className="form-group">
              <input
                type="password"
                placeholder={config.passwordPlaceholder ?? 'Password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="auth-input"
              />
            </div>
          )}
          <button
            type="submit"
            className="auth-button"
            disabled={loading}
          >
            {loading ? 'Loading...' : config.cta}
          </button>
        </form>
        {config.links && config.links.length > 0 && (
          <div className="auth-links">
            {config.links.map((target) => (
              <button
                key={target}
                className="auth-link-button"
                onClick={() => setMode(target)}
              >
                {config.linkLabel?.[target] ?? LINK_LABELS[target]}
              </button>
            ))}
            {mode === 'login' && (
              <button
                className="auth-link-button"
                onClick={() => navigate('/')}
              >
                Back to timer
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
