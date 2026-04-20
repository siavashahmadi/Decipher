import React from 'react';
import SolveSession from '../components/SolveSession';

interface TimerPageProps {
  isGuest: boolean;
  onSignIn: () => void;
}

const TimerPage = ({ isGuest, onSignIn }: TimerPageProps): React.ReactElement => (
  <SolveSession isGuest={isGuest} onSignIn={onSignIn} />
);

export default TimerPage;
