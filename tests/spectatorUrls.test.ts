import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildEventSpectatorUrl, buildGameSpectatorUrl, resolvePublicAppUrl } from '../src/publicAppUrl.ts'

const deployedLocation = {
  protocol: 'https:',
  hostname: 'project-cxa.pages.dev',
  origin: 'https://project-cxa.pages.dev',
} as Location
const androidAppLocation = {
  protocol: 'https:',
  hostname: 'localhost',
  origin: 'https://localhost',
} as Location

test('placeholder deployment URL falls back to the current public site', () => {
  assert.equal(
    resolvePublicAppUrl('https://your-site.pages.dev', deployedLocation),
    'https://project-cxa.pages.dev',
  )
})

test('Android app uses the production website when the configured URL is a placeholder', () => {
  assert.equal(
    resolvePublicAppUrl('https://your-site.pages.dev', androidAppLocation, true),
    'https://project-cxa.pages.dev',
  )
})

test('Android app uses the production website when no public URL was configured', () => {
  assert.equal(
    resolvePublicAppUrl(undefined, androidAppLocation, true),
    'https://project-cxa.pages.dev',
  )
})

test('configured public URL is preserved when it is not a placeholder', () => {
  assert.equal(
    resolvePublicAppUrl('https://scoreline.pages.dev', deployedLocation),
    'https://scoreline.pages.dev',
  )
})

test('event spectator links use the stable event route and event code', () => {
  assert.equal(
    buildEventSpectatorUrl('https://scoreline.pages.dev/', 'abcdefghij'),
    'https://scoreline.pages.dev/e/ABCDEFGHIJ',
  )
})

test('single-game spectator links use the game route and game code', () => {
  assert.equal(
    buildGameSpectatorUrl('https://scoreline.pages.dev/', 'utqn3cefcr'),
    'https://scoreline.pages.dev/g/UTQN3CEFCR',
  )
})

test('event spectator links reject invalid codes', () => {
  assert.throws(
    () => buildEventSpectatorUrl('https://scoreline.pages.dev', 'not-a-code'),
    /Invalid event code/,
  )
})
