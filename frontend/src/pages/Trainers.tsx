import React from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import AppNav from '../components/AppNav';
import PllTrainer from '../components/trainers/PllTrainer';
import ComingSoon from '../components/trainers/ComingSoon';
import './Trainers.css';

const TrainerSubNav = (): React.ReactElement => (
  <nav className="trainer-sub-nav" aria-label="Trainers">
    <NavLink
      to="/trainers/pll"
      className={({ isActive }) =>
        `trainer-sub-nav-link${isActive ? ' active' : ''}`
      }
    >
      PLL
    </NavLink>
    <NavLink
      to="/trainers/oll"
      className={({ isActive }) =>
        `trainer-sub-nav-link${isActive ? ' active' : ''}`
      }
    >
      OLL
    </NavLink>
    <NavLink
      to="/trainers/f2l"
      className={({ isActive }) =>
        `trainer-sub-nav-link${isActive ? ' active' : ''}`
      }
    >
      F2L
    </NavLink>
  </nav>
);

const TrainersPage = (): React.ReactElement => (
  <div className="trainers-page">
    <AppNav />
    <TrainerSubNav />
    <Routes>
      <Route index element={<Navigate to="pll" replace />} />
      <Route path="pll" element={<PllTrainer />} />
      <Route path="oll" element={<ComingSoon title="OLL Trainer" />} />
      <Route path="f2l" element={<ComingSoon title="F2L Trainer" />} />
      <Route path="*" element={<Navigate to="pll" replace />} />
    </Routes>
  </div>
);

export default TrainersPage;
