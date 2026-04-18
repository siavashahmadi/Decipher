import { useState, useEffect } from 'react';
import { supabase } from './services/auth';
import { getAllGuestSolves, clearAllGuestSolves } from './services/guestStorage';
import api from './services/api';
import Auth from './components/Auth';
import SolveSession from './components/SolveSession';
import './App.css';

function App() {
  const [session, setSession] = useState(null);
  const [showAuth, setShowAuth] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (_event === 'SIGNED_IN') {
        const guestSolves = getAllGuestSolves();
        if (guestSolves.length > 0) {
          console.log(`Migrating ${guestSolves.length} guest solve(s)...`);
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

  return (
    <div className="app-wrapper">
      {showAuth && isGuest
        ? <Auth onBack={() => setShowAuth(false)} />
        : <SolveSession isGuest={isGuest} onSignIn={() => setShowAuth(true)} />
      }
    </div>
  );
}

export default App;
