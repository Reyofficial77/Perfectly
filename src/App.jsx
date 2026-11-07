import { Component, useState } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, ThemeProvider, useAuth } from './context'
import Landing from './pages/Landing'
import AuthPage, { AuthCallback } from './pages/AuthPage'
import ChatPage from './pages/ChatPage'
import { createChatId } from './lib/ids'

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[Perfectly render error]', error, info?.componentStack || '')
  }

  render() {
    if (this.state.error) {
      return (
        <main className="app-crash-screen">
          <div className="app-crash-card">
            <span className="app-crash-icon"><AlertTriangle size={19} /></span>
            <p className="eyebrow">APPLICATION ERROR</p>
            <h1>Perfectly could not load this page.</h1>
            <p className="app-crash-message">{this.state.error?.message || 'Unexpected application error.'}</p>
            <p className="app-crash-help">Reload the page. If this continues, check the latest Vercel deployment logs and browser console.</p>
            <button className="button button-solid" type="button" onClick={() => window.location.reload()}><RefreshCw size={15} /> Reload Perfectly</button>
          </div>
        </main>
      )
    }
    return this.props.children
  }
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <div className="callback-screen"><span className="spinner" /><p>Loading your workspace…</p></div>
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />
  return children
}

function NewChatRedirect() {
  const [chatId] = useState(() => createChatId())
  return <Navigate to={`/chat/${chatId}`} replace />
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/signup" element={<AuthPage mode="signup" />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/app" element={<ProtectedRoute><NewChatRedirect /></ProtectedRoute>} />
      <Route path="/chat/:chatId" element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AppErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </ThemeProvider>
    </AppErrorBoundary>
  )
}
