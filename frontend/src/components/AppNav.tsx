import type { ReactElement } from 'react';
import { NavLink } from 'react-router-dom';
import './AppNav.css';

const AppNav = (): ReactElement => (
  <nav className="app-nav" aria-label="Primary">
    <NavLink to="/" end className={({ isActive }) => `app-nav-link${isActive ? ' active' : ''}`}>Timer</NavLink>
    <NavLink to="/stats" className={({ isActive }) => `app-nav-link${isActive ? ' active' : ''}`}>Stats</NavLink>
    <NavLink to="/trainers/pll" className={({ isActive }) => `app-nav-link${isActive ? ' active' : ''}`}>Trainers</NavLink>
  </nav>
);

export default AppNav;
