import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Github, LockKeyhole, Mail } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import Brand from '../components/Brand'
import ThemeToggle from '../components/ThemeToggle'
import { useAuth } from '../context'

export default function AuthPage({ mode = 'login' }) {
  const isSignup = mode === 'signup'
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { configured, refreshUser } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  useEffect(() => { if (searchParams.get('oauth_error')) setError('Login Google/GitHub gagal atau belum dikonfigurasi. Periksa OAuth credentials dan callback URL di README.') }, [searchParams])

  const nextPath = searchParams.get('next')?.startsWith('/') && !searchParams.get('next')?.startsWith('//') ? searchParams.get('next') : '/app'

  async function socialLogin(provider) {
    setError('')
    if (!configured) {
      setError('Neon database belum dikonfigurasi. Isi DATABASE_URL di environment Vercel.')
      return
    }
    setBusy(true)
    try {
      const query = new URLSearchParams({ action: 'oauth-url', provider, next: nextPath })
      const response = await fetch(`/api/auth?${query}`, { credentials: 'same-origin', cache: 'no-store' })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || !payload.url) throw new Error(payload.error || 'Tidak dapat memulai OAuth.')
      window.location.assign(payload.url)
    } catch (authError) {
      setError(authError.message || 'Tidak dapat memulai login sosial.')
      setBusy(false)
    }
  }

  async function submit(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    if (!configured) {
      setError('Neon database belum dikonfigurasi. Tambahkan DATABASE_URL terlebih dahulu.')
      return
    }
    if (password.length < 8) {
      setError('Password minimal 8 karakter.')
      return
    }
    setBusy(true)
    try {
      const response = await fetch(`/api/auth?action=${isSignup ? 'register' : 'login'}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'Tidak dapat memproses autentikasi.')
      await refreshUser()
      navigate(nextPath, { replace: true })
    } catch (authError) {
      setError(authError.message || 'Tidak dapat memproses autentikasi.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-top"><Brand /><div className="auth-top-actions"><ThemeToggle compact /><Link to="/" className="back-link"><ArrowLeft size={15} /> Back to home</Link></div></div>
      <section className="auth-card pop-in">
        <div className="auth-card-heading"><span className="eyebrow">{isSignup ? 'START BUILDING' : 'WELCOME BACK'}</span><h1>{isSignup ? 'Create your account.' : 'Good to see you.'}</h1><p>{isSignup ? 'Your next great build starts here.' : 'Log in to continue where you left off.'}</p></div>
        <div className="social-auth">
          <button type="button" className="social-button" onClick={() => socialLogin('google')} disabled={busy}><span className="google-g">G</span> Continue with Google</button>
          <button type="button" className="social-button" onClick={() => socialLogin('github')} disabled={busy}><Github size={17} /> Continue with GitHub</button>
        </div>
        <div className="auth-divider"><span />or continue with email<span /></div>
        <form className="auth-form" onSubmit={submit}>
          <label htmlFor="email">Email address</label>
          <div className="auth-input-wrap"><Mail size={16} /><input id="email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} required /></div>
          <label htmlFor="password">Password</label>
          <div className="auth-input-wrap"><LockKeyhole size={16} /><input id="password" type="password" autoComplete={isSignup ? 'new-password' : 'current-password'} placeholder="At least 8 characters" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required /></div>
          {error && <div className="form-alert error-alert" role="alert">{error}</div>}
          {notice && <div className="form-alert success-alert" role="status">{notice}</div>}
          <button type="submit" className="button button-solid auth-submit" disabled={busy}>{busy ? 'Please wait…' : isSignup ? 'Create account' : 'Log in'} <ArrowRight size={16} /></button>
        </form>
        {!configured && <div className="setup-note"><b>Setup needed</b><span>Connect a Neon database and add DATABASE_URL in Vercel. See README.md for setup steps.</span></div>}
        <p className="auth-switch">{isSignup ? 'Already have an account?' : 'New to Perfectly?'} <Link to={isSignup ? `/login?next=${encodeURIComponent(nextPath)}` : `/signup?next=${encodeURIComponent(nextPath)}`}>{isSignup ? 'Log in' : 'Create an account'}</Link></p>
        <p className="auth-legal">By continuing, you agree to use Perfectly responsibly and keep your API credentials private.</p>
      </section>
      <div className="auth-bottom"><span>© {new Date().getFullYear()} Perfectly</span><span>Authentication & data powered by Neon</span></div>
    </main>
  )
}

export function AuthCallback() {
  const [searchParams] = useSearchParams()
  const nextPath = searchParams.get('next')?.startsWith('/') && !searchParams.get('next')?.startsWith('//') ? searchParams.get('next') : '/app'
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  useEffect(() => {
    if (loading) return
    if (user) navigate(nextPath, { replace: true })
    else navigate(`/login?next=${encodeURIComponent(nextPath)}`, { replace: true })
  }, [loading, user, navigate, nextPath])
  return <div className="callback-screen"><span className="spinner" /><p>Finishing sign in…</p></div>
}
