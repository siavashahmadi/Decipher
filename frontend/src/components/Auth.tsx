import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { supabase } from '../services/auth';
import './Auth.css';

type AuthMode = 'login' | 'signup' | 'reset' | 'update';

interface AuthProps {
  onBack: () => void;
}

export default function Auth({ onBack }: AuthProps): React.ReactElement {
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

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      setLoading(true);
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        alert('Check your email for the confirmation link!');
      } else if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        });
        if (error) throw error;
        toast.success('Check your email for the password reset link.');
        setMode('login');
      } else if (mode === 'update') {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        alert('Password updated successfully!');
        window.location.hash = '';
        setMode('login');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
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
        <h2>
          {mode === 'login' ? 'Login to Ao5' :
           mode === 'signup' ? 'Sign Up for Ao5' :
           mode === 'update' ? 'Update Password' :
           'Reset Password'}
        </h2>
        <form onSubmit={handleSubmit}>
          {mode !== 'update' && (
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
          {(mode !== 'reset') && (
            <div className="form-group">
              <input
                type="password"
                placeholder={mode === 'update' ? 'New Password' : 'Password'}
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
            {loading ? 'Loading...' :
             mode === 'login' ? 'Login' :
             mode === 'signup' ? 'Sign Up' :
             mode === 'update' ? 'Update Password' :
             'Send Reset Link'}
          </button>
        </form>
        {mode !== 'update' && (
          <div className="auth-links">
            {mode === 'login' ? (
              <>
                <button
                  className="auth-link-button"
                  onClick={() => setMode('signup')}
                >
                  Don't have an account? Sign Up
                </button>
                <button
                  className="auth-link-button"
                  onClick={() => setMode('reset')}
                >
                  Forgot your password?
                </button>
                <button
                  className="auth-link-button"
                  onClick={onBack}
                >
                  Back to timer
                </button>
              </>
            ) : (
              <button
                className="auth-link-button"
                onClick={() => setMode('login')}
              >
                {mode === 'signup' ? 'Already have an account? Login' : 'Back to Login'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
