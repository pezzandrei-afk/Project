const GAME_CODE_PATTERN = /^[A-Z0-9]{10}$/

export function getPublicAppUrl() {
  const configuredUrl = import.meta.env.VITE_PUBLIC_APP_URL?.trim()
  if (configuredUrl) {
    try {
      const url = new URL(configuredUrl)
      if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
        return null
      }
      return url.origin
    } catch {
      return null
    }
  }

  if (
    window.location.protocol === 'capacitor:' ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1'
  ) {
    return null
  }

  return window.location.origin
}

export function buildGameSpectatorUrl(baseUrl: string, gameCode: string) {
  const normalizedCode = gameCode.toUpperCase()
  if (!GAME_CODE_PATTERN.test(normalizedCode)) {
    throw new Error('Invalid game code')
  }

  return `${new URL(baseUrl).origin}/g/${normalizedCode}`
}

export function buildEventSpectatorUrl(baseUrl: string, eventCode: string) {
  const normalizedCode = eventCode.toUpperCase()
  if (!GAME_CODE_PATTERN.test(normalizedCode)) {
    throw new Error('Invalid event code')
  }

  return `${new URL(baseUrl).origin}/e/${normalizedCode}`
}
