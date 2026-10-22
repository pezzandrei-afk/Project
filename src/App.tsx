import { useCallback, useEffect, useRef, useState, type FormEvent, type RefObject } from 'react'
import {
  Activity,
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  History,
  LockKeyhole,
  Minus,
  Palette,
  Radio,
  RotateCcw,
  ShieldCheck,
  Trophy,
  Undo2,
  Users,
  Wifi,
  WifiOff,
  X,
  Zap,
} from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import { Capacitor } from '@capacitor/core'
import { QRCodeSVG } from 'qrcode.react'
import { supabase } from './supabase'
import type { GameEventRow, GameRow, GameStatus, ScoreboardEventRow } from './database.types'
import { TEAM_COLORS, TEAM_LOGOS } from './constants'
import { EventDashboard, EventManagerScreen } from './EventScreens'
import { generateCode } from './gameCodes'
import { buildEventSpectatorUrl, buildGameSpectatorUrl, getPublicAppUrl } from './publicAppUrl'
import { downloadQrCodePng } from './downloadQrCode'
import './App.css'

export type Game = GameRow
export type GameEvent = GameEventRow

interface AppProps {
  path: string
  navigate: (path: string) => void
  user: User | null
  authLoading: boolean
  passwordRecovery: boolean
  onPasswordRecoveryComplete: () => void
  onSignOut: () => void
}

const CODE_LENGTH = 10
const MANAGER_KEY_PREFIX = 'scoreline-manager:'
const RECENT_GAMES_KEY = 'scoreline-recent-games'

function getManagedGameCodes() {
  const savedCodes: unknown = JSON.parse(window.localStorage.getItem(RECENT_GAMES_KEY) ?? '[]')
  const indexedCodes = Array.isArray(savedCodes)
    ? savedCodes.filter((code): code is string => typeof code === 'string' && /^[A-Z0-9]{10}$/.test(code))
    : []
  const keyCodes = new Set<string>()

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index)
    const match = key?.match(/^scoreline-manager:([A-Z0-9]{10})$/)
    if (match && key && window.localStorage.getItem(key) !== null) keyCodes.add(match[1])
  }

  return [...new Set([...indexedCodes, ...keyCodes])].filter((code) => keyCodes.has(code)).slice(0, 25)
}

function rememberManagedGame(code: string) {
  const codes = [code, ...getManagedGameCodes().filter((savedCode) => savedCode !== code)].slice(0, 25)
  window.localStorage.setItem(RECENT_GAMES_KEY, JSON.stringify(codes))
}

function isRpcSignatureError(error: { code?: string; message: string }) {
  return error.code === 'PGRST202' || error.code === 'PGRST203' ||
    /could not find the function|schema cache|function .* does not exist/i.test(error.message)
}

function generateManagerKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
}

function readManagerKey(code: string, isManager: boolean) {
  if (!isManager) return ''

  const fragmentKey = window.location.hash.slice(1)
  if (fragmentKey.length >= 32) return fragmentKey

  try {
    return window.localStorage.getItem(`${MANAGER_KEY_PREFIX}${code}`) ?? ''
  } catch {
    return ''
  }
}

function getGamePath(path: string) {
  const match = path.match(/^\/(g|manage)\/([A-Z0-9]{10})\/?$/i)
  return match
    ? { mode: match[1].toLowerCase() === 'manage' ? ('manage' as const) : ('view' as const), code: match[2].toUpperCase() }
    : null
}

function formatRelativeTime(dateString: string) {
  try {
    const then = new Date(dateString).getTime()
    const now = Date.now()
    const diffSec = Math.floor((now - then) / 1000)

    if (diffSec < 10) return 'Just now'
    if (diffSec < 60) return `${diffSec}s ago`
    const diffMin = Math.floor(diffSec / 60)
    if (diffMin < 60) return `${diffMin}m ago`
    return new Date(dateString).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  } catch {
    return ''
  }
}

function App({ path, navigate, user, authLoading, passwordRecovery, onPasswordRecoveryComplete, onSignOut }: AppProps) {
  const eventViewer = path.match(/^\/e\/([A-Z0-9]{10})\/?$/i)
  const eventManager = path.match(/^\/event\/([A-Z0-9]{10})\/?$/i)
  const eventGameManager = path.match(/^\/event\/([A-Z0-9]{10})\/game\/([A-Z0-9]{10})\/?$/i)
  const route = getGamePath(path)
  const publicAppUrl = getPublicAppUrl()

  if (eventViewer) {
    return <EventViewerScreen code={eventViewer[1].toUpperCase()} navigate={navigate} />
  }

  if (eventManager) {
    return <EventManagerScreen code={eventManager[1].toUpperCase()} user={user} authLoading={authLoading} navigate={navigate} />
  }

  if (eventGameManager) {
    return (
      <GameScreen
        key={`event-${eventGameManager[1]}-${eventGameManager[2]}`}
        code={eventGameManager[2].toUpperCase()}
        mode="manage"
        navigate={navigate}
        backPath={`/event/${eventGameManager[1].toUpperCase()}`}
        shareUrlOverride={publicAppUrl ? buildEventSpectatorUrl(publicAppUrl, eventGameManager[1]) : ''}
        user={user}
        authLoading={authLoading}
      />
    )
  }

  if (route) {
    return (
      <GameScreen
        key={`${route.mode}-${route.code}`}
        code={route.code}
        mode={route.mode}
        navigate={navigate}
        user={user}
        authLoading={authLoading}
      />
    )
  }

  return (
    <HomeScreen
      navigate={navigate}
      user={user}
      authLoading={authLoading}
      passwordRecovery={passwordRecovery}
      onPasswordRecoveryComplete={onPasswordRecoveryComplete}
      onSignOut={onSignOut}
    />
  )
}

interface TeamStylePickerProps {
  label: string
  color: string
  logo: string
  onColorChange: (color: string) => void
  onLogoChange: (logo: string) => void
}

function TeamStylePicker({ label, color, logo, onColorChange, onLogoChange }: TeamStylePickerProps) {
  const [openLogos, setOpenLogos] = useState(false)
  const [openColors, setOpenColors] = useState(false)

  return (
    <div className="team-style-picker">
      <span className="style-picker-label">{label}</span>
      <div className="style-picker-controls">
        <div className="picker-badge-wrap">
          <button
            type="button"
            className="logo-badge-button"
            style={{ borderColor: color, backgroundColor: `${color}18` }}
            onClick={() => {
              setOpenLogos(!openLogos)
              setOpenColors(false)
            }}
            title="Choose Team Logo"
          >
            <span className="badge-emoji">{logo}</span>
            <ChevronDown size={12} className="picker-caret" />
          </button>

          {openLogos && (
            <div className="popover-grid logo-popover">
              <div className="popover-header">Choose Mascot / Badge</div>
              <div className="emoji-grid">
                {TEAM_LOGOS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={`emoji-btn ${item === logo ? 'is-selected' : ''}`}
                    onClick={() => {
                      onLogoChange(item)
                      setOpenLogos(false)
                    }}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="picker-color-wrap">
          <button
            type="button"
            className="color-dot-button"
            style={{ backgroundColor: color }}
            onClick={() => {
              setOpenColors(!openColors)
              setOpenLogos(false)
            }}
            title="Choose Team Color"
          >
            <span className="sr-only">Choose Color</span>
          </button>

          {openColors && (
            <div className="popover-grid color-popover">
              <div className="popover-header">Choose Team Color</div>
              <div className="color-palette-grid">
                {TEAM_COLORS.map((c) => (
                  <button
                    key={c.hex}
                    type="button"
                    className={`palette-dot ${c.hex.toLowerCase() === color.toLowerCase() ? 'is-selected' : ''}`}
                    style={{ backgroundColor: c.hex }}
                    title={c.name}
                    onClick={() => {
                      onColorChange(c.hex)
                      setOpenColors(false)
                    }}
                  />
                ))}
              </div>
              <label className="custom-color-input-label">
                <span>Custom:</span>
                <input
                  type="color"
                  value={color}
                  onChange={(e) => onColorChange(e.target.value)}
                />
              </label>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface RecentGamesProps {
  games: GameRow[]
  loading: boolean
  onOpen: (code: string) => void
}

function RecentGames({ games, loading, onOpen }: RecentGamesProps) {
  if (!loading && games.length === 0) return null

  return (
    <section className="recent-games-section">
      <div className="recent-games-heading">
        <div>
          <span className="eyebrow"><span className="eyebrow-dot" /> MANAGER DASHBOARD</span>
          <h2>My recent games</h2>
          <p>Pick up where you left off. Your manager key stays on this device.</p>
        </div>
        <span className="recent-games-count">{loading ? 'LOADING' : `${games.length} SAVED`}</span>
      </div>

      {loading ? (
        <div className="recent-games-loading"><span className="spinner" /> Loading your games…</div>
      ) : (
        <div className="recent-games-list">
          {games.map((game) => (
            <button
              className="recent-game-card"
              key={game.code}
              onClick={() => onOpen(game.code)}
              type="button"
            >
              <span className="recent-game-teams">
                <span className="recent-game-name">{game.home_logo || '🏠'} {game.home_team}</span>
                <span className="recent-game-score">{game.home_score} <span>—</span> {game.away_score}</span>
                <span className="recent-game-name recent-game-away">{game.away_logo || '🏁'} {game.away_team}</span>
              </span>
              <span className="recent-game-meta">
                <span className={`recent-game-status ${game.status === 'FINAL' ? 'is-final' : ''}`}>
                  <span /> {game.status === 'LIVE' ? 'LIVE' : 'FINAL'}
                </span>
                <span>{formatRelativeTime(game.updated_at)}</span>
                <ArrowUpRight size={16} />
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

function HomeScreen({ navigate, user, authLoading, passwordRecovery, onPasswordRecoveryComplete, onSignOut }: Pick<AppProps, 'navigate' | 'user' | 'authLoading' | 'passwordRecovery' | 'onPasswordRecoveryComplete' | 'onSignOut'>) {
  const [homeTeam, setHomeTeam] = useState('')
  const [awayTeam, setAwayTeam] = useState('')
  const [homeColor, setHomeColor] = useState('#2563eb')
  const [awayColor, setAwayColor] = useState('#dc2626')
  const [homeLogo, setHomeLogo] = useState('🏀')
  const [awayLogo, setAwayLogo] = useState('⚡')
  const [joinCode, setJoinCode] = useState('')
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [recentGames, setRecentGames] = useState<GameRow[]>([])
  const [loadingRecentGames, setLoadingRecentGames] = useState(Boolean(supabase))

  const refreshRecentGames = useCallback(async () => {
    if (!supabase) {
      setLoadingRecentGames(false)
      return
    }

    let codes: string[]
    try {
      codes = getManagedGameCodes()
    } catch {
      setError('Could not read your saved manager games from this browser.')
      setLoadingRecentGames(false)
      return
    }

    if (codes.length === 0) {
      setRecentGames([])
      setLoadingRecentGames(false)
      return
    }

    try {
      const { data, error: fetchError } = await supabase
        .from('games')
        .select('*')
        .in('code', codes)
        .order('updated_at', { ascending: false })

      if (fetchError) {
        setError(`Could not load recent games: ${fetchError.message}`)
      } else {
        setRecentGames((data ?? []) as GameRow[])
      }
    } catch (loadFailure) {
      setError(`Could not load recent games: ${loadFailure instanceof Error ? loadFailure.message : 'Unexpected network error.'}`)
    } finally {
      setLoadingRecentGames(false)
    }
  }, [])

  useEffect(() => {
    void refreshRecentGames()
    const client = supabase
    if (!client) return

    const channel = client
      .channel('scoreline-recent-games')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games' }, () => {
        void refreshRecentGames()
      })
      .subscribe()

    return () => { void client.removeChannel(channel) }
  }, [refreshRecentGames])

  async function createGame(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    if (!supabase) {
      setError('Connect Supabase to create a game. Follow the setup steps in the project README.')
      return
    }

    const cleanHome = homeTeam.trim()
    const cleanAway = awayTeam.trim()
    if (!cleanHome || !cleanAway) {
      setError('Enter a name for both teams.')
      return
    }

    const code = generateCode()
    const managerKey = generateManagerKey()

    let managerKeySaved = false
    try {
      window.localStorage.setItem(`${MANAGER_KEY_PREFIX}${code}`, managerKey)
      managerKeySaved = true
    } catch {
      setError('This browser cannot save the manager key. A private recovery link will be shown after game creation.')
    }

    setCreating(true)
    try {
      let { error: createError } = await supabase.rpc('create_game', {
        p_code: code,
        p_home_team: cleanHome,
        p_away_team: cleanAway,
        p_manager_key: managerKey,
        p_home_color: homeColor,
        p_away_color: awayColor,
        p_home_logo: homeLogo,
        p_away_logo: awayLogo,
      })

      if (createError && isRpcSignatureError(createError)) {
        const legacyCreate = await supabase.rpc('create_game', {
          p_code: code,
          p_home_team: cleanHome,
          p_away_team: cleanAway,
          p_manager_key: managerKey,
        })
        createError = legacyCreate.error
      }

      if (createError) {
        if (managerKeySaved) window.localStorage.removeItem(`${MANAGER_KEY_PREFIX}${code}`)
        setError(
          createError.message.includes('duplicate')
            ? 'That game code was already used. Please try again.'
            : `Could not create the game: ${createError.message}`,
        )
        return
      }

      if (managerKeySaved) {
        try {
          rememberManagedGame(code)
        } catch {
          setError('Game created, but this browser could not save it to My Games. Save the recovery link from the manager console.')
          managerKeySaved = false
        }
      }
      navigate(`/manage/${code}${managerKeySaved ? '' : `#${managerKey}`}`)
    } catch (createFailure) {
      if (managerKeySaved) window.localStorage.removeItem(`${MANAGER_KEY_PREFIX}${code}`)
      setError(
        `Could not create the game: ${createFailure instanceof Error ? createFailure.message : 'Unexpected network error.'}`,
      )
    } finally {
      setCreating(false)
    }
  }

  function openGame(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const code = joinCode.replace(/[^a-z0-9]/gi, '').toUpperCase()
    if (code.length !== CODE_LENGTH) {
      setError(`Enter the full ${CODE_LENGTH}-character game code.`)
      return
    }
    setError('')
    navigate(`/g/${code}`)
  }

  return (
    <main className="home-page">
      <header className="topbar">
        <a
          className="brand"
          href="/"
          onClick={(event) => {
            event.preventDefault()
            navigate('/')
          }}
        >
          <span className="brand-mark">
            <Activity size={20} strokeWidth={2.5} />
          </span>
          <span>
            scoreline<span className="brand-period">.</span>
          </span>
        </a>
        <div className="topbar-right">
          {!Capacitor.isNativePlatform() && (
            <a className="button button-outline apk-download-link" href="/downloads/scoreline-manager.apk" download>
              <Download size={15} /> Android app
            </a>
          )}
          <span className="no-account">
            <ShieldCheck size={15} /> Mobile & APK Ready
          </span>
        </div>
      </header>

      <section className="home-hero">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="eyebrow-dot" /> THE SCOREBOARD THAT TRAVELS
          </div>
          <h1>
            Every point.<br />Everyone <span>in sync.</span>
          </h1>
          <p className="hero-description">
            Run the game from your phone. Share one link or QR code. Let everyone follow live, wherever they are.
          </p>
          <div className="hero-benefits">
            <div>
              <Radio size={16} />
              <span>Realtime sync</span>
            </div>
            <div>
              <Users size={16} />
              <span>Zero-install for viewers</span>
            </div>
            <div>
              <Zap size={16} />
              <span>Manager score history</span>
            </div>
          </div>
          <div className="hero-score-card" aria-label="Scoreboard preview">
            <div className="preview-heading">
              <span>
                <span className="live-dot" /> LIVE SCOREBOARD PREVIEW
              </span>
              <span>MATCH 01</span>
            </div>
            <div className="preview-teams">
              <div className="preview-team">
                <span
                  className="team-avatar"
                  style={{ backgroundColor: homeColor, color: '#fff' }}
                >
                  {homeLogo}
                </span>
                <span>{homeTeam.trim() || 'HOME'}</span>
                <strong style={{ color: homeColor }}>18</strong>
              </div>
              <span className="preview-divider">:</span>
              <div className="preview-team preview-team-away">
                <strong style={{ color: awayColor }}>14</strong>
                <span>{awayTeam.trim() || 'AWAY'}</span>
                <span
                  className="team-avatar"
                  style={{ backgroundColor: awayColor, color: '#fff' }}
                >
                  {awayLogo}
                </span>
              </div>
            </div>
            <div className="preview-footer">
              <span>
                <Wifi size={13} /> MANAGER EVENT LOG
              </span>
              <span>Custom colors & badges active</span>
            </div>
          </div>
        </div>

        <div className="start-panel">
          <div className="panel-icon">
            <Trophy size={19} />
          </div>
          <p className="panel-kicker">GAME SETUP</p>
          <h2>Start a scoreboard</h2>
          <p className="panel-description">Customize your teams, colors, and mascot badges.</p>

          <form className="create-form" onSubmit={createGame}>
            <div className="form-team-group">
              <label htmlFor="home-team">TEAM ONE (HOME)</label>
              <input
                id="home-team"
                maxLength={24}
                onChange={(event) => setHomeTeam(event.target.value)}
                placeholder="e.g. Blue Falcons"
                required
                value={homeTeam}
              />
              <TeamStylePicker
                label="Home style"
                color={homeColor}
                logo={homeLogo}
                onColorChange={setHomeColor}
                onLogoChange={setHomeLogo}
              />
            </div>

            <div className="form-team-group">
              <label htmlFor="away-team">TEAM TWO (AWAY)</label>
              <input
                id="away-team"
                maxLength={24}
                onChange={(event) => setAwayTeam(event.target.value)}
                placeholder="e.g. Red Wolves"
                required
                value={awayTeam}
              />
              <TeamStylePicker
                label="Away style"
                color={awayColor}
                logo={awayLogo}
                onColorChange={setAwayColor}
                onLogoChange={setAwayLogo}
              />
            </div>

            <button className="button button-primary create-button" disabled={creating} type="submit">
              {creating ? (
                <span className="spinner" />
              ) : (
                <>
                  <span>Create scoreboard</span>
                  <ArrowUpRight size={18} />
                </>
              )}
            </button>
          </form>

          <div className="panel-separator">
            <span>OR JOIN AS SPECTATOR</span>
          </div>
          <form className="join-form" onSubmit={openGame}>
            <label className="sr-only" htmlFor="join-code">
              Game code
            </label>
            <input
              id="join-code"
              maxLength={CODE_LENGTH}
              onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
              placeholder="ENTER 10-CHAR GAME CODE"
              value={joinCode}
            />
            <button className="button button-dark" type="submit" aria-label="Join game">
              <ArrowUpRight size={18} />
            </button>
          </form>
          {!supabase && (
            <p className="setup-hint">
              <LockKeyhole size={14} />
              <span>
                Live games need a Supabase project URL and public key configured for this deployment.
              </span>
            </p>
          )}
        </div>
      </section>

      <EventDashboard
        user={user}
        authLoading={authLoading}
        passwordRecovery={passwordRecovery}
        onPasswordRecoveryComplete={onPasswordRecoveryComplete}
        onSignOut={onSignOut}
        navigate={navigate}
      />

      <RecentGames
        games={recentGames}
        loading={loadingRecentGames}
        onOpen={(code) => navigate(`/manage/${code}`)}
      />

      {error && (
        <div className="toast-error home-error" role="alert">
          <X size={16} />
          {error}
        </div>
      )}

      <footer className="home-footer">
        <span>MADE FOR REAL-TIME SPORTS & GAMES.</span>
        <span>FAST · PWA INSTALLABLE · MANAGER APK READY</span>
      </footer>
    </main>
  )
}

interface GameScreenProps {
  code: string
  mode: 'view' | 'manage'
  navigate: (path: string) => void
  backPath?: string
  shareUrlOverride?: string
  user?: User | null
  authLoading?: boolean
  eventTitle?: string
}

function GameScreen({ code, mode, navigate, backPath, shareUrlOverride, user = null, authLoading = false, eventTitle }: GameScreenProps) {
  const isManager = mode === 'manage'
  const [game, setGame] = useState<Game | null>(null)
  const [loading, setLoading] = useState(Boolean(supabase))
  const [error, setError] = useState(
    supabase ? '' : 'This app is not connected to Supabase yet. Complete the setup steps in README.md.',
  )
  const [connected, setConnected] = useState(false)
  const [initialManagerKey] = useState(() => readManagerKey(code, isManager))
  const [managerKey, setManagerKey] = useState(initialManagerKey)
  const [keyInput, setKeyInput] = useState(initialManagerKey)
  const [authorized, setAuthorized] = useState(false)
  const [verifyingKey, setVerifyingKey] = useState(() => Boolean(initialManagerKey))
  const [keyAttempt, setKeyAttempt] = useState(0)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [managerRecoveryCopied, setManagerRecoveryCopied] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const qrRef = useRef<SVGSVGElement>(null)
  const publicAppUrl = getPublicAppUrl()
  const viewerUrl = shareUrlOverride ?? (publicAppUrl ? buildGameSpectatorUrl(publicAppUrl, code) : '')

  useEffect(() => {
    if (!isManager || window.location.hash.length < 33) return

    try {
      window.localStorage.setItem(`${MANAGER_KEY_PREFIX}${code}`, managerKey)
      rememberManagedGame(code)
    } catch {
      setError('This recovery link works for this visit, but the manager key could not be saved on this device.')
    } finally {
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`)
    }
  }, [code, isManager, managerKey])

  // Load Game Details & subscribe to changes
  useEffect(() => {
    if (!supabase) return

    let active = true
    const client = supabase

    async function loadGame() {
      try {
        const { data, error: fetchError } = await client
          .from('games')
          .select('*')
          .eq('code', code)
          .maybeSingle()

        if (!active) return
        if (fetchError) {
          setError(`Could not load this game: ${fetchError.message}`)
        } else if (data) {
          setGame(data as Game)
        } else {
          setError('We couldn’t find that game. Check the code and try again.')
        }
      } catch (loadFailure) {
        if (active) {
          setError(
            `Could not load this game: ${loadFailure instanceof Error ? loadFailure.message : 'Unexpected network error.'}`,
          )
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadGame()

    const channel = client
      .channel(`scoreline-game-${code}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'games',
          filter: `code=eq.${code}`,
        },
        (payload) => {
          if (active) setGame(payload.new as Game)
        },
      )
      .subscribe((status) => {
        if (!active) return
        setConnected(status === 'SUBSCRIBED')
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setError('Live updates could not connect. Check Supabase Realtime is enabled for the games table.')
        }
      })

    return () => {
      active = false
      void client.removeChannel(channel)
    }
  }, [code])

  // Verify Manager Key
  useEffect(() => {
    if (!supabase || !isManager || !game || (game.event_id === null && !managerKey)) return
    if (game.event_id && authLoading) return
    if (game.event_id && !user) {
      setAuthorized(false)
      setVerifyingKey(false)
      return
    }

    let active = true
    const client = supabase
    const isAccountGame = game.event_id !== null
    async function verifyManagerKey() {
      try {
        const { data, error: verifyError } = isAccountGame
          ? await client.rpc('verify_event_game_owner', { p_code: code })
          : await client.rpc('verify_manager_key', { p_code: code, p_manager_key: managerKey })

        if (!active) return
        setAuthorized(!verifyError && data === true)
        if (verifyError) setError(`Could not verify manager access: ${verifyError.message}`)
        if (!verifyError && data !== true) {
          setError(isAccountGame ? 'This manager account does not own the event for this game.' : 'That manager key is not valid for this game.')
        }
        if (!verifyError && data === true) setError('')
      } catch (verifyFailure) {
        if (active) {
          setAuthorized(false)
          setError(
            `Could not verify manager access: ${verifyFailure instanceof Error ? verifyFailure.message : 'Unexpected network error.'}`,
          )
        }
      } finally {
        if (active) setVerifyingKey(false)
      }
    }

    void verifyManagerKey()

    return () => {
      active = false
    }
  }, [authLoading, code, game?.event_id, isManager, keyAttempt, managerKey, user])

  async function submitManagerKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = keyInput.trim()
    if (value.length < 32) {
      setError('Manager keys are at least 32 characters long.')
      return
    }
    try {
      window.localStorage.setItem(`${MANAGER_KEY_PREFIX}${code}`, value)
      rememberManagedGame(code)
      setManagerKey(value)
      setVerifyingKey(true)
      setKeyAttempt((attempt) => attempt + 1)
      setError('')
    } catch {
      setError('Could not save the manager key in this browser.')
    }
  }

  const updateGame = useCallback(
    async (next: {
      homeDelta?: number
      awayDelta?: number
      status?: GameStatus
    }) => {
      if (!supabase || !game || !authorized || saving) return

      const homeDelta = next.homeDelta ?? 0
      const awayDelta = next.awayDelta ?? 0
      const homeScore = game.home_score + homeDelta
      const awayScore = game.away_score + awayDelta
      const status = next.status ?? game.status
      if (homeScore < 0 || awayScore < 0) return

      setSaving(true)
      setError('')
      try {
        let updateError
        if (game.event_id) {
          const result = await supabase.rpc('update_event_game', {
            p_code: code,
            p_home_delta: homeDelta,
            p_away_delta: awayDelta,
            p_status: status,
          })
          updateError = result.error
        } else {
          const result = await supabase.rpc('update_game', {
            p_code: code,
            p_manager_key: managerKey,
            p_home_delta: homeDelta,
            p_away_delta: awayDelta,
            p_status: status,
          })
          updateError = result.error
        }

        if (updateError && !game.event_id && isRpcSignatureError(updateError)) {
          const legacyUpdate = await supabase.rpc('update_game', {
            p_code: code,
            p_manager_key: managerKey,
            p_home_score: homeScore,
            p_away_score: awayScore,
            p_status: status,
          })
          updateError = legacyUpdate.error
        }

        if (updateError) {
          if (/one point at a time/i.test(updateError.message)) {
            setError('Multi-point scoring is not enabled in this Supabase database yet. Run supabase/migration_scoring_undo.sql in the Supabase SQL Editor, then reload this game.')
          } else {
            setError(
              isRpcSignatureError(updateError)
                ? 'This database needs the latest scoring migration. Run the Scoreline upgrade SQL in Supabase.'
                : `Score could not be saved: ${updateError.message}`,
            )
          }
        } else {
          setGame({ ...game, home_score: homeScore, away_score: awayScore, status })
          return true
        }
      } catch (updateFailure) {
        setError(
          `Score could not be saved: ${updateFailure instanceof Error ? updateFailure.message : 'Unexpected network error.'}`,
        )
      } finally {
        setSaving(false)
      }
      return false
    },
    [authorized, code, game, managerKey, saving],
  )

  const resetGameScore = useCallback(async () => {
    if (!supabase || !game || !authorized || saving) return
    if (!window.confirm('Are you sure you want to reset both scores to 0 - 0?')) return

    setSaving(true)
    setError('')
    try {
      const result = game.event_id
        ? await supabase.rpc('reset_event_game_score', { p_code: code })
        : await supabase.rpc('reset_game_score', { p_code: code, p_manager_key: managerKey })
      const resetError = result.error
      if (resetError) {
        setError(`Could not reset score: ${resetError.message}`)
      } else {
        setGame({ ...game, home_score: 0, away_score: 0 })
      }
    } catch (resetFailure) {
      setError(
        `Could not reset score: ${resetFailure instanceof Error ? resetFailure.message : 'Unexpected network error.'}`,
      )
    } finally {
      setSaving(false)
    }
  }, [authorized, code, game, managerKey, saving])

  const undoLastScore = useCallback(async () => {
    if (!supabase || !game || !authorized || saving) return

    setSaving(true)
    setError('')
    try {
      const result = game.event_id
        ? await supabase.rpc('undo_event_game_score', { p_code: code })
        : await supabase.rpc('undo_last_score', { p_code: code, p_manager_key: managerKey })
      const undoError = result.error
      if (undoError) {
        setError(
          isRpcSignatureError(undoError)
            ? 'Undo is not installed yet. Run the latest Scoreline upgrade SQL in Supabase.'
            : `Could not undo the last score: ${undoError.message}`,
        )
        return
      }

      const { data, error: refreshError } = await supabase
        .from('games')
        .select('*')
        .eq('code', code)
        .single()
      if (refreshError) {
        setError(`Score was undone, but the refreshed score could not be loaded: ${refreshError.message}`)
      } else {
        setGame(data as Game)
        if ('vibrate' in navigator) navigator.vibrate(18)
      }
    } catch (undoFailure) {
      setError(
        `Could not undo the last score: ${undoFailure instanceof Error ? undoFailure.message : 'Unexpected network error.'}`,
      )
    } finally {
      setSaving(false)
    }
  }, [authorized, code, game, managerKey, saving])

  const updateGameTeams = useCallback(
    async (newSettings: {
      homeTeam: string
      awayTeam: string
      homeColor: string
      awayColor: string
      homeLogo: string
      awayLogo: string
    }) => {
      if (!supabase || !game || !authorized || saving) return

      setSaving(true)
      setError('')
      try {
        const result = game.event_id
          ? await supabase.rpc('update_event_game_teams', {
              p_code: code,
              p_home_team: newSettings.homeTeam,
              p_away_team: newSettings.awayTeam,
              p_home_color: newSettings.homeColor,
              p_away_color: newSettings.awayColor,
              p_home_logo: newSettings.homeLogo,
              p_away_logo: newSettings.awayLogo,
            })
          : await supabase.rpc('update_game_teams', {
              p_code: code,
              p_manager_key: managerKey,
              p_home_team: newSettings.homeTeam,
              p_away_team: newSettings.awayTeam,
              p_home_color: newSettings.homeColor,
              p_away_color: newSettings.awayColor,
              p_home_logo: newSettings.homeLogo,
              p_away_logo: newSettings.awayLogo,
            })
        const rpcError = result.error
        if (rpcError) {
          setError(`Could not update team settings: ${rpcError.message}`)
        } else {
          setGame({
            ...game,
            home_team: newSettings.homeTeam,
            away_team: newSettings.awayTeam,
            home_color: newSettings.homeColor,
            away_color: newSettings.awayColor,
            home_logo: newSettings.homeLogo,
            away_logo: newSettings.awayLogo,
          })
          setShowEditModal(false)
        }
      } catch (err) {
        setError(`Failed to update teams: ${err instanceof Error ? err.message : 'Network error'}`)
      } finally {
        setSaving(false)
      }
    },
    [authorized, code, game, managerKey, saving],
  )

  async function copyLink() {
    try {
      const baseUrl = getPublicAppUrl()
      if (!baseUrl) {
        setError('Set VITE_PUBLIC_APP_URL to your deployed website URL before sharing from the Android app.')
        return
      }
      await navigator.clipboard.writeText(`${baseUrl}/g/${code}`)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setError('Could not copy the link. Copy it from the address bar instead.')
    }
  }

  async function downloadSpectatorQr() {
    if (!qrRef.current) {
      setError('The spectator QR is not ready to download yet.')
      return
    }
    try {
      await downloadQrCodePng(qrRef.current, `${shareUrlOverride !== undefined ? 'scoreline-event' : 'scoreline-game'}-${code}.png`)
    } catch (downloadFailure) {
      setError(`Could not download the spectator QR: ${downloadFailure instanceof Error ? downloadFailure.message : 'Unexpected image error.'}`)
    }
  }

  async function copyManagerRecoveryLink() {
    try {
      const baseUrl = getPublicAppUrl()
      if (!baseUrl) {
        setError('Set VITE_PUBLIC_APP_URL to your deployed website URL before creating a recovery link in the Android app.')
        return
      }
      await navigator.clipboard.writeText(`${baseUrl}/manage/${code}#${managerKey}`)
      setManagerRecoveryCopied(true)
      window.setTimeout(() => setManagerRecoveryCopied(false), 1800)
    } catch {
      setError('Could not copy the recovery link. Check clipboard permission and try again.')
    }
  }

  async function editScore(side: 'home' | 'away', amount: number) {
    if (!game) return
    const score = side === 'home' ? game.home_score : game.away_score
    if (score + amount < 0) return
    const saved = await updateGame(side === 'home' ? { homeDelta: amount } : { awayDelta: amount })
    if (saved && 'vibrate' in navigator) navigator.vibrate(18)
  }

  if (loading) {
    return <LoadingScreen onBack={isManager ? () => navigate('/') : undefined} />
  }

  if (!game) {
    return <UnavailableScreen error={error} onBack={isManager ? () => navigate('/') : undefined} />
  }

  return (
    <main className="game-page">
      <header className="topbar game-topbar">
        {isManager ? (
          <a
            className="brand"
            href="/"
            onClick={(event) => {
              event.preventDefault()
              navigate('/')
            }}
          >
            <span className="brand-mark">
              <Activity size={20} strokeWidth={2.5} />
            </span>
            <span>
              scoreline<span className="brand-period">.</span>
            </span>
          </a>
        ) : (
          <div className="brand" aria-label="Scoreline">
            <span className="brand-mark">
              <Activity size={20} strokeWidth={2.5} />
            </span>
            <span>
              scoreline<span className="brand-period">.</span>
            </span>
          </div>
        )}
        <div className="game-header-meta">
          {isManager && authorized && (
            <button className="button button-outline share-button" onClick={() => void copyLink()} type="button">
              {copied ? <Check size={15} /> : <Copy size={15} />}
              {copied ? 'Link copied' : 'Share game'}
            </button>
          )}
          <span className={`connection-state ${connected ? 'is-connected' : ''}`}>
            {connected ? <Wifi size={14} /> : <WifiOff size={14} />}
            {connected ? 'LIVE SYNC' : 'CONNECTING'}
          </span>
        </div>
      </header>

      <section className="score-page-content">
        {isManager && (
          <button className="back-link" onClick={() => navigate(backPath ?? '/')} type="button">
            <ArrowLeft size={15} /> {backPath ? 'Back to event' : 'Back to Scoreline'}
          </button>
        )}

        <div className="game-context">
          <div className="eyebrow">
            <span className="eyebrow-dot" /> {eventTitle ? `${eventTitle} · EVENT SCOREBOARD` : isManager ? 'MANAGER CONSOLE' : 'LIVE SPECTATOR VIEW'}
          </div>
          <h1>{eventTitle || (isManager ? 'Your game, in your hands.' : 'The game, as it happens.')}</h1>
          <p>
            {eventTitle
              ? 'This is the current game in the event. The same page will show the next scoreboard when the manager starts it.'
              : isManager
              ? 'Tap to update scores. Every spectator across phones and browsers sees it instantly.'
              : 'You’re watching live. The score and event timeline update in real time.'}
          </p>
        </div>

        <section className={`scoreboard ${game.status === 'FINAL' ? 'scoreboard-final' : ''}`}>
          <div className="scoreboard-topline">
            <span className={`status-pill ${game.status !== 'LIVE' ? 'status-final' : ''}`}>
              <span className="live-dot" /> {game.status === 'LIVE' ? 'LIVE GAME' : game.status === 'UPCOMING' ? 'UP NEXT' : 'FINAL SCORE'}
            </span>
            <span className="game-code-label">
              GAME CODE <strong>{game.code}</strong>
            </span>
          </div>

          <div className="score-grid">
            <TeamPanel
              name={game.home_team}
              score={game.home_score}
              color={game.home_color || '#2563eb'}
              logo={game.home_logo || '🏀'}
              side="home"
              editable={isManager && authorized && game.status === 'LIVE'}
              saving={saving}
              onEdit={editScore}
            />
            <div className="versus">
              <span>VS</span>
              <div />
            </div>
            <TeamPanel
              name={game.away_team}
              score={game.away_score}
              color={game.away_color || '#dc2626'}
              logo={game.away_logo || '⚡'}
              side="away"
              editable={isManager && authorized && game.status === 'LIVE'}
              saving={saving}
              onEdit={editScore}
            />
          </div>

          <div className="scoreboard-bottomline">
            <span>
              <span className="sync-dot" /> Real-time active
            </span>
            <span>Updated {new Date(game.updated_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
          </div>
        </section>

        {isManager && (
          <ScoreHistory
            gameId={game.id}
            homeTeam={game.home_team}
            awayTeam={game.away_team}
            homeColor={game.home_color || '#2563eb'}
            awayColor={game.away_color || '#dc2626'}
            homeLogo={game.home_logo || '🏀'}
            awayLogo={game.away_logo || '⚡'}
          />
        )}

        {isManager && (
          <ManagerControls
            authorized={authorized}
            accountManaged={Boolean(game.event_id)}
            code={code}
            game={game}
            managerKey={managerKey}
            keyInput={keyInput}
            managerRecoveryCopied={managerRecoveryCopied}
            viewerUrl={viewerUrl}
            qrRef={qrRef}
            eventShare={shareUrlOverride !== undefined}
            saving={saving}
            verifyingKey={verifyingKey}
            onKeyChange={setKeyInput}
            onKeySubmit={submitManagerKey}
            onCopyManagerRecovery={() => void copyManagerRecoveryLink()}
            onDownloadQr={() => void downloadSpectatorQr()}
            onStatusChange={(status) => void updateGame({ status })}
            onResetScore={resetGameScore}
            onUndoLastScore={undoLastScore}
            onOpenEditTeams={() => setShowEditModal(true)}
            onBackToEvents={() => navigate(backPath ?? '/')}
          />
        )}

        {showEditModal && (
          <EditTeamsModal
            game={game}
            saving={saving}
            onClose={() => setShowEditModal(false)}
            onSave={updateGameTeams}
          />
        )}

        {error && (
          <div className="toast-error game-error" role="alert">
            <X size={16} />
            {error}
          </div>
        )}
      </section>
    </main>
  )
}

function EventViewerScreen({ code, navigate }: { code: string; navigate: (path: string) => void }) {
  const [event, setEvent] = useState<ScoreboardEventRow | null>(null)
  const [game, setGame] = useState<GameRow | null>(null)
  const [loading, setLoading] = useState(Boolean(supabase))
  const [error, setError] = useState('')

  const refreshCurrentGame = useCallback(async () => {
    if (!supabase) {
      setError('Supabase is not configured. Add the project URL and publishable key to the app environment.')
      setLoading(false)
      return
    }
    try {
      const { data: eventData, error: eventError } = await supabase
        .from('scoreboard_events')
        .select('*')
        .eq('code', code)
        .maybeSingle()
      if (eventError) {
        setError(`Could not load this event: ${eventError.message}`)
        return
      }
      if (!eventData) {
        setError('This event does not exist or is not available.')
        setEvent(null)
        setGame(null)
        return
      }

      const currentEvent = eventData as ScoreboardEventRow
      setEvent(currentEvent)
      if (!currentEvent.current_game_id) {
        setGame(null)
        setError('')
        return
      }

      const { data: gameData, error: gameError } = await supabase
        .from('games')
        .select('*')
        .eq('id', currentEvent.current_game_id)
        .maybeSingle()
      if (gameError) setError(`Could not load the current game: ${gameError.message}`)
      else if (gameData) {
        setGame(gameData as GameRow)
        setError('')
      } else {
        setGame(null)
        setError('The current game could not be found.')
      }
    } catch (fetchFailure) {
      setError(`Could not load this event: ${fetchFailure instanceof Error ? fetchFailure.message : 'Unexpected network error.'}`)
    } finally {
      setLoading(false)
    }
  }, [code])

  useEffect(() => {
    void refreshCurrentGame()
    if (!supabase) return
    const client = supabase
    const channel = client
      .channel(`scoreline-event-view-${code}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'scoreboard_events',
        filter: `code=eq.${code}`,
      }, () => { void refreshCurrentGame() })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setError('Could not receive event updates. Reconnect to the network or refresh this page.')
        }
      })
    return () => { void client.removeChannel(channel) }
  }, [code, refreshCurrentGame])

  if (loading) return <LoadingScreen />
  if (game && event) {
    return <GameScreen key={`${event.code}-${game.code}`} code={game.code} mode="view" navigate={navigate} eventTitle={event.title} />
  }

  return (
    <main className="game-page">
      <header className="topbar game-topbar">
        <div className="brand">
          <span className="brand-mark"><Activity size={20} strokeWidth={2.5} /></span>
          <span>scoreline<span className="brand-period">.</span></span>
        </div>
        <span className={`connection-state ${error ? 'is-error' : ''}`}>
          <WifiOff size={14} /> {error ? 'EVENT UNAVAILABLE' : 'WAITING FOR GAME'}
        </span>
      </header>
      <section className="score-page-content center-panel">
        <div className="unavailable-card event-waiting-card">
          <span className="state-icon"><Trophy size={22} /></span>
          <span className="eyebrow"><span className="eyebrow-dot" /> EVENT SPECTATOR</span>
          <h2>{event?.title ?? 'Event scoreboard'}</h2>
          <p>{error || 'The manager has not started a game yet. Keep this page open; it will switch to each game automatically.'}</p>
          <span className="event-view-code">EVENT CODE · {code}</span>
        </div>
      </section>
    </main>
  )
}

interface TeamPanelProps {
  name: string
  score: number
  color: string
  logo: string
  side: 'home' | 'away'
  editable: boolean
  saving: boolean
  onEdit: (side: 'home' | 'away', amount: number) => void
}

function TeamPanel({ name, score, color, logo, side, editable, saving, onEdit }: TeamPanelProps) {
  return (
    <div
      className={`score-team score-team-${side}`}
      style={{ '--team-color': color } as React.CSSProperties}
    >
      <div
        className="team-avatar team-avatar-large team-custom-badge"
        style={{
          backgroundColor: color,
          boxShadow: `0 8px 24px ${color}33`,
        }}
        title={`${name} Mascot`}
      >
        <span className="team-badge-icon">{logo}</span>
      </div>
      <h2>{name}</h2>
      <div
        key={score}
        className="score-number"
        style={{ color: editable ? color : undefined }}
        aria-label={`${name} score: ${score}`}
      >
        {String(score).padStart(2, '0')}
      </div>
      {editable ? (
        <div className="score-actions">
          <button
            aria-label={`Subtract one point from ${name}`}
            className="score-button score-button-minus"
            disabled={saving || score === 0}
            onClick={() => onEdit(side, -1)}
            type="button"
          >
            <Minus size={19} />
          </button>
          {[1, 2, 3].map((points) => (
            <button
              aria-label={`Add ${points} ${points === 1 ? 'point' : 'points'} to ${name}`}
              className={`score-button score-button-plus ${points === 1 ? 'score-button-primary' : 'score-button-preset'}`}
              style={points === 1 ? {
                backgroundColor: color,
                color: '#ffffff',
                boxShadow: `0 4px 14px ${color}40`,
              } : undefined}
              disabled={saving || score > 2147483647 - points}
              key={points}
              onClick={() => onEdit(side, points)}
              type="button"
            >
              <span>+{points}</span>
            </button>
          ))}
        </div>
      ) : (
        <span
          className="team-label"
          style={{
            borderLeft: `3px solid ${color}`,
            background: `${color}12`,
            color: '#2d3748',
          }}
        >
          {side === 'home' ? 'HOME TEAM' : 'AWAY TEAM'}
        </span>
      )}
    </div>
  )
}

interface ScoreHistoryProps {
  gameId: string
  homeTeam: string
  awayTeam: string
  homeColor: string
  awayColor: string
  homeLogo: string
  awayLogo: string
}

function ScoreHistory({
  gameId,
  homeTeam,
  awayTeam,
  homeColor,
  awayColor,
  homeLogo,
  awayLogo,
}: ScoreHistoryProps) {
  const [events, setEvents] = useState<GameEventRow[]>([])
  const [loading, setLoading] = useState(Boolean(supabase))
  const [collapsed, setCollapsed] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!supabase) return

    let active = true
    const client = supabase

    async function fetchEvents() {
      try {
        let { data, error: fetchError } = await client
          .from('game_events')
          .select('*')
          .eq('game_id', gameId)
          .order('event_order', { ascending: false })
          .limit(35)

        if (fetchError && (fetchError.code === '42703' || /event_order/i.test(fetchError.message))) {
          const legacyQuery = await client
            .from('game_events')
            .select('*')
            .eq('game_id', gameId)
            .order('created_at', { ascending: false })
            .limit(35)
          data = legacyQuery.data
          fetchError = legacyQuery.error
        }

        if (!active) return
        if (fetchError) {
          setError(`Could not load score history: ${fetchError.message}`)
        } else if (data) {
          setEvents(data as GameEventRow[])
        }
      } catch (fetchFailure) {
        if (active) {
          setError(`Could not load score history: ${fetchFailure instanceof Error ? fetchFailure.message : 'Unexpected network error.'}`)
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    void fetchEvents()

    const channel = client
      .channel(`game_events:${gameId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'game_events',
          filter: `game_id=eq.${gameId}`,
        },
        (payload) => {
          if (!active) return
          const newEvent = payload.new as GameEventRow
          setEvents((prev) => {
            if (prev.some((e) => e.id === newEvent.id)) return prev
            return [newEvent, ...prev]
          })
        },
      )
      .subscribe()

    return () => {
      active = false
      void client.removeChannel(channel)
    }
  }, [gameId])

  return (
    <section className="score-history-card">
      <div className="history-header">
        <div className="history-title-group">
          <History size={17} className="history-icon" />
          <h3>Play-by-Play & History</h3>
          <span className="history-badge-count">{events.length}</span>
        </div>
        <button
          type="button"
          className="history-toggle-button"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? 'Show feed' : 'Hide feed'}
        </button>
      </div>

      {!collapsed && (
        <div className="history-feed">
          {error ? (
            <div className="history-empty history-error">{error}</div>
          ) : loading && events.length === 0 ? (
            <div className="history-empty">Loading history...</div>
          ) : events.length === 0 ? (
            <div className="history-empty">No score events yet for {homeTeam} vs {awayTeam}. Points will appear here live!</div>
          ) : (
            <div className="history-list">
              {events.map((event) => {
                const isHome = event.team === 'home'
                const isAway = event.team === 'away'
                const badgeColor = isHome ? homeColor : isAway ? awayColor : '#64748b'
                const badgeIcon = isHome ? homeLogo : isAway ? awayLogo : event.event_type === 'RESET' || event.event_type === 'UNDO' ? '↺' : '🏁'

                return (
                  <div key={event.id} className="history-item">
                    <div
                      className="history-item-badge"
                      style={{ backgroundColor: `${badgeColor}18`, borderColor: badgeColor, color: badgeColor }}
                    >
                      <span>{badgeIcon}</span>
                    </div>

                    <div className="history-item-content">
                      <p className="history-item-message">{event.message}</p>
                      <span className="history-item-time">{formatRelativeTime(event.created_at)}</span>
                    </div>

                    <div className="history-item-score">
                      <span>{event.home_score}</span>
                      <span className="history-score-sep">-</span>
                      <span>{event.away_score}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

interface EditTeamsModalProps {
  game: Game
  saving: boolean
  onClose: () => void
  onSave: (settings: {
    homeTeam: string
    awayTeam: string
    homeColor: string
    awayColor: string
    homeLogo: string
    awayLogo: string
  }) => void
}

function EditTeamsModal({ game, saving, onClose, onSave }: EditTeamsModalProps) {
  const [homeTeam, setHomeTeam] = useState(game.home_team)
  const [awayTeam, setAwayTeam] = useState(game.away_team)
  const [homeColor, setHomeColor] = useState(game.home_color || '#2563eb')
  const [awayColor, setAwayColor] = useState(game.away_color || '#dc2626')
  const [homeLogo, setHomeLogo] = useState(game.home_logo || '🏀')
  const [awayLogo, setAwayLogo] = useState(game.away_logo || '⚡')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!homeTeam.trim() || !awayTeam.trim()) return
    onSave({
      homeTeam: homeTeam.trim(),
      awayTeam: awayTeam.trim(),
      homeColor,
      awayColor,
      homeLogo,
      awayLogo,
    })
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <Palette size={18} />
            <h3>Customize Teams & Colors</h3>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-team-group">
            <label htmlFor="edit-home-team">HOME TEAM NAME</label>
            <input
              id="edit-home-team"
              maxLength={24}
              value={homeTeam}
              onChange={(e) => setHomeTeam(e.target.value)}
              required
            />
            <TeamStylePicker
              label="Home style"
              color={homeColor}
              logo={homeLogo}
              onColorChange={setHomeColor}
              onLogoChange={setHomeLogo}
            />
          </div>

          <div className="form-team-group">
            <label htmlFor="edit-away-team">AWAY TEAM NAME</label>
            <input
              id="edit-away-team"
              maxLength={24}
              value={awayTeam}
              onChange={(e) => setAwayTeam(e.target.value)}
              required
            />
            <TeamStylePicker
              label="Away style"
              color={awayColor}
              logo={awayLogo}
              onColorChange={setAwayColor}
              onLogoChange={setAwayLogo}
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="button button-outline" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="button button-primary" disabled={saving}>
              {saving ? <span className="spinner" /> : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

interface ManagerControlsProps {
  authorized: boolean
  accountManaged: boolean
  code: string
  game: Game
  managerKey: string
  keyInput: string
  managerRecoveryCopied: boolean
  viewerUrl: string
  qrRef: RefObject<SVGSVGElement | null>
  eventShare: boolean
  saving: boolean
  verifyingKey: boolean
  onKeyChange: (value: string) => void
  onKeySubmit: (event: FormEvent<HTMLFormElement>) => void
  onCopyManagerRecovery: () => void
  onDownloadQr: () => void
  onStatusChange: (status: GameStatus) => void
  onResetScore: () => void
  onUndoLastScore: () => void
  onOpenEditTeams: () => void
  onBackToEvents: () => void
}

function ManagerControls({
  authorized,
  accountManaged,
  code,
  game,
  managerKey,
  keyInput,
  managerRecoveryCopied,
  viewerUrl,
  qrRef,
  eventShare,
  saving,
  verifyingKey,
  onKeyChange,
  onKeySubmit,
  onCopyManagerRecovery,
  onDownloadQr,
  onStatusChange,
  onResetScore,
  onUndoLastScore,
  onOpenEditTeams,
  onBackToEvents,
}: ManagerControlsProps) {
  if (!authorized) {
    if (accountManaged) {
      return (
        <section className="manager-card key-card">
          <div className="manager-card-icon"><LockKeyhole size={18} /></div>
          <div className="manager-card-copy">
            <h2>Manager sign-in required</h2>
            <p>Sign in with the account that owns this event to manage its games.</p>
          </div>
          <button className="button button-dark" onClick={onBackToEvents} type="button">Back to event</button>
        </section>
      )
    }
    return (
      <section className="manager-card key-card">
        <div className="manager-card-icon">
          <LockKeyhole size={18} />
        </div>
        <div className="manager-card-copy">
          <h2>Manager access</h2>
          <p>Enter the private key created with this game. Spectators can’t change scores.</p>
        </div>
        <form className="key-form" onSubmit={onKeySubmit}>
          <label className="sr-only" htmlFor="manager-key">
            Private manager key
          </label>
          <input
            autoComplete="off"
            id="manager-key"
            onChange={(event) => onKeyChange(event.target.value)}
            placeholder="Paste your manager key"
            spellCheck={false}
            type="password"
            value={keyInput}
          />
          <button className="button button-dark" disabled={verifyingKey || !keyInput} type="submit">
            {verifyingKey ? <span className="spinner spinner-light" /> : 'Unlock'}
          </button>
        </form>
        <p className="key-hint">
          Your key is saved only in this browser/device. <span>Game {code}</span>
        </p>
      </section>
    )
  }

  return (
    <section className="manager-card">
      <div className="manager-card-header">
        <div className="manager-card-icon">
          <Zap size={18} />
        </div>
        <div className="manager-card-copy">
          <h2>Manager Console</h2>
          <p>Control scores, team styles, and game status in real time.</p>
        </div>
        <span className="manager-badge">
          <ShieldCheck size={13} /> MANAGER
        </span>
      </div>

      <div className="manager-share-row">
        <div className="qr-wrap">
          {viewerUrl ? (
            <QRCodeSVG
              bgColor="#ffffff"
              fgColor="#18211e"
              level="M"
              marginSize={1}
              size={256}
              ref={qrRef}
              value={viewerUrl}
            />
          ) : (
            <span className="qr-unavailable">Set VITE_PUBLIC_APP_URL to your deployed website to create shareable links.</span>
          )}
        </div>
        <div className="share-instructions">
          <span className="small-label">{eventShare ? 'EVENT SPECTATOR ACCESS' : 'SINGLE-GAME SPECTATOR ACCESS'}</span>
          <strong>{eventShare ? 'Scan once to follow the event' : 'Scan to watch this game'}</strong>
          <p>{eventShare ? 'This QR opens the permanent event link and follows each game you start.' : 'This QR opens only this game. Use the event dashboard QR to follow a full schedule.'}</p>
          {viewerUrl ? (
            <>
              <code className="share-url-code">{viewerUrl}</code>
              <a className="text-link" href={viewerUrl} target="_blank" rel="noreferrer">
                Open spectator view <ExternalLink size={13} />
              </a>
              <button className="button button-outline download-qr-button" onClick={onDownloadQr} type="button">
                <Download size={14} /> Download QR
              </button>
            </>
          ) : (
            <span className="share-url-warning">Public viewer link unavailable in this APK build.</span>
          )}
        </div>
      </div>

      <div className="manager-actions">
        <div className="manager-actions-left">
          <button
            type="button"
            className="button button-undo"
            onClick={onUndoLastScore}
            disabled={saving}
          >
            <Undo2 size={15} />
            <span>Undo last score</span>
          </button>
          <button
            type="button"
            className="button button-outline"
            onClick={onOpenEditTeams}
            disabled={saving}
          >
            <Palette size={15} />
            <span>Edit teams & colors</span>
          </button>
          <button
            type="button"
            className="button button-outline button-reset-score"
            onClick={onResetScore}
            disabled={saving || (game.home_score === 0 && game.away_score === 0)}
          >
            <RotateCcw size={15} />
            <span>Reset 0-0</span>
          </button>
        </div>

        <button
          className={`button ${game.status === 'LIVE' ? 'button-finish' : 'button-resume'}`}
          disabled={saving || game.status === 'UPCOMING'}
          onClick={() => onStatusChange(game.status === 'LIVE' ? 'FINAL' : 'LIVE')}
          type="button"
        >
          {game.status === 'UPCOMING' ? (
            <>Start from event schedule</>
          ) : game.status === 'LIVE' ? (
            <>
              <Check size={15} /> Finish game
            </>
          ) : (
            <>
              <RotateCcw size={15} /> Resume game
            </>
          )}
        </button>
      </div>

      <div className="manager-security">
        {accountManaged ? (
          <p><ShieldCheck size={13} /> This event is secured by your manager account.</p>
        ) : (
          <>
            <p>
              <LockKeyhole size={13} /> Recovery links contain your private manager key. Never share them with spectators.
            </p>
            <button className="text-link" disabled={!managerKey} onClick={onCopyManagerRecovery} type="button">
              {managerRecoveryCopied ? <Check size={12} /> : <Copy size={12} />}
              {managerRecoveryCopied ? 'Recovery link copied' : 'Save recovery link'}
            </button>
          </>
        )}
      </div>
    </section>
  )
}

function LoadingScreen({ onBack }: { onBack?: () => void }) {
  return (
    <main className="game-page">
      <header className="topbar game-topbar">
        <div className="brand">
          <span className="brand-mark">
            <Activity size={20} strokeWidth={2.5} />
          </span>
          <span>
            scoreline<span className="brand-period">.</span>
          </span>
        </div>
      </header>
      <section className="score-page-content center-panel">
        <div className="loading-card">
          <span className="spinner" />
          <p>Connecting to scoreboard...</p>
          {onBack && (
            <button className="text-link" onClick={onBack} type="button">
              Return to home
            </button>
          )}
        </div>
      </section>
    </main>
  )
}

function UnavailableScreen({ error, onBack }: { error: string; onBack?: () => void }) {
  return (
    <main className="game-page">
      <header className="topbar game-topbar">
        <div className="brand">
          <span className="brand-mark">
            <Activity size={20} strokeWidth={2.5} />
          </span>
          <span>
            scoreline<span className="brand-period">.</span>
          </span>
        </div>
      </header>
      <section className="score-page-content center-panel">
        <div className="unavailable-card">
          <X size={24} className="error-icon" />
          <h2>Game Unavailable</h2>
          <p>{error || 'This game could not be found or has expired.'}</p>
          {onBack && (
            <button className="button button-dark" onClick={onBack} type="button">
              Back to Home
            </button>
          )}
        </div>
      </section>
    </main>
  )
}

export function RootApp() {
  const [path, setPath] = useState(() => window.location.pathname)
  const pathRef = useRef(path)
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(Boolean(supabase))
  const [passwordRecovery, setPasswordRecovery] = useState(false)

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false)
      return
    }

    let active = true
    const client = supabase
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      if (!active) return
      setUser(session?.user ?? null)
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true)
      setAuthLoading(false)
    })
    void client.auth.getSession().then(({ data, error }) => {
      if (!active) return
      if (error) console.error('Could not restore Supabase session:', error.message)
      setUser(data.session?.user ?? null)
      setAuthLoading(false)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (isSpectatorPath(pathRef.current)) {
      window.history.pushState({ scorelineViewer: true }, '', pathRef.current)
    }

    const handlePopState = () => {
      if (isSpectatorPath(pathRef.current)) {
        window.history.pushState({ scorelineViewer: true }, '', pathRef.current)
        return
      }
      pathRef.current = window.location.pathname
      setPath(pathRef.current)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const navigate = useCallback((newPath: string) => {
    const url = new URL(newPath, window.location.origin)
    const nextUrl = `${url.pathname}${url.search}${url.hash}`
    window.history.pushState({}, '', nextUrl)
    pathRef.current = url.pathname
    if (isSpectatorPath(pathRef.current)) {
      window.history.pushState({ scorelineViewer: true }, '', nextUrl)
    }
    setPath(pathRef.current)
  }, [])

  const signOut = useCallback(async () => {
    if (!supabase) return
    const { error } = await supabase.auth.signOut()
    if (error) console.error('Could not sign out:', error.message)
  }, [])

  return (
    <App
      path={path}
      navigate={navigate}
      user={user}
      authLoading={authLoading}
      passwordRecovery={passwordRecovery}
      onPasswordRecoveryComplete={() => setPasswordRecovery(false)}
      onSignOut={() => void signOut()}
    />
  )
}

function isSpectatorPath(path: string) {
  return getGamePath(path)?.mode === 'view' || /^\/e\/[A-Z0-9]{10}\/?$/i.test(path)
}

export default App
