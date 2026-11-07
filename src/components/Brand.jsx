import { Link } from 'react-router-dom'

export default function Brand({ compact = false, to = '/' }) {
  return (
    <Link className={`brand ${compact ? 'brand-compact' : ''}`} to={to} aria-label="Perfectly home">
      <img src="/icon.png" alt="" className="brand-icon" />
      <span>Perfectly</span>
    </Link>
  )
}
