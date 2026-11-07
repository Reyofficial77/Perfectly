import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

const AuthContext = createContext(null)

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
