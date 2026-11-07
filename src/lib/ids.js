const CHAT_ID_LENGTH = 25
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

export function createChatId() {
  const values = new Uint8Array(CHAT_ID_LENGTH)
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(values)
  else for (let index = 0; index < values.length; index += 1) values[index] = Math.floor(Math.random() * 256)
  return Array.from(values, (value) => ALPHABET[value % ALPHABET.length]).join('')
}

export function isChatId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9]{25}$/.test(value)
}
