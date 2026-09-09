import { NavLink } from 'react-router-dom'

import { useNorthStar } from '../state/NorthStarContext.jsx'

const LINKS = [
  { to: '/', label: 'Results' },
  { to: '/traveler', label: 'Traveler' },
  { to: '/policy', label: 'Policy & data' },
  { to: '/worksheet', label: 'Worksheet' },
]

export default function Nav() {
  const { isLive } = useNorthStar()

  return (
    <header className="nav">
      <div className="nav__inner">
        <span className="nav__brand">NorthStar</span>
        <nav className="nav__links" aria-label="Main">
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === '/'}
              className={({ isActive }) => `nav__link${isActive ? ' nav__link--active' : ''}`}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
        <span className="nav__env ns-small ns-tertiary">
          {isLive ? 'Live session' : 'Prototype'}
        </span>
      </div>
    </header>
  )
}
