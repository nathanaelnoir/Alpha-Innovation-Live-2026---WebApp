import { type FormEvent, useState } from 'react'
import {
  ApiError,
  createAdminQuestion,
  createAdminSession,
  downloadAdminResults,
  listAdminQuestions,
  listAdminSessions,
  setAdminSessionOpen,
} from './api'
import type { AdminQuestion, AdminSession } from './types'

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'The request failed. Please try again.'
}

export function AdminDashboard() {
  const [token, setToken] = useState('')
  const [sessions, setSessions] = useState<AdminSession[]>([])
  const [questions, setQuestions] = useState<AdminQuestion[]>([])
  const [authenticated, setAuthenticated] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [sessionTitle, setSessionTitle] = useState('')
  const [questionSessionId, setQuestionSessionId] = useState('')
  const [prompt, setPrompt] = useState('')
  const [xLabel, setXLabel] = useState('')
  const [yLabel, setYLabel] = useState('')

  const refresh = async (organizerToken = token) => {
    const [nextSessions, nextQuestions] = await Promise.all([
      listAdminSessions(organizerToken),
      listAdminQuestions(organizerToken),
    ])
    setSessions(nextSessions)
    setQuestions(nextQuestions)
    setQuestionSessionId((current) => {
      if (nextSessions.some((session) => session.id === current && !session.is_open)) {
        return current
      }
      return nextSessions.find((session) => !session.is_open)?.id ?? ''
    })
  }

  const runAction = async (action: () => Promise<void>) => {
    setBusy(true)
    setMessage('')
    try {
      await action()
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const handleLogin = (event: FormEvent) => {
    event.preventDefault()
    void runAction(async () => {
      await refresh(token)
      setAuthenticated(true)
    })
  }

  const handleCreateSession = (event: FormEvent) => {
    event.preventDefault()
    void runAction(async () => {
      const created = await createAdminSession(token, sessionTitle)
      setSessionTitle('')
      await refresh()
      setQuestionSessionId(created.id)
    })
  }

  const handleCreateQuestion = (event: FormEvent) => {
    event.preventDefault()
    void runAction(async () => {
      await createAdminQuestion(token, {
        session_id: questionSessionId,
        prompt,
        x_axis_label: xLabel.trim() || null,
        y_axis_label: yLabel.trim() || null,
      })
      setPrompt('')
      setXLabel('')
      setYLabel('')
      await refresh()
    })
  }

  if (!authenticated) {
    return (
      <main className="admin-shell">
        <form className="admin-login" onSubmit={handleLogin}>
          <p className="eyebrow">Organizer access</p>
          <h1>Survey dashboard</h1>
          <p>The token stays in this browser tab and is never saved locally.</p>
          <label>
            Organizer token
            <input
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              autoComplete="off"
              required
            />
          </label>
          {message && <p className="admin-error" role="alert">{message}</p>}
          <button className="submit-button" type="submit" disabled={busy}>
            {busy ? 'Checking…' : 'Open dashboard'}
          </button>
          <a className="admin-link" href="/">Return to participant survey</a>
        </form>
      </main>
    )
  }

  const closedSessions = sessions.filter((session) => !session.is_open)

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div><p className="eyebrow">Organizer</p><h1>Survey dashboard</h1></div>
        <div className="admin-header-actions">
          <button type="button" onClick={() => void runAction(() => refresh())} disabled={busy}>Refresh</button>
          <button type="button" onClick={() => void runAction(() => downloadAdminResults(token))} disabled={busy}>Download CSV</button>
          <a href="/">Participant view</a>
        </div>
      </header>

      {message && <p className="admin-error" role="alert">{message}</p>}

      <section className="admin-panel">
        <h2>Sessions</h2>
        <div className="admin-session-list">
          {sessions.map((session) => (
            <article className="admin-session" key={session.id}>
              <div>
                <strong>{session.title}</strong>
                <span>{session.question_count} question{session.question_count === 1 ? '' : 's'}</span>
              </div>
              <span className={session.is_open ? 'admin-status admin-status--open' : 'admin-status'}>
                {session.is_open ? 'Open' : 'Closed'}
              </span>
              <button
                type="button"
                disabled={busy || (!session.is_open && session.question_count === 0)}
                onClick={() => void runAction(async () => {
                  await setAdminSessionOpen(token, session.id, !session.is_open)
                  await refresh()
                })}
              >
                {session.is_open ? 'Close session' : 'Open session'}
              </button>
              <ol>
                {questions
                  .filter((question) => question.session_id === session.id)
                  .sort((left, right) => left.position - right.position)
                  .map((question) => <li key={question.id}>{question.prompt}</li>)}
              </ol>
            </article>
          ))}
        </div>

        <form className="admin-inline-form" onSubmit={handleCreateSession}>
          <label>New session title<input value={sessionTitle} onChange={(event) => setSessionTitle(event.target.value)} required /></label>
          <button type="submit" disabled={busy}>Create session</button>
        </form>
      </section>

      <section className="admin-panel">
        <h2>Add an ordered question</h2>
        {closedSessions.length === 0 ? (
          <p>Close or create a session before adding questions.</p>
        ) : (
          <form className="admin-question-form" onSubmit={handleCreateQuestion}>
            <label>Session<select value={questionSessionId} onChange={(event) => setQuestionSessionId(event.target.value)} required>
              {closedSessions.map((session) => <option key={session.id} value={session.id}>{session.title}</option>)}
            </select></label>
            <label className="admin-wide">Question<input value={prompt} onChange={(event) => setPrompt(event.target.value)} required /></label>
            <label>X-axis label<input value={xLabel} onChange={(event) => setXLabel(event.target.value)} /></label>
            <label>Y-axis label<input value={yLabel} onChange={(event) => setYLabel(event.target.value)} /></label>
            <button type="submit" disabled={busy}>Add question</button>
          </form>
        )}
      </section>
    </main>
  )
}
