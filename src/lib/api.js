async function request(url, options = {}) {
  const response = await fetch(url, { credentials: 'same-origin', ...options })
  const payload = await response.json().catch(() => null)
  if (!payload) throw new Error('Server mengirim respons yang tidak valid. Coba lagi.')
  if (!response.ok) throw new Error(payload.error || `Request gagal (${response.status}).`)
  return payload
}

export function sendChat({ model, messages }) {
  return request('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages }),
  })
}

export function fetchChats() {
  return request('/api/chats')
}

export function saveChat(conversation) {
  return request('/api/chats', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversation }),
  })
}

export function deleteChat(id) {
  return request(`/api/chats?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function logout() {
  return request('/api/auth?action=logout', { method: 'POST' })
}

export async function getHealth() {
  return request('/api/health')
}
