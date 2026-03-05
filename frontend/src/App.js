import { useState, useEffect } from 'react';
import { supabase } from './services/auth';
import Auth from './components/Auth';
import SolveSession from './components/SolveSession';
import './App.css';

function App() {
  const [session, setSession] = useState(null);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <div className="app-wrapper">
      {!session ? <Auth /> : <SolveSession />}
    </div>
  );
}

export default App;