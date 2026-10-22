import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildEventSpectatorUrl, buildGameSpectatorUrl } from '../src/publicAppUrl.ts'

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
