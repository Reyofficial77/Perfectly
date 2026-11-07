import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUp, CircleHelp, FileImage, FileText, LogOut, Menu, MessageSquarePlus, MoreHorizontal, Paperclip, ShieldCheck, Sparkles, Trash2, X } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Link, useNavigate } from 'react-router-dom'
import Brand from '../components/Brand'
import ThemeToggle from '../components/ThemeToggle'
import ModelSelector, { MODELS } from '../components/ModelSelector'
import { useAuth } from '../context'
import { deleteChat, fetchChats, logout as logoutRequest, saveChat, sendChat } from '../lib/api'

function makeId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function MessageBubble({ message }) {
  const isUser = message.role === 'user'
  return (
    <article className={`message-row ${isUser ? 'message-user' : 'message-assistant'}`}>
      {!isUser && <div className="assistant-avatar"><img src="/icon.png" alt="" /></div>}
      <div className="message-content-wrap">
        {isUser ? <div className="message-author">You</div> : <div className="message-author">Perfectly</div>}
        <div className={`message-bubble ${isUser ? 'user-bubble' : 'ai-bubble'}`}>
          {message.content && <div className="markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown></div>}
          {!!message.attachments?.length && <div className="message-attachments">{message.attachments.map((attachment, index) => <span key={`${attachment.name}-${index}`}><FileText size={13} />{attachment.name}</span>)}</div>}
        </div>
        {message.error && <div className="message-error">{message.error}</div>}
      </div>
    </article>
  )
}

function TypingIndicator() {
  return <div className="typing-row"><div className="assistant-avatar"><img src="/icon.png" alt="" /></div><div className="typing-bubble"><span /><span /><span /></div><small>Perfectly is thinking</small></div>
}

function WelcomeState({ onPrompt, model }) {
  const starters = [
    ['Debug an issue', 'Help me debug this error and find the root cause.'],
    ['Build something', 'Help me build a clean, responsive web application.'],
    ['Understand a codebase', 'Explain how this codebase is structured and where I should start.'],
    ['Review my code', 'Review this code for bugs, performance, and maintainability.'],
  ]
  const selected = MODELS.find((item) => item.id === model) || MODELS[0]
  return <div className="welcome-state">
    <div className="welcome-mark"><img src="/icon.png" alt="Perfectly" /></div>
    <span className="eyebrow">YOUR CODING WORKSPACE</span>
    <h1>What are we building?</h1>
    <p>Ask a question, share a bug, or start shaping your next idea.</p>
    <div className="starter-grid">{starters.map(([label, prompt]) => <button type="button" key={label} onClick={() => onPrompt(prompt)}><span>{label}</span><ArrowUp size={14} /></button>)}</div>
    <div className="welcome-model"><Sparkles size={13} /> Currently using <b>{selected.label}</b></div>
  </div>
}

export default function ChatPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [conversations, setConversations] = useState([])
  const [chatsLoading, setChatsLoading] = useState(true)
  const [activeId, setActiveId] = useState(null)
  const [model, setModel] = useState(() => sessionStorage.getItem('perfectly.pendingModel') || 'beam')
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState([])
  const [sending, setSending] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [statusError, setStatusError] = useState('')
  const [apiStatus, setApiStatus] = useState(null)
  const textareaRef = useRef(null)
  const fileRef = useRef(null)
  const bottomRef = useRef(null)
  const sendLock = useRef(false)
  const activeChat = useMemo(() => conversations.find((chat) => chat.id === activeId) || null, [conversations, activeId])
  const messages = activeChat?.messages || []

  useEffect(() => {
    let active = true
    setChatsLoading(true)
    fetchChats()
      .then((payload) => { if (active) setConversations(Array.isArray(payload.conversations) ? payload.conversations : []) })
      .catch((error) => { if (active) setStatusError(`Tidak dapat memuat riwayat dari Neon: ${error.message}`) })
      .finally(() => { if (active) setChatsLoading(false) })
    return () => { active = false }
  }, [user.id])

  useEffect(() => {
    fetch('/api/health').then((response) => response.ok ? response.json() : null).then((payload) => setApiStatus({ ...(payload?.providers || {}), auth: Boolean(payload?.database?.connected) })).catch(() => setApiStatus(null))
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, sending])

  const newChat = useCallback(() => {
    setActiveId(null)
    setInput('')
    setAttachments([])
    setSidebarOpen(false)
    textareaRef.current?.focus()
  }, [])

  async function addFiles(fileList) {
    const files = Array.from(fileList || []).slice(0, 4 - attachments.length)
    const next = []
    let queuedBytes = attachments.reduce((sum, item) => sum + (item.dataUrl ? Math.floor(item.dataUrl.length * 0.75) : 0), 0)
    for (const file of files) {
      if (file.size > 1.5 * 1024 * 1024) {
        setStatusError(`${file.name} melebihi batas 1,5 MB.`)
        continue
      }
      if (file.type.startsWith('image/')) {
        if (queuedBytes + file.size > 1.5 * 1024 * 1024) {
          setStatusError('Total gambar dalam satu pesan tidak boleh melebihi 1,5 MB.')
          continue
        }
        if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) {
          setStatusError('Format gambar yang didukung: PNG, JPG, WEBP, dan GIF.')
          continue
        }
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result)
          reader.onerror = reject
          reader.readAsDataURL(file)
        })
        next.push({ name: file.name, type: file.type, dataUrl })
        queuedBytes += file.size
      } else {
        const ext = file.name.split('.').pop()?.toLowerCase()
        const supported = ['txt', 'md', 'json', 'csv', 'js', 'jsx', 'ts', 'tsx', 'html', 'css', 'py', 'java', 'go', 'rs', 'sql', 'log', 'yaml', 'yml', 'xml', 'sh']
        if (!supported.includes(ext)) {
          setStatusError(`File ${file.name} belum didukung. Gunakan file teks/kode atau gambar.`)
          continue
        }
        const text = await file.text()
        if (text.length > 80000) {
          setStatusError(`${file.name} terlalu besar sebagai teks. Maksimal 80.000 karakter.`)
          continue
        }
        next.push({ name: file.name, type: 'text/plain', text })
      }
    }
    setAttachments((current) => [...current, ...next].slice(0, 4))
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleSend(value = input) {
    const text = value.trim()
    if ((!text && attachments.length === 0) || sending || sendLock.current || chatsLoading) return
    sendLock.current = true
    setSending(true)
    setStatusError('')

    const chatId = activeId || makeId()
    const savedAttachments = attachments.map(({ name, type }) => ({ name, type }))
    const messageText = [text, ...attachments.filter((item) => item.text).map((item) => `\n\n### File: ${item.name}\n\n\`\`\`\n${item.text}\n\`\`\``)].filter(Boolean).join('\n')
    const userMessage = {
      id: makeId(), role: 'user', content: messageText,
      attachments: savedAttachments,
    }
    const requestUserMessage = {
      ...userMessage,
      attachments: attachments.filter((item) => item.dataUrl).map(({ name, type, dataUrl }) => ({ name, type, dataUrl })),
    }
    const existing = conversations.find((chat) => chat.id === chatId)
    const requestMessages = [...(existing?.messages || []), requestUserMessage].slice(-32).map((message) => ({
      role: message.role,
      content: message.content,
      ...(message.id === userMessage.id ? { attachments: requestUserMessage.attachments } : {}),
    }))
    const title = (text || attachments[0]?.name || 'New conversation').replace(/\s+/g, ' ').slice(0, 54)

    const pendingChat = existing
      ? { ...existing, updatedAt: Date.now(), model, messages: [...existing.messages, userMessage] }
      : { id: chatId, title, model, updatedAt: Date.now(), messages: [userMessage] }
    setConversations((previous) => [pendingChat, ...previous.filter((chat) => chat.id !== chatId)].slice(0, 40))
    setActiveId(chatId)
    setInput('')
    setAttachments([])
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    try {
      await saveChat(pendingChat)
      const result = await sendChat({ model, messages: requestMessages })
      const assistantMessage = { id: makeId(), role: 'assistant', content: result.content, model: result.model }
      const completedChat = { ...pendingChat, updatedAt: Date.now(), messages: [...pendingChat.messages, assistantMessage] }
      setConversations((previous) => previous.map((chat) => chat.id === chatId ? completedChat : chat))
      try { await saveChat(completedChat) } catch (saveError) { setStatusError(`Jawaban berhasil dibuat, tetapi gagal disimpan ke Neon: ${saveError.message}`) }
    } catch (error) {
      const failedChat = {
        ...pendingChat,
        updatedAt: Date.now(),
        messages: [...pendingChat.messages, { id: makeId(), role: 'assistant', content: 'I could not complete that request.', error: error.message || 'Terjadi kesalahan.' }],
      }
      setConversations((previous) => previous.map((chat) => chat.id === chatId ? failedChat : chat))
      saveChat(failedChat).catch((saveError) => setStatusError(`Gagal menyimpan percakapan ke Neon: ${saveError.message}`))
    } finally {
      setSending(false)
      sendLock.current = false
      textareaRef.current?.focus()
    }
  }

  useEffect(() => {
    if (chatsLoading) return
    const pending = sessionStorage.getItem('perfectly.pendingPrompt')
    if (pending) {
      sessionStorage.removeItem('perfectly.pendingPrompt')
      handleSend(pending)
    }
    // Run after the server-side Neon history is ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatsLoading])

  async function logout() {
    try { await logoutRequest() } finally { navigate('/', { replace: true }) }
  }

  async function removeChat(id, event) {
    event?.stopPropagation()
    setConversations((previous) => previous.filter((chat) => chat.id !== id))
    if (activeId === id) setActiveId(null)
    try { await deleteChat(id) } catch (error) { setStatusError(`Gagal menghapus percakapan: ${error.message}`) }
  }

  const currentModel = MODELS.find((item) => item.id === model) || MODELS[0]

  return (
    <div className="workspace-shell">
      {sidebarOpen && <button className="sidebar-backdrop" aria-label="Close sidebar" onClick={() => setSidebarOpen(false)} />}
      <aside className={`workspace-sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-top"><Brand compact to="/app" /><button type="button" className="icon-button sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar"><X size={18} /></button></div>
        <button className="new-chat-button" onClick={newChat} type="button"><MessageSquarePlus size={16} /> New chat <span>⌘ K</span></button>
        <div className="history-label">RECENT</div>
        <div className="chat-history">
          {chatsLoading && <p className="history-empty">Loading conversations…</p>}
          {!chatsLoading && conversations.length === 0 && <p className="history-empty">Your conversations will appear here.</p>}
          {conversations.map((chat) => <button className={`history-item ${chat.id === activeId ? 'history-active' : ''}`} type="button" key={chat.id} onClick={() => { setActiveId(chat.id); setModel(chat.model || 'beam'); setSidebarOpen(false) }}><span className="history-item-title">{chat.title || 'New conversation'}</span><span className="history-actions" onClick={(event) => removeChat(chat.id, event)} role="button" tabIndex={0} aria-label="Delete conversation"><Trash2 size={13} /></span></button>)}
        </div>
        <div className="sidebar-bottom">
          <div className="sidebar-status"><span className={`status-light ${apiStatus?.auth ? 'status-ok' : ''}`} /> API {apiStatus ? 'connected' : 'status unavailable'}</div>
          <button type="button" className="profile-button" onClick={() => setProfileOpen((value) => !value)}><span className="profile-avatar">{(user.email || 'U').charAt(0).toUpperCase()}</span><span className="profile-copy"><b>{user.email?.split('@')[0] || 'Your account'}</b><small>{user.email}</small></span><MoreHorizontal size={17} /></button>
          {profileOpen && <div className="profile-popover pop-in"><div className="profile-popover-email">{user.email}</div><button type="button" onClick={logout}><LogOut size={15} /> Log out</button></div>}
        </div>
      </aside>

      <main className="workspace-main">
        <header className="workspace-header">
          <div className="workspace-header-left"><button className="icon-button mobile-sidebar-toggle" type="button" onClick={() => setSidebarOpen(true)} aria-label="Open sidebar"><Menu size={19} /></button><Link to="/" className="workspace-mobile-brand"><Brand compact /></Link><span className="workspace-context">Workspace <span>/</span> {activeChat?.title || 'New chat'}</span></div>
          <div className="workspace-header-actions"><ThemeToggle compact /><ModelSelector value={model} onChange={setModel} compact /><button className="icon-button help-button" type="button" title="Help"><CircleHelp size={17} /></button><button className="icon-button logout-header" type="button" onClick={logout} title="Log out"><LogOut size={17} /></button></div>
        </header>

        <div className={`chat-scroll-area ${messages.length === 0 ? 'chat-empty' : ''}`}>
          <div className="conversation-column">
            {messages.length === 0 ? <WelcomeState model={model} onPrompt={(value) => handleSend(value)} /> : <div className="message-list">{messages.map((message) => <MessageBubble key={message.id} message={message} />)}{sending && <TypingIndicator />}<div ref={bottomRef} /></div>}
          </div>
        </div>

        <div className="workspace-composer-area">
          {statusError && <div className="composer-alert">{statusError}<button type="button" onClick={() => setStatusError('')}><X size={13} /></button></div>}
          <div className="workspace-composer">
            {attachments.length > 0 && <div className="attachment-strip">{attachments.map((attachment, index) => <div className="attachment-pill" key={`${attachment.name}-${index}`}>{attachment.type.startsWith('image/') ? <FileImage size={14} /> : <FileText size={14} />}<span>{attachment.name}</span><button type="button" onClick={() => setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove ${attachment.name}`}><X size={12} /></button></div>)}</div>}
            <textarea ref={textareaRef} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); handleSend() } }} onInput={(event) => { event.currentTarget.style.height = 'auto'; event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 180)}px` }} rows={1} placeholder="Message Perfectly…" aria-label="Message Perfectly" />
            <div className="workspace-composer-footer"><div className="composer-left-tools"><button type="button" className="composer-tool" onClick={() => fileRef.current?.click()} title="Attach files"><Paperclip size={17} /><span>Attach</span></button><input ref={fileRef} type="file" hidden multiple accept="image/png,image/jpeg,image/webp,image/gif,.txt,.md,.json,.csv,.js,.jsx,.ts,.tsx,.html,.css,.py,.java,.go,.rs,.sql,.log,.yaml,.yml,.xml,.sh" onChange={(event) => addFiles(event.target.files)} /><span className="composer-model-caption"><Sparkles size={12} /> {currentModel.label}</span></div><div className="composer-right-tools"><span className="enter-hint">Enter to send · Shift + Enter for newline</span><button type="button" className="workspace-send-button" disabled={sending || (!input.trim() && !attachments.length)} onClick={() => handleSend()} aria-label="Send message">{sending ? <span className="button-spinner" /> : <ArrowUp size={17} />}</button></div></div>
          </div>
          <p className="composer-disclaimer"><ShieldCheck size={12} /> Perfectly can make mistakes. Review generated code before using it.</p>
        </div>
      </main>
    </div>
  )
}
