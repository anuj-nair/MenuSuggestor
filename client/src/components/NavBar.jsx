import { useState } from 'react';
import { NavLink } from 'react-router-dom';

export default function NavBar() {
  const [open, setOpen] = useState(false);

  const linkClass = ({ isActive }) => `nav-link${isActive ? ' active' : ''}`;

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <span className="navbar-brand">🍽️ Menu Suggestor</span>
        <button
          className="nav-toggle"
          aria-label="Toggle navigation"
          onClick={() => setOpen((o) => !o)}
        >
          ☰
        </button>
        <nav className={`nav-links${open ? ' open' : ''}`} onClick={() => setOpen(false)}>
          <NavLink to="/" end className={linkClass}>
            Weekly Plan
          </NavLink>
          <NavLink to="/manage" className={linkClass}>
            Manage
          </NavLink>
          <NavLink to="/history" className={linkClass}>
            History
          </NavLink>
        </nav>
      </div>
    </header>
  );
}
