import { useRef, useState } from 'react'
import { ArrowRight, Check, ChevronRight, Code2, FileCode2, FileText, GitBranch, Menu, MessageSquareText, Mic, Plus, Search, ShieldCheck, Sparkles, Terminal, WandSparkles, X } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import Brand from '../components/Brand'
import ThemeToggle from '../components/ThemeToggle'
import ModelSelector from '../components/ModelSelector'
import { useAuth } from '../context'
import { createChatId } from '../lib/ids'

const projects = [
  { name: 'Invoice dashboard', creator: 'mira', category: 'Web apps', tone: 'thumb-sun', symbol: '▤', forks: 142, likes: 281 },
  { name: 'Terminal todo CLI', creator: 'ken', category: 'CLI tools', tone: 'thumb-mint', symbol: '›_', forks: 96, likes: 174 },
  { name: 'Pixel platformer', creator: 'juno', category: 'Games', tone: 'thumb-lilac', symbol: '✦', forks: 218, likes: 392 },
  { name: 'REST API starter', creator: 'ola', category: 'APIs', tone: 'thumb-blue', symbol: '{ }', forks: 187, likes: 244 },
  { name: 'Docs site generator', creator: 'sam', category: 'Web apps', tone: 'thumb-peach', symbol: 'Aa', forks: 72, likes: 131 },
  { name: 'Chat widget', creator: 'ari', category: 'Web apps', tone: 'thumb-aqua', symbol: '◌', forks: 164, likes: 203 },
]
const suggestions = [
  ['Fix a failing test', 'Fix the failing test in my auth module and explain the root cause.'],
  ['Build a landing page', 'Build a responsive landing page for my side project.'],
  ['Explain this repo', 'Walk me through the architecture and structure of this repository.'],
  ['Write an API', 'Create a REST API with authentication and a users endpoint.'],
]

function ProjectVisual({ project }) {
  return (
    <div className={`project-visual ${project.tone}`}>
      <div className="mini-window">
        <div className="mini-dots"><i /><i /><i /></div>
        <div className="mini-title-line" />
        <div className="mini-lines"><i /><i /><i /></div>
        <div className="mini-columns"><i /><i /><i /></div>
      </div>
      <span className="project-symbol">{project.symbol}</span>
    </div>
  )
}

export default function Landing() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState('beam')
  const [attachments, setAttachments] = useState([])
  const [voiceListening, setVoiceListening] = useState(false)
  const [composerError, setComposerError] = useState('')
  const promptRef = useRef(null)
  const fileRef = useRef(null)
  const recognitionRef = useRef(null)
  const [category, setCategory] = useState('All')
  const [mobileMenu, setMobileMenu] = useState(false)

  function resizePrompt(element = promptRef.current) {
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${Math.min(element.scrollHeight, 210)}px`
    element.style.overflowY = element.scrollHeight > 210 ? 'auto' : 'hidden'
  }

  async function addFiles(fileList) {
    const allowedText = ['txt', 'md', 'json', 'csv', 'js', 'jsx', 'ts', 'tsx', 'html', 'css', 'py', 'java', 'go', 'rs', 'sql', 'log', 'yaml', 'yml', 'xml', 'sh']
    const next = []
    let imageBytes = attachments.reduce((sum, item) => sum + (item.dataUrl ? Math.floor(item.dataUrl.length * 0.75) : 0), 0)
    for (const file of Array.from(fileList || []).slice(0, 4 - attachments.length)) {
      if (file.size > 1.5 * 1024 * 1024) {
        setComposerError(`${file.name} exceeds the 1.5 MB limit.`)
        continue
      }
      if (file.type.startsWith('image/')) {
        if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) {
          setComposerError('Supported image formats: PNG, JPG, WEBP, and GIF.')
          continue
        }
        if (imageBytes + file.size > 1.5 * 1024 * 1024) {
          setComposerError('The total image size per message cannot exceed 1.5 MB.')
          continue
        }
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result)
          reader.onerror = reject
          reader.readAsDataURL(file)
        })
        next.push({ name: file.name, type: file.type, dataUrl })
        imageBytes += file.size
      } else {
        const extension = file.name.split('.').pop()?.toLowerCase()
        if (!allowedText.includes(extension)) {
          setComposerError(`File ${file.name} is not supported.`)
          continue
        }
        const content = await file.text()
        if (content.length > 80000) {
          setComposerError(`${file.name} is too large. The maximum size is 80,000 characters.`)
          continue
        }
        next.push({ name: file.name, type: 'text/plain', text: content })
      }
    }
    setAttachments((current) => [...current, ...next].slice(0, 4))
    if (fileRef.current) fileRef.current.value = ''
  }

  function startVoiceInput() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setComposerError('Voice input is not supported by this browser. You can still type your prompt.')
      return
    }
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
      setVoiceListening(false)
      return
    }
    const recognition = new SpeechRecognition()
    const startingText = prompt.trim()
    recognition.lang = 'id-ID'
    recognition.interimResults = true
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map((result) => result[0]?.transcript || '').join(' ').trim()
      setPrompt([startingText, transcript].filter(Boolean).join(' '))
      requestAnimationFrame(() => resizePrompt())
    }
    recognition.onend = () => { recognitionRef.current = null; setVoiceListening(false) }
    recognition.onerror = () => { recognitionRef.current = null; setVoiceListening(false); setComposerError('Voice input could not be started.') }
    recognitionRef.current = recognition
    setVoiceListening(true)
    recognition.start()
  }

  function startChat(text = prompt) {
    const cleaned = text.trim()
    if (!cleaned && attachments.length === 0) return
    recognitionRef.current?.stop()
    const chatId = createChatId()
    sessionStorage.setItem('perfectly.pendingPrompt', cleaned)
    sessionStorage.setItem('perfectly.pendingModel', model)
    sessionStorage.setItem('perfectly.pendingChatId', chatId)
    try { sessionStorage.setItem('perfectly.pendingAttachments', JSON.stringify(attachments)) }
    catch { setComposerError('The attachments are too large to transfer to the chat. Try smaller files.'); return }
    navigate(user ? `/chat/${chatId}` : `/login?next=${encodeURIComponent(`/chat/${chatId}`)}`)
  }

  const filteredProjects = category === 'All' ? projects : projects.filter((project) => project.category === category)

  return (
    <div className="landing-shell">
      <nav className="top-nav">
        <div className="page-wrap nav-inner">
          <Brand />
          <div className="nav-links">
            <a href="#product">Product <ChevronRight size={13} className="down-chevron" /></a>
            <a href="#models">Models</a>
            <a href="#community">Community</a>
            <a href="#docs">Docs</a>
          </div>
          <ThemeToggle compact />
          <div className="nav-actions">
            {user ? <Link className="button button-solid" to="/app">Open workspace <ArrowRight size={15} /></Link> : <><Link className="button button-quiet" to="/login">Log in</Link><Link className="button button-solid" to="/signup">Sign up <ArrowRight size={15} /></Link></>}
          </div>
          <button type="button" className="icon-button mobile-nav-toggle" onClick={() => setMobileMenu((value) => !value)} aria-label="Toggle menu">{mobileMenu ? <X /> : <Menu />}</button>
        </div>
        {mobileMenu && <div className="mobile-nav-panel"><a href="#product" onClick={() => setMobileMenu(false)}>Product</a><a href="#models" onClick={() => setMobileMenu(false)}>Models</a><a href="#community" onClick={() => setMobileMenu(false)}>Community</a><Link to="/login">Log in</Link><Link to="/signup">Sign up</Link></div>}
      </nav>

      <main>
        <header className="hero-section page-wrap">
          <div className="hero-eyebrow"><span className="live-dot" /> Your AI coding workspace</div>
          <h1>What are we<br className="mobile-break" /> shipping today<span className="hero-period">?</span></h1>
          <p className="hero-subtitle">Think clearly. Write better code. Ship with confidence.</p>
          <div className="hero-composer">
            {attachments.length > 0 && <div className="landing-attachment-strip">{attachments.map((attachment, index) => <div className="landing-attachment-card" key={`${attachment.name}-${index}`}>{attachment.type.startsWith('image/') ? <img src={attachment.dataUrl} alt={attachment.name} /> : <span className="landing-file-icon"><FileText size={16} /></span>}<span className="landing-attachment-name"><b>{attachment.name}</b><small>{attachment.type.startsWith('image/') ? 'Image attachment' : 'Text file'}</small></span><button type="button" onClick={() => setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove ${attachment.name}`}><X size={13} /></button></div>)}</div>}
            <textarea ref={promptRef} value={prompt} onChange={(event) => { setPrompt(event.target.value); resizePrompt(event.target) }} onPaste={(event) => { const pastedImages = Array.from(event.clipboardData.items || []).filter((item) => item.type.startsWith('image/')).map((item) => item.getAsFile()).filter(Boolean); if (pastedImages.length) { event.preventDefault(); addFiles(pastedImages) } }} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); startChat() } }} placeholder={user ? "What can I help you with today?" : "Describe what you want to build... Sign in to send your prompt."} aria-label="Describe what you want to build" rows={1} style={{ resize: 'none' }} />
            <div className="composer-tools perfectly-composer-footer">
              <div className="composer-left-tools">
                <button type="button" className="composer-plus-button" onClick={() => fileRef.current?.click()} aria-label="Attach files" title="Attach files"><Plus size={20} /></button>
                <input ref={fileRef} type="file" hidden multiple accept="image/png,image/jpeg,image/webp,image/gif,.txt,.md,.json,.csv,.js,.jsx,.ts,.tsx,.html,.css,.py,.java,.go,.rs,.sql,.log,.yaml,.yml,.xml,.sh" onChange={(event) => addFiles(event.target.files)} />
                <div className="composer-mode-switch" role="group" aria-label="Chat mode"><button className="active" type="button" aria-pressed="true">Chat</button><button type="button" disabled title="Cowork mode is coming soon">Cowork</button></div>
              </div>
              <div className="composer-right-tools">
                <ModelSelector value={model} onChange={setModel} compact isPro={user?.is_pro === true} onLocked={() => setComposerError(user ? 'GPT and Claude are available to Perfectly Pro users only. Contact the administrator to upgrade.' : 'Please sign in first. GPT and Claude are available to Perfectly Pro users only.')} />
                <button type="button" className={`composer-voice-button ${voiceListening ? 'listening' : ''}`} onClick={startVoiceInput} aria-label={voiceListening ? 'Stop voice input' : 'Start voice input'} title="Voice input"><Mic size={17} /></button>
                <button className="send-button perfectly-send-button" onClick={() => startChat()} type="button" aria-label="Start chat" disabled={!prompt.trim() && attachments.length === 0}><ArrowRight size={18} /></button>
              </div>
            </div>
            {composerError && <div className="landing-composer-error" role="status">{composerError}<button type="button" onClick={() => setComposerError('')} aria-label="Dismiss error"><X size={12} /></button></div>}
          </div>
          <div className="suggestion-row">
            {suggestions.map(([label, value]) => <button key={label} className="suggestion-chip" onClick={() => { setPrompt(value); requestAnimationFrame(() => resizePrompt()) }} type="button"><Code2 size={13} />{label}</button>)}
          </div>
          <div className="hero-note"><ShieldCheck size={14} /> {user ? "Your API keys stay on the server. Your workspace stays yours." : "Sign in is required before you can send a prompt."}</div>
        </header>

        <section className="community-section page-wrap" id="community">
          <div className="section-heading">
            <div><span className="eyebrow">THE COMMUNITY</span><h2>Start from a project.</h2></div>
            <div className="category-pills" role="group" aria-label="Filter projects">
              {['All', 'Web apps', 'CLI tools', 'Games', 'APIs'].map((item) => <button key={item} type="button" className={category === item ? 'active' : ''} onClick={() => setCategory(item)}>{item}</button>)}
            </div>
          </div>
          <div className="project-grid">
            {filteredProjects.map((project) => <article className="project-card" key={project.name}>
              <ProjectVisual project={project} />
              <div className="project-card-meta"><span className="avatar-dot">{project.creator[0].toUpperCase()}</span><b>{project.name}</b><span className="project-stat">⑂ {project.forks}</span><span className="project-stat">♡ {project.likes}</span></div>
            </article>)}
          </div>
        </section>

        <section className="feature-section page-wrap" id="product">
          <div className="feature-intro"><span className="eyebrow">BUILT FOR THE WAY YOU WORK</span><h2>An agent that<br />thinks alongside you.</h2><p>From the first idea to the final review, Perfectly helps you move through the work that matters.</p><button type="button" className="text-link" onClick={() => startChat('Help me plan and build a software project from scratch.')}>Explore the workspace <ArrowRight size={15} /></button></div>
          <div className="feature-bento">
            <article className="feature-tile feature-tile-wide"><div><span className="feature-icon"><WandSparkles size={18} /></span><h3>Switch models mid-task</h3><p>Use Beam, Gemma 4, GPT, or Claude for the right balance of speed and reasoning.</p></div><div className="model-showcase"><span>Beam</span><span>Gemma 4</span><span>GPT</span><span>Claude</span></div></article>
            <article className="feature-tile"><span className="feature-icon"><FileCode2 size={18} /></span><h3>Bring your context</h3><p>Share snippets, logs, and screenshots to get answers grounded in your work.</p><div className="file-stack"><span><FileCode2 size={15} /> component.tsx</span><span><FileImage size={15} /> screen.png</span></div></article>
            <article className="feature-tile"><span className="feature-icon"><MessageSquareText size={18} /></span><h3>Keep the conversation</h3><p>Ask follow-up questions without losing the context of your task.</p><div className="conversation-preview"><span className="preview-user">Can you simplify this?</span><span className="preview-ai"><Sparkles size={11} /> Here's a cleaner approach…</span></div></article>
            <article className="feature-tile"><span className="feature-icon"><Search size={18} /></span><h3>Understand before changing</h3><p>Break down unfamiliar code and explore a problem before choosing a fix.</p><div className="search-decoration"><i /><i /><i /><i /></div></article>
            <article className="feature-tile"><span className="feature-icon"><Terminal size={18} /></span><h3>Developer-first answers</h3><p>Get readable diffs, implementation steps, and code you can use.</p><div className="terminal-preview"><span>$</span> perfectly explain ./src</div></article>
            <article className="feature-tile"><span className="feature-icon"><GitBranch size={18} /></span><h3>Review with clarity</h3><p>Understand trade-offs and review proposed changes with confidence.</p><div className="diff-preview"><span>+ await getUser(id)</span><span>− fetch(id)</span></div></article>
          </div>
        </section>

        <section className="models-section page-wrap" id="models">
          <div className="models-copy"><span className="eyebrow">YOUR MODELS, YOUR CHOICE</span><h2>One workspace.<br />Different ways to think.</h2><p>Choose an AI provider in the composer and keep the same conversation flow.</p></div>
          <div className="provider-list">
            <div><span className="provider-glyph ollama">O</span><span><b>Ollama Cloud</b><small>Beam · Gemma 4</small></span><Check size={16} /></div>
            <div><span className="provider-glyph openai">✳</span><span><b>OpenAI</b><small>GPT 6 Luna · GPT 6 Astra</small></span><Check size={16} /></div>
            <div><span className="provider-glyph anthropic">A</span><span><b>Anthropic</b><small>Claude Sonnet · Claude Opus</small></span><Check size={16} /></div>
          </div>
        </section>

        <section className="final-cta page-wrap" id="docs">
          <span className="eyebrow">READY WHEN YOU ARE</span><h2>Make the next idea real.</h2><p>Bring a question, a bug, or a blank page. Start building with Perfectly.</p><button className="button button-solid button-large" onClick={() => navigate('/signup')} type="button">Get started <ArrowRight size={16} /></button>
        </section>
      </main>

      <footer className="site-footer page-wrap"><Brand /><span>Designed for developers, made for momentum.</span><div><a href="#product">Product</a><a href="#models">Models</a><Link to="/login">Log in</Link><a href="https://github.com" target="_blank" rel="noreferrer">GitHub <ArrowRight size={12} /></a></div><small>© {new Date().getFullYear()} Perfectly</small></footer>
    </div>
  )
}
