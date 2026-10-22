import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { User } from '@supabase/supabase-js'
import { ArrowUpRight, CalendarDays, Copy, LogOut, Plus, QrCode, ShieldCheck, X } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { supabase } from './supabase'
import type { GameRow, ScoreboardEventRow } from './database.types'
import { generateCode } from './gameCodes'
import { buildEventSpectatorUrl, getPublicAppUrl } from './publicAppUrl'

interface EventDashboardProps {
  user: User | null
  authLoading: boolean
  passwordRecovery: boolean
  onPasswordRecoveryComplete: () => void
  onSignOut: () => void
  navigate: (path: string) => void
}

export function EventDashboard({ user, authLoading, passwordRecovery, onPasswordRecoveryComplete, onSignOut, navigate }: EventDashboardProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [eventTitle, setEventTitle] = useState('')
  const [events, setEvents] = useState<ScoreboardEventRow[]>([])
  const [loadingEvents, setLoadingEvents] = useState(false)
  const [busy, setBusy] = useState(false)
  const [isSignUp, setIsSignUp] = useState(false)
  const [isPasswordReset, setIsPasswordReset] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const refreshEvents = useCallback(async () => {
    if (!supabase || !user) {
      setEvents([])
      return
    }
    setLoadingEvents(true)
    try {
      const { data, error: fetchError } = await supabase
        .from('scoreboard_events')
        .select('*')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false })
      if (fetchError) setError(`Could not load your events: ${fetchError.message}`)
      else setEvents((data ?? []) as ScoreboardEventRow[])
    } catch (fetchFailure) {
      setError(`Could not load your events: ${fetchFailure instanceof Error ? fetchFailure.message : 'Unexpected network error.'}`)
    } finally {
      setLoadingEvents(false)
    }
  }, [user])

  useEffect(() => {
    void refreshEvents()
  }, [refreshEvents])

  async function signInOrRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      if (isPasswordReset) {
        const { error: authError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin })
        if (authError) throw authError
        setNotice('Password reset email sent. Follow its link to return here and choose a new password.')
      } else if (isSignUp) {
        const { data, error: authError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: window.location.origin },
        })
        if (authError) throw authError
        if (!data.session) setNotice('Check your email to confirm your account, then sign in here.')
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (authError) throw authError
      }
    } catch (authFailure) {
      const action = isPasswordReset ? 'request a password reset' : isSignUp ? 'create account' : 'sign in'
      setError(`Could not ${action}: ${authFailure instanceof Error ? authFailure.message : 'Unexpected authentication error.'}`)
    } finally {
      setBusy(false)
    }
  }

  async function saveNewPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    setBusy(true)
    setError('')
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError
      setPassword('')
      onPasswordRecoveryComplete()
      setNotice('Your password has been updated.')
    } catch (updateFailure) {
      setError(`Could not update password: ${updateFailure instanceof Error ? updateFailure.message : 'Unexpected authentication error.'}`)
    } finally {
      setBusy(false)
    }
  }

  async function createEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !eventTitle.trim()) return
    setBusy(true)
    setError('')
    try {
      const { error: createError } = await supabase.rpc('create_scoreboard_event', {
        p_code: generateCode(),
        p_title: eventTitle.trim(),
      })
      if (createError) throw createError
      setEventTitle('')
      await refreshEvents()
    } catch (createFailure) {
      setError(`Could not create event: ${createFailure instanceof Error ? createFailure.message : 'Unexpected server error.'}`)
    } finally {
      setBusy(false)
    }
  }

  if (authLoading) {
    return (
      <section className="event-dashboard">
        <div className="event-dashboard-loading"><span className="spinner" /> Checking manager account…</div>
      </section>
    )
  }

  if (passwordRecovery) {
    return (
      <section className="event-dashboard">
        <div className="event-dashboard-heading">
          <span className="manager-card-icon"><ShieldCheck size={19} /></span>
          <div><span className="small-label">ACCOUNT RECOVERY</span><h2>Choose a new password</h2><p>Set a new password for your manager account.</p></div>
        </div>
        <form className="event-auth-form" onSubmit={saveNewPassword}>
          <label htmlFor="new-manager-password">NEW PASSWORD</label>
          <input id="new-manager-password" autoComplete="new-password" minLength={8} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
          <button className="button button-primary" disabled={busy} type="submit">{busy ? <span className="spinner" /> : 'Save new password'}<ArrowUpRight size={16} /></button>
        </form>
        {error && <p className="event-feedback event-feedback-error" role="alert"><X size={14} />{error}</p>}
      </section>
    )
  }

  if (!user) {
    return (
      <section className="event-dashboard">
        <div className="event-dashboard-heading">
          <span className="manager-card-icon"><ShieldCheck size={19} /></span>
          <div>
            <span className="small-label">FOR EVENT MANAGERS</span>
            <h2>Manage a season with one QR</h2>
            <p>Sign in to schedule multiple games. Spectators scan once and follow the active game.</p>
          </div>
        </div>
        <form className="event-auth-form" onSubmit={signInOrRegister}>
          <label htmlFor="manager-email">EMAIL</label>
          <input id="manager-email" autoComplete="email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
          {!isPasswordReset && (
            <>
              <label htmlFor="manager-password">PASSWORD</label>
              <input id="manager-password" autoComplete={isSignUp ? 'new-password' : 'current-password'} minLength={8} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
            </>
          )}
          <button className="button button-primary" disabled={busy || !supabase} type="submit">
            {busy ? <span className="spinner" /> : isPasswordReset ? 'Send password reset email' : isSignUp ? 'Create manager account' : 'Sign in'}
            {!busy && <ArrowUpRight size={16} />}
          </button>
        </form>
        {error && <p className="event-feedback event-feedback-error" role="alert"><X size={14} />{error}</p>}
        {notice && <p className="event-feedback">{notice}</p>}
        {!isSignUp && !isPasswordReset && <button className="event-auth-toggle" onClick={() => { setIsPasswordReset(true); setError(''); setNotice('') }} type="button">Forgot password?</button>}
        <button className="event-auth-toggle" onClick={() => { setIsSignUp(!isSignUp); setIsPasswordReset(false); setError(''); setNotice('') }} type="button">
          {isSignUp ? 'Already have an account? Sign in' : isPasswordReset ? 'Back to sign in' : 'New manager? Create an account'}
        </button>
        {!supabase && <p className="event-feedback event-feedback-error">Configure Supabase before creating a manager account.</p>}
      </section>
    )
  }

  return (
    <section className="event-dashboard">
      <div className="event-dashboard-heading">
        <span className="manager-card-icon"><CalendarDays size={19} /></span>
        <div>
          <span className="small-label">MANAGER ACCOUNT</span>
          <h2>Your events</h2>
          <p>One permanent spectator QR for each event. Start the next match when it is time.</p>
        </div>
        <button className="button button-outline event-signout" onClick={onSignOut} type="button"><LogOut size={15} /> Sign out</button>
      </div>
      <form className="event-create-form" onSubmit={createEvent}>
        <label className="sr-only" htmlFor="new-event-title">Event name</label>
        <input id="new-event-title" maxLength={48} onChange={(event) => setEventTitle(event.target.value)} placeholder="Event or season name" required value={eventTitle} />
        <button className="button button-primary" disabled={busy} type="submit">
          {busy ? <span className="spinner" /> : <><Plus size={16} /> Create event</>}
        </button>
      </form>
      {error && <p className="event-feedback event-feedback-error" role="alert"><X size={14} />{error}</p>}
      {loadingEvents ? (
        <div className="event-dashboard-loading"><span className="spinner" /> Loading your events…</div>
      ) : events.length === 0 ? (
        <p className="event-empty">Create an event to schedule your first game and get its shareable QR.</p>
      ) : (
        <div className="event-list">
          {events.map((item) => (
            <button className="event-list-card" key={item.id} onClick={() => navigate(`/event/${item.code}`)} type="button">
              <span className="event-list-icon"><CalendarDays size={17} /></span>
              <span className="event-list-copy"><strong>{item.title}</strong><small>Event code {item.code}</small></span>
              <ArrowUpRight size={17} />
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

interface EventManagerScreenProps {
  code: string
  user: User | null
  authLoading: boolean
  navigate: (path: string) => void
}

export function EventManagerScreen({ code, user, authLoading, navigate }: EventManagerScreenProps) {
  const [event, setEvent] = useState<ScoreboardEventRow | null>(null)
  const [games, setGames] = useState<GameRow[]>([])
  const [homeTeam, setHomeTeam] = useState('')
  const [awayTeam, setAwayTeam] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)

  const refresh = useCallback(async () => {
    if (!supabase) {
      setError('Supabase is not configured. Add the project URL and publishable key to the app environment.')
      setLoading(false)
      return
    }
    if (!user) {
      setLoading(false)
      return
    }
    try {
      const { data: eventData, error: eventError } = await supabase
        .from('scoreboard_events')
        .select('*')
        .eq('code', code)
        .eq('owner_id', user.id)
        .maybeSingle()
      if (eventError) {
        setError(`Could not load event: ${eventError.message}`)
        return
      }
      if (!eventData) {
        setError('Event not found for this account.')
        setEvent(null)
        setGames([])
        return
      }
      setEvent(eventData as ScoreboardEventRow)
      const { data: gameData, error: gamesError } = await supabase
        .from('games')
        .select('*')
        .eq('event_id', eventData.id)
        .order('queue_order', { ascending: true })
      if (gamesError) setError(`Could not load scheduled games: ${gamesError.message}`)
      else {
        setGames((gameData ?? []) as GameRow[])
        setError('')
      }
    } catch (fetchFailure) {
      setError(`Could not load event: ${fetchFailure instanceof Error ? fetchFailure.message : 'Unexpected network error.'}`)
    } finally {
      setLoading(false)
    }
  }, [code, user])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!supabase || !event) return
    const client = supabase
    const channel = client
      .channel(`scoreline-event-manager-${event.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scoreboard_events', filter: `id=eq.${event.id}` }, () => { void refresh() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `event_id=eq.${event.id}` }, () => { void refresh() })
      .subscribe()
    return () => { void client.removeChannel(channel) }
  }, [event, refresh])

  async function addGame(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault()
    if (!supabase || !event) return
    setSaving(true)
    setError('')
    try {
      const gameCode = generateCode()
      const { error: createError } = await supabase.rpc('create_event_game', {
        p_event_code: event.code,
        p_code: gameCode,
        p_home_team: homeTeam.trim(),
        p_away_team: awayTeam.trim(),
        p_home_color: '#2563eb',
        p_away_color: '#dc2626',
        p_home_logo: '🏀',
        p_away_logo: '⚡',
      })
      if (createError) throw createError
      setHomeTeam('')
      setAwayTeam('')
      await refresh()
    } catch (createFailure) {
      setError(`Could not add game: ${createFailure instanceof Error ? createFailure.message : 'Unexpected server error.'}`)
    } finally {
      setSaving(false)
    }
  }

  async function startGame(game: GameRow) {
    if (!supabase || !event) return
    setSaving(true)
    setError('')
    try {
      const { error: startError } = await supabase.rpc('start_event_game', {
        p_event_code: event.code,
        p_game_id: game.id,
      })
      if (startError) {
        setError(`Could not start game: ${startError.message}`)
      } else {
        navigate(`/event/${event.code}/game/${game.code}`)
      }
    } catch (startFailure) {
      setError(`Could not start game: ${startFailure instanceof Error ? startFailure.message : 'Unexpected network error.'}`)
    } finally {
      setSaving(false)
    }
  }

  async function copySpectatorLink() {
    const base = getPublicAppUrl()
    if (!base) {
      setError('Set VITE_PUBLIC_APP_URL to your deployed website URL, then restart Vite to generate a shareable event QR.')
      return
    }
    try {
      const url = buildEventSpectatorUrl(base, code)
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setError('The public app URL is invalid or could not be copied. Check VITE_PUBLIC_APP_URL.')
    }
  }

  if (authLoading || loading) return <main className="game-page"><section className="score-page-content"><div className="loading-card"><span className="spinner" /><p>Loading event…</p></div></section></main>
  if (!user) return <main className="game-page"><section className="score-page-content"><div className="unavailable-card"><h2>Manager sign-in required</h2><p>Sign in with the account that created this event.</p><button className="button button-dark" onClick={() => navigate('/')} type="button">Back to Scoreline</button></div></section></main>
  if (!event) return <main className="game-page"><section className="score-page-content"><div className="unavailable-card"><h2>Event unavailable</h2><p>{error}</p><button className="button button-dark" onClick={() => navigate('/')} type="button">Back to Scoreline</button></div></section></main>

  const currentGame = games.find((game) => game.id === event.current_game_id) ?? null
  const publicBase = getPublicAppUrl()
  const spectatorUrl = publicBase ? buildEventSpectatorUrl(publicBase, event.code) : ''

  return (
    <main className="game-page">
      <header className="topbar game-topbar">
        <button className="back-link" onClick={() => navigate('/')} type="button">← My events</button>
        <div className="connection-state is-connected"><ShieldCheck size={14} /> MANAGER ACCOUNT</div>
      </header>
      <section className="score-page-content event-manager-content">
        <div className="game-context">
          <div className="eyebrow"><span className="eyebrow-dot" /> EVENT DASHBOARD · {event.code}</div>
          <h1>{event.title}</h1>
          <p>Schedule each matchup once. Start games when they are ready; the same spectator QR follows the active scoreboard.</p>
        </div>

        <section className="event-share-card">
          <div className="event-qr-wrap">
            {spectatorUrl ? <QRCodeSVG bgColor="#ffffff" fgColor="#18211e" level="M" marginSize={1} size={118} value={spectatorUrl} /> : <QrCode size={34} />}
          </div>
          <div className="event-share-copy">
            <span className="small-label">ONE PERMANENT SPECTATOR QR</span>
            <h2>Share once. It follows every game.</h2>
            <p>Keep this event QR the same. Viewers who scan it see the current game and stay on this event as you start the next one.</p>
            {spectatorUrl ? <code>{spectatorUrl}</code> : <span className="share-url-warning">Set VITE_PUBLIC_APP_URL to your deployed site URL, then restart the dev server.</span>}
            <button className="button button-outline" disabled={!spectatorUrl} onClick={() => void copySpectatorLink()} type="button">
              <Copy size={14} /> {copied ? 'Event link copied' : 'Copy spectator link'}
            </button>
          </div>
        </section>

        {currentGame && (
          <section className="event-current-game">
            <div>
              <span className={`recent-game-status ${currentGame.status === 'FINAL' ? 'is-final' : ''}`}><span />{currentGame.status === 'LIVE' ? 'CURRENT GAME · LIVE' : 'LAST GAME · FINAL'}</span>
              <h2>{currentGame.home_team} <span>{currentGame.home_score} — {currentGame.away_score}</span> {currentGame.away_team}</h2>
            </div>
            <button className="button button-dark" onClick={() => navigate(`/event/${event.code}/game/${currentGame.code}`)} type="button">Open scoreboard</button>
          </section>
        )}

        <section className="event-schedule-card">
          <div className="event-section-heading"><div><span className="small-label">MATCHUPS</span><h2>Game schedule</h2></div><span>{games.length} {games.length === 1 ? 'GAME' : 'GAMES'}</span></div>
          <form className="event-match-form" onSubmit={addGame}>
            <label className="sr-only" htmlFor="event-home-team">Home team</label>
            <input id="event-home-team" maxLength={24} onChange={(e) => setHomeTeam(e.target.value)} placeholder="Home team" required value={homeTeam} />
            <span className="event-match-vs">VS</span>
            <label className="sr-only" htmlFor="event-away-team">Away team</label>
            <input id="event-away-team" maxLength={24} onChange={(e) => setAwayTeam(e.target.value)} placeholder="Away team" required value={awayTeam} />
            <button className="button button-primary" disabled={saving} type="submit">{saving ? <span className="spinner" /> : <><Plus size={15} /> Add game</>}</button>
          </form>
          {error && <p className="event-feedback event-feedback-error" role="alert"><X size={14} />{error}</p>}
          {games.length === 0 ? <p className="event-empty">Add the first matchup to prepare the event schedule.</p> : (
            <ol className="event-game-list">
              {games.map((game, index) => {
                const canStart = game.status === 'UPCOMING' && (!currentGame || currentGame.status === 'FINAL')
                return (
                  <li className="event-game-row" key={game.id}>
                    <span className="event-game-number">{String(index + 1).padStart(2, '0')}</span>
                    <span className="event-game-names"><strong>{game.home_team}</strong><span>vs</span><strong>{game.away_team}</strong><small>{game.status === 'UPCOMING' ? 'UP NEXT' : game.status === 'LIVE' ? 'LIVE NOW' : `${game.home_score} — ${game.away_score} · FINAL`}</small></span>
                    {canStart ? <button className="button button-primary" disabled={saving} onClick={() => void startGame(game)} type="button">Start game</button> : game.status !== 'UPCOMING' ? <button className="button button-outline" onClick={() => navigate(`/event/${event.code}/game/${game.code}`)} type="button">Open</button> : <span className="event-queued-label">QUEUED</span>}
                  </li>
                )
              })}
            </ol>
          )}
        </section>
      </section>
    </main>
  )
}
