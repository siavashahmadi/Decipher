import React from 'react';
import './ComingSoon.css';

interface ComingSoonProps {
  title: string;
}

const ComingSoon = ({ title }: ComingSoonProps): React.ReactElement => (
  <div className="trainer-coming-soon">
    <h2>{title}</h2>
    <p>Coming soon.</p>
  </div>
);

export default ComingSoon;
