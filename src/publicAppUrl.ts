const GAME_CODE_PATTERN = /^[A-Z0-9]{10}$/
const PLACEHOLDER_HOSTS = new Set(['your-site.pages.dev'])
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1'])

export function getPublicAppUrl() {
  const configuredUrl = import.meta.env.VITE_PUBLIC_APP_URL?.trim()
  return resolvePublicAppUrl(configuredUrl, window.location)
}

export function resolvePublicAppUrl(
  configuredUrl: string | undefined,
  currentLocation: Pick<Location, 'protocol' | 'hostname' | 'origin'>,
) {
  if (configuredUrl) {
    try {
      const url = new URL(configuredUrl)
      if (url.protocol !== 'https:' && !(url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname))) {
        return null
      }
      if (PLACEHOLDER_HOSTS.has(url.hostname.toLowerCase())) {
        return getCurrentPublicOrigin(currentLocation)
      }
      return url.origin
    } catch {
      return null
    }
  }

  return getCurrentPublicOrigin(currentLocation)
}

function getCurrentPublicOrigin(currentLocation: Pick<Location, 'protocol' | 'hostname' | 'origin'>) {
  if (currentLocation.protocol === 'capacitor:' || LOCAL_HOSTS.has(currentLocation.hostname)) {
    return null
  }

  return currentLocation.origin
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
