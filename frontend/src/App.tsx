import type { ReactElement } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Auth from './components/Auth';
import TimerPage from './pages/Timer';
import StatsPage from './pages/Stats';
import TrainersPage from './pages/Trainers';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { supabaseConfigMissing } from './services/auth';
import './App.css';

const ConfigError = (): ReactElement => (
  <div className="app-wrapper" style={{ padding: '2rem', lineHeight: 1.5 }}>
    <h1>Configuration error</h1>
    <p>
      Supabase environment variables are not set. Create <code>frontend/.env</code> with:
    </p>
    <pre>{'VITE_SUPABASE_URL=...\nVITE_SUPABASE_ANON_KEY=...'}</pre>
    <p>Then restart the dev server.</p>
  </div>
);

const AppRoutes = (): ReactElement => {
  const { isGuest, signInVisible, hideSignIn } = useAuth();
  if (signInVisible && isGuest) {
    return <div className="app-wrapper"><Auth onBack={hideSignIn} /></div>;
  }
  return (
    <BrowserRouter>
      <div className="app-wrapper">
        <Routes>
          <Route path="/" element={<TimerPage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/trainers/*" element={<TrainersPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
};

const App = (): ReactElement => {
  if (supabaseConfigMissing) return <ConfigError />;
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
};

export default App;
