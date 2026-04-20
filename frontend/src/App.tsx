import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './services/auth';
import { getAllGuestSolves, clearAllGuestSolves } from './services/guestStorage';
import api from './services/api';
import Auth from './components/Auth';
import TimerPage from './pages/Timer';
import StatsPage from './pages/Stats';
import TrainersPage from './pages/Trainers';
import type { Session } from '@supabase/supabase-js';
import './App.css';

function App(): React.ReactElement {
  const [session, setSession] = useState<Session | null>(null);
  const [showAuth, setShowAuth] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (_event === 'SIGNED_IN') {
        const guestSolves = getAllGuestSolves();
        if (guestSolves.length > 0) {
          await api.migrateSolves(guestSolves);
          clearAllGuestSolves();
        }
      }
      setSession(session);
      setShowAuth(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  const isGuest = !session;

  if (showAuth && isGuest) {
    return <div className="app-wrapper"><Auth onBack={() => setShowAuth(false)} /></div>;
  }

  return (
    <BrowserRouter>
      <div className="app-wrapper">
        <Routes>
          <Route path="/" element={<TimerPage isGuest={isGuest} onSignIn={() => setShowAuth(true)} />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/trainers/*" element={<TrainersPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
