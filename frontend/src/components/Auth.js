import { useState, useEffect } from 'react';
import { supabase } from '../services/auth';
import logo from '../logo.svg';
import './Auth.css';

export default function Auth({ onBack }) {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('login'); // 'login', 'signup', 'reset', or 'update'

  useEffect(() => {
    // Check if we're in a password reset flow
    const hash = window.location.hash;
    if (hash && hash.includes('type=recovery')) {
      setMode('update');
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        alert('Check your email for the confirmation link!');
      } else if (mode === 'reset') {
        alert('Check your email for the password reset link!');
        setMode('login');
      } else if (mode === 'update') {
        const { error } = await supabase.auth.updateUser({
          password: password
        });
        if (error) throw error;
        alert('Password updated successfully!');
        // Clear the recovery hash from URL
        window.location.hash = '';
        setMode('login');
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <img 
        src={logo}
        alt="Ao5 Logo" 
        className="auth-logo"
      />
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