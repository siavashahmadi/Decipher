import React from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import AppNav from '../components/AppNav';
import PllTrainer from '../components/trainers/PllTrainer';
import OllTrainer from '../components/trainers/OllTrainer';
import F2lTrainer from '../components/trainers/F2lTrainer';
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
      <Route path="oll" element={<OllTrainer />} />
      <Route path="f2l" element={<F2lTrainer />} />
      <Route path="*" element={<Navigate to="pll" replace />} />
    </Routes>
  </div>
);

export default TrainersPage;
