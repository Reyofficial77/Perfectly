import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../context'

export default function ThemeToggle({ compact = false }) {
  const { theme, toggleTheme } = useTheme()
  const nextTheme = theme === 'dark' ? 'light' : 'dark'
  return (
    <button
      type="button"
      className={`theme-toggle icon-button${compact ? ' theme-toggle-compact' : ''}`}
      onClick={toggleTheme}
      aria-label={`Switch to ${nextTheme} mode`}
      aria-pressed={theme === 'dark'}
      title={`Switch to ${nextTheme} mode`}
    >
      {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
      <span className="sr-only">Switch to {nextTheme} mode</span>
    </button>
  )
}
