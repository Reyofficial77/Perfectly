import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUp, CircleHelp, FileImage, FileText, LogOut, Menu, MessageSquarePlus, Mic, MoreHorizontal, Plus, ShieldCheck, Sparkles, Trash2, X } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Brand from '../components/Brand'
import ThemeToggle from '../components/ThemeToggle'
import ModelSelector, { MODELS } from '../components/ModelSelector'
import { useAuth } from '../context'
import { deleteChat, fetchChats, logout as logoutRequest, saveChat, sendChat } from '../lib/api'
import { createChatId, isChatId } from '../lib/ids'

function makeId() {
  return globalThis.crypto?.randomUUID?.() || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => { const value = Math.floor(Math.random() * 16); return (char === 'x' ? value : (value & 0x3) | 0x8).toString(16) })
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
  const { chatId: routeChatId } = useParams()
  const [conversations, setConversations] = useState([])
  const [chatsLoading, setChatsLoading] = useState(true)
  const [model, setModel] = useState('beam')
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState([])
  const [sending, setSending] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [statusError, setStatusError] = useState('')
  const [voiceListening, setVoiceListening] = useState(false)
  const [apiStatus, setApiStatus] = useState(null)
  const textareaRef = useRef(null)
  const fileRef = useRef(null)
  const bottomRef = useRef(null)
  const sendLock = useRef(false)
  const recognitionRef = useRef(null)
  const activeId = routeChatId
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

  useEffect(() => () => recognitionRef.current?.stop(), [])

  useEffect(() => {
    if (!activeChat?.model) return
    const savedModel = MODELS.find((item) => item.id === activeChat.model)
    setModel(savedModel?.pro && user?.is_pro !== true ? 'beam' : activeChat.model)
  }, [activeChat?.id, activeChat?.model, user?.is_pro])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, sending])

  const newChat = useCallback(() => {
    recognitionRef.current?.stop()
    setInput('')
    setAttachments([])
    setModel('beam')
    setSidebarOpen(false)
    navigate(`/chat/${createChatId()}`)
  }, [navigate])

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

  function resizeComposer(element = textareaRef.current) {
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${Math.min(element.scrollHeight, 220)}px`
    element.style.overflowY = element.scrollHeight > 220 ? 'auto' : 'hidden'
  }

  function startVoiceInput() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setStatusError('Voice input belum didukung browser ini. Kamu tetap bisa mengetik prompt.')
      return
    }
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
      setVoiceListening(false)
      return
    }
    const recognition = new SpeechRecognition()
    const startingText = input.trim()
    recognition.lang = 'id-ID'
    recognition.interimResults = true
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map((result) => result[0]?.transcript || '').join(' ').trim()
      setInput([startingText, transcript].filter(Boolean).join(' '))
      requestAnimationFrame(() => resizeComposer())
    }
    recognition.onend = () => { recognitionRef.current = null; setVoiceListening(false) }
    recognition.onerror = () => { recognitionRef.current = null; setVoiceListening(false); setStatusError('Voice input tidak dapat dimulai.') }
    recognitionRef.current = recognition
    setVoiceListening(true)
    recognition.start()
  }

  async function handleSend(value = input, suppliedAttachments = attachments, selectedModel = model) {
    const text = value.trim()
    const files = suppliedAttachments || []
    if ((!text && files.length === 0) || sending || sendLock.current || chatsLoading) return
    recognitionRef.current?.stop()
    sendLock.current = true
    setSending(true)
    setStatusError('')

    const chatId = isChatId(activeId) ? activeId : createChatId()
    if (chatId !== activeId) navigate(`/chat/${chatId}`, { replace: true })
    const chosenModel = selectedModel || 'beam'
    setModel(chosenModel)
    const savedAttachments = files.map(({ name, type }) => ({ name, type }))
    const messageText = [text, ...files.filter((item) => item.text).map((item) => `\n\n### File: ${item.name}\n\n\`\`\`\n${item.text}\n\`\`\``)].filter(Boolean).join('\n')
    const userMessage = {
      id: makeId(), role: 'user', content: messageText,
      attachments: savedAttachments,
    }
    const requestUserMessage = {
      ...userMessage,
      attachments: files.filter((item) => item.dataUrl).map(({ name, type, dataUrl }) => ({ name, type, dataUrl })),
    }
    const existing = conversations.find((chat) => chat.id === chatId)
    const requestMessages = [...(existing?.messages || []), requestUserMessage].slice(-32).map((message) => ({
      role: message.role,
      content: message.content,
      ...(message.id === userMessage.id ? { attachments: requestUserMessage.attachments } : {}),
    }))
    const title = (text || files[0]?.name || 'New conversation').replace(/\s+/g, ' ').slice(0, 54)

    const pendingChat = existing
      ? { ...existing, updatedAt: Date.now(), model: chosenModel, messages: [...existing.messages, userMessage] }
      : { id: chatId, title, model: chosenModel, updatedAt: Date.now(), messages: [userMessage] }
    setConversations((previous) => [pendingChat, ...previous.filter((chat) => chat.id !== chatId)].slice(0, 40))
    setInput('')
    setAttachments([])
    if (textareaRef.current) { textareaRef.current.style.height = 'auto'; textareaRef.current.style.overflowY = 'hidden' }

    try {
      await saveChat(pendingChat)
      const result = await sendChat({ model: chosenModel, messages: requestMessages })
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
    const pendingId = sessionStorage.getItem('perfectly.pendingChatId')
    const pending = sessionStorage.getItem('perfectly.pendingPrompt')
    if (pendingId && pendingId === routeChatId && pending !== null) {
      let pendingFiles = []
      try { pendingFiles = JSON.parse(sessionStorage.getItem('perfectly.pendingAttachments') || '[]') } catch { pendingFiles = [] }
      const pendingModel = sessionStorage.getItem('perfectly.pendingModel') || 'beam'
      sessionStorage.removeItem('perfectly.pendingChatId')
      sessionStorage.removeItem('perfectly.pendingPrompt')
      sessionStorage.removeItem('perfectly.pendingModel')
      sessionStorage.removeItem('perfectly.pendingAttachments')
      handleSend(pending, pendingFiles, pendingModel)
    } else if (pendingId && pendingId !== routeChatId) {
      sessionStorage.removeItem('perfectly.pendingChatId')
      sessionStorage.removeItem('perfectly.pendingPrompt')
      sessionStorage.removeItem('perfectly.pendingModel')
      sessionStorage.removeItem('perfectly.pendingAttachments')
    }
    // The pending prompt is consumed exactly once after Neon history has loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatsLoading, routeChatId])

  async function logout() {
    recognitionRef.current?.stop()
    try { await logoutRequest() } finally { navigate('/', { replace: true }) }
  }

  async function removeChat(id, event) {
    event?.stopPropagation()
    setConversations((previous) => previous.filter((chat) => chat.id !== id))
    if (activeId === id) navigate(`/chat/${createChatId()}`, { replace: true })
    try { await deleteChat(id) } catch (error) { setStatusError(`Gagal menghapus percakapan: ${error.message}`) }
  }


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
          {conversations.map((chat) => <button className={`history-item ${chat.id === activeId ? 'history-active' : ''}`} type="button" key={chat.id} onClick={() => { setSidebarOpen(false); navigate(`/chat/${chat.id}`) }}><span className="history-item-title">{chat.title || 'New conversation'}</span><span className="history-actions" onClick={(event) => removeChat(chat.id, event)} role="button" tabIndex={0} aria-label="Delete conversation"><Trash2 size={13} /></span></button>)}
        </div>
        <div className="sidebar-bottom">
          <div className="sidebar-status"><span className={`status-light ${apiStatus?.auth ? 'status-ok' : ''}`} /> API {apiStatus ? 'connected' : 'status unavailable'}</div>
          <button type="button" className="profile-button" onClick={() => setProfileOpen((value) => !value)}><span className="profile-avatar">{(user.email || 'U').charAt(0).toUpperCase()}</span><span className="profile-copy"><b>{user.email?.split('@')[0] || 'Your account'}</b><small>{user.email}</small></span><span className={`profile-plan-badge ${user.is_pro ? 'profile-plan-pro' : ''}`}>{user.is_pro ? 'PRO' : 'FREE'}</span><MoreHorizontal size={17} /></button>
          {profileOpen && <div className="profile-popover pop-in"><div className="profile-popover-email">{user.email}</div><button type="button" onClick={logout}><LogOut size={15} /> Log out</button></div>}
        </div>
      </aside>

      <main className="workspace-main">
        <header className="workspace-header">
          <div className="workspace-header-left"><button className="icon-button mobile-sidebar-toggle" type="button" onClick={() => setSidebarOpen(true)} aria-label="Open sidebar"><Menu size={19} /></button><Link to="/" className="workspace-mobile-brand"><Brand compact /></Link><span className="workspace-context">Workspace <span>/</span> {activeChat?.title || 'New chat'}</span></div>
          <div className="workspace-header-actions"><ThemeToggle compact /><button className="icon-button help-button" type="button" title="Help"><CircleHelp size={17} /></button><button className="icon-button logout-header" type="button" onClick={logout} title="Log out"><LogOut size={17} /></button></div>
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
            <textarea ref={textareaRef} value={input} onChange={(event) => { setInput(event.target.value); resizeComposer(event.target) }} onPaste={(event) => { const pastedImages = Array.from(event.clipboardData.items || []).filter((item) => item.type.startsWith('image/')).map((item) => item.getAsFile()).filter(Boolean); if (pastedImages.length) { event.preventDefault(); addFiles(pastedImages) } }} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); handleSend() } }} rows={1} placeholder="Ada yang bisa saya bantu hari ini?" aria-label="Message Perfectly" style={{ resize: 'none' }} />
            <div className="workspace-composer-footer">
              <div className="composer-left-tools">
                <button type="button" className="composer-plus-button" onClick={() => fileRef.current?.click()} title="Attach files" aria-label="Attach files"><Plus size={20} /></button>
                <input ref={fileRef} type="file" hidden multiple accept="image/png,image/jpeg,image/webp,image/gif,.txt,.md,.json,.csv,.js,.jsx,.ts,.tsx,.html,.css,.py,.java,.go,.rs,.sql,.log,.yaml,.yml,.xml,.sh" onChange={(event) => addFiles(event.target.files)} />
                <div className="composer-mode-switch" role="group" aria-label="Chat mode"><button className="active" type="button" aria-pressed="true">Chat</button><button type="button" disabled title="Cowork mode is coming soon">Cowork</button></div>
              </div>
              <div className="composer-right-tools">
                <ModelSelector value={model} onChange={setModel} compact isPro={user?.is_pro === true} onLocked={() => setStatusError('GPT dan Claude hanya tersedia untuk pengguna Perfectly Pro. Hubungi administrator untuk upgrade akun.')} />
                <button type="button" className={`composer-voice-button ${voiceListening ? 'listening' : ''}`} onClick={startVoiceInput} title="Voice input" aria-label={voiceListening ? 'Stop voice input' : 'Start voice input'}><Mic size={17} /></button>
                <button type="button" className="workspace-send-button" disabled={sending || (!input.trim() && !attachments.length)} onClick={() => handleSend()} aria-label="Send message">{sending ? <span className="button-spinner" /> : <ArrowUp size={17} />}</button>
              </div>
            </div>
          </div>
          <p className="composer-disclaimer"><ShieldCheck size={12} /> Perfectly can make mistakes. Review generated code before using it.</p>
        </div>
      </main>
    </div>
  )
}
