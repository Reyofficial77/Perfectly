import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

const AuthContext = createContext(null)
const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('perfectly.theme') === 'light' ? 'light' : 'dark' }
    catch { return 'dark' }
  })

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0d0d0d' : '#fafafa')
    try { localStorage.setItem('perfectly.theme', theme) } catch { /* Storage may be unavailable. */ }
  }, [theme])

  const toggleTheme = useCallback(() => setTheme((current) => current === 'dark' ? 'light' : 'dark'), [])
  const value = useMemo(() => ({ theme, setTheme, toggleTheme }), [theme, toggleTheme])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme harus digunakan di dalam ThemeProvider.')
  return context
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [configured, setConfigured] = useState(true)

  const refreshUser = useCallback(async () => {
    try {
      const response = await fetch('/api/auth?action=me', { credentials: 'same-origin', cache: 'no-store' })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        if (response.status === 503) setConfigured(false)
        setUser(null)
        return null
      }
      setConfigured(payload.configured !== false)
      setUser(payload.user || null)
      return payload.user || null
    } catch {
      setUser(null)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refreshUser() }, [refreshUser])

  const value = useMemo(() => ({ user, loading, configured, refreshUser }), [user, loading, configured, refreshUser])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth harus digunakan di dalam AuthProvider.')
  return context
}
