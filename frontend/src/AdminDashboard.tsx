import { type FormEvent, useState } from 'react'
import {
  ApiError,
  createAdminQuestion,
  createAdminSession,
  deleteAdminQuestion,
  deleteAdminSession,
  downloadAdminResults,
  listAdminQuestions,
  listAdminSessions,
  setAdminSessionOpen,
  wipeAdminCollectedData,
} from './api'
import { encodeAxisEndpoints } from './quadrants'
import {
  displayPrompt,
  encodeSliderOnlyPrompt,
  SLIDER_ONLY_SUBTITLE_MAX_LENGTH,
  SLIDER_ONLY_TITLE_MAX_LENGTH,
} from './sliderOnly'
import type { AdminQuestion, AdminSession } from './types'

interface EndpointFields {
  xNegative: string
  xPositive: string
  yNegative: string
  yPositive: string
}

const EMPTY_ENDPOINTS: EndpointFields = {
  xNegative: '',
  xPositive: '',
  yNegative: '',
  yPositive: '',
}

interface EndpointInputsProps {
  language?: string
  value: EndpointFields
  onChange: (value: EndpointFields) => void
  required?: boolean
  sliderOnly?: boolean
}

function EndpointInputs({
  language,
  value,
  onChange,
  required = false,
  sliderOnly = false,
}: EndpointInputsProps) {
  const prefix = language ? `${language} ` : ''
  const update = (field: keyof EndpointFields, nextValue: string) => {
    onChange({ ...value, [field]: nextValue })
  }
  const xRequired = required || Boolean(value.xNegative || value.xPositive)
  const yRequired = required || Boolean(value.yNegative || value.yPositive)
  const labels = sliderOnly
    ? ['First slider — left', 'First slider — right', 'Second slider — left', 'Second slider — right']
    : ['X negative / left', 'X positive / right', 'Y negative / bottom', 'Y positive / top']

  return (
    <>
      <label>{prefix}{labels[0]}
        <input maxLength={90} value={value.xNegative} onChange={(event) => update('xNegative', event.target.value)} required={xRequired} />
      </label>
      <label>{prefix}{labels[1]}
        <input maxLength={90} value={value.xPositive} onChange={(event) => update('xPositive', event.target.value)} required={xRequired} />
      </label>
      <label>{prefix}{labels[2]}
        <input maxLength={90} value={value.yNegative} onChange={(event) => update('yNegative', event.target.value)} required={yRequired} />
      </label>
      <label>{prefix}{labels[3]}
        <input maxLength={90} value={value.yPositive} onChange={(event) => update('yPositive', event.target.value)} required={yRequired} />
      </label>
    </>
  )
}

function QuadrantPreview({ endpoints }: { endpoints: EndpointFields }) {
  if (Object.values(endpoints).some((value) => !value.trim())) return null
  return (
    <div className="admin-quadrant-preview" aria-label="Quadrant preview">
      <span><strong>{endpoints.xNegative}</strong>{endpoints.yPositive}</span>
      <span><strong>{endpoints.xPositive}</strong>{endpoints.yPositive}</span>
      <span><strong>{endpoints.xNegative}</strong>{endpoints.yNegative}</span>
      <span><strong>{endpoints.xPositive}</strong>{endpoints.yNegative}</span>
    </div>
  )
}

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
  const [notice, setNotice] = useState('')
  const [wipeConfirmation, setWipeConfirmation] = useState('')
  const [sessionTitle, setSessionTitle] = useState('')
  const [questionSessionId, setQuestionSessionId] = useState('')
  const [sliderOnly, setSliderOnly] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [endpoints, setEndpoints] = useState<EndpointFields>(EMPTY_ENDPOINTS)
  const [promptDe, setPromptDe] = useState('')
  const [subtitleDe, setSubtitleDe] = useState('')
  const [endpointsDe, setEndpointsDe] = useState<EndpointFields>(EMPTY_ENDPOINTS)
  const [promptIt, setPromptIt] = useState('')
  const [subtitleIt, setSubtitleIt] = useState('')
  const [endpointsIt, setEndpointsIt] = useState<EndpointFields>(EMPTY_ENDPOINTS)

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
    setNotice('')
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
        prompt: sliderOnly ? encodeSliderOnlyPrompt(prompt, subtitle) : prompt,
        x_axis_label: encodeAxisEndpoints(endpoints.xNegative, endpoints.xPositive),
        y_axis_label: encodeAxisEndpoints(endpoints.yNegative, endpoints.yPositive),
        prompt_de: sliderOnly && (promptDe.trim() || subtitleDe.trim())
          ? encodeSliderOnlyPrompt(promptDe, subtitleDe)
          : promptDe.trim() || null,
        x_axis_label_de: encodeAxisEndpoints(endpointsDe.xNegative, endpointsDe.xPositive),
        y_axis_label_de: encodeAxisEndpoints(endpointsDe.yNegative, endpointsDe.yPositive),
        prompt_it: sliderOnly && (promptIt.trim() || subtitleIt.trim())
          ? encodeSliderOnlyPrompt(promptIt, subtitleIt)
          : promptIt.trim() || null,
        x_axis_label_it: encodeAxisEndpoints(endpointsIt.xNegative, endpointsIt.xPositive),
        y_axis_label_it: encodeAxisEndpoints(endpointsIt.yNegative, endpointsIt.yPositive),
      })
      setPrompt('')
      setSubtitle('')
      setEndpoints(EMPTY_ENDPOINTS)
      setPromptDe('')
      setSubtitleDe('')
      setEndpointsDe(EMPTY_ENDPOINTS)
      setPromptIt('')
      setSubtitleIt('')
      setEndpointsIt(EMPTY_ENDPOINTS)
      setSliderOnly(false)
      await refresh()
    })
  }

  const handleDeleteSession = (session: AdminSession) => {
    const warning = `Permanently delete “${session.title}”, its ${session.question_count} question${session.question_count === 1 ? '' : 's'}, and every response collected for them? This cannot be undone.`
    if (!window.confirm(warning)) return
    void runAction(async () => {
      await deleteAdminSession(token, session.id)
      await refresh()
      setNotice(`Deleted session “${session.title}” and its associated data.`)
    })
  }

  const handleDeleteQuestion = (question: AdminQuestion) => {
    const visiblePrompt = displayPrompt(question.prompt)
    const warning = `Permanently delete “${visiblePrompt}” and every response collected for it? This cannot be undone.`
    if (!window.confirm(warning)) return
    void runAction(async () => {
      await deleteAdminQuestion(token, question.id)
      await refresh()
      setNotice(`Deleted question “${visiblePrompt}” and its responses.`)
    })
  }

  const handleWipeCollectedData = () => {
    if (wipeConfirmation !== 'WIPE DATA') return
    if (!window.confirm('Final warning: permanently delete every response and participant UUID? Survey sessions and questions will remain.')) return
    void runAction(async () => {
      const result = await wipeAdminCollectedData(token)
      setWipeConfirmation('')
      setNotice(`Wiped ${result.responses_deleted} responses and ${result.participants_deleted} pseudonymous participants.`)
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
      {notice && <p className="admin-notice" role="status">{notice}</p>}

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
              <div className="admin-session-actions">
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
                <button
                  className="admin-danger-button"
                  type="button"
                  disabled={busy || session.is_open}
                  title={session.is_open ? 'Close this session before deleting it.' : undefined}
                  onClick={() => handleDeleteSession(session)}
                >
                  Delete session
                </button>
              </div>
              <ol>
                {questions
                  .filter((question) => question.session_id === session.id)
                  .sort((left, right) => left.position - right.position)
                  .map((question) => (
                    <li key={question.id}>
                      <span>{displayPrompt(question.prompt)}</span>
                      <button
                        className="admin-danger-button"
                        type="button"
                        disabled={busy || session.is_open}
                        title={session.is_open ? 'Close this session before deleting questions.' : undefined}
                        onClick={() => handleDeleteQuestion(question)}
                      >
                        Delete question
                      </button>
                    </li>
                  ))}
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
            <label className="admin-checkbox">
              <input
                type="checkbox"
                checked={sliderOnly}
                onChange={(event) => setSliderOnly(event.target.checked)}
              />
              Slider-only layout (hide the coordinate plane)
            </label>
            <fieldset className="admin-translation-group">
              <legend>English</legend>
              <label className="admin-wide">{sliderOnly ? 'Title' : 'Question'}<input maxLength={sliderOnly ? SLIDER_ONLY_TITLE_MAX_LENGTH : 1000} value={prompt} onChange={(event) => setPrompt(event.target.value)} required /></label>
              {sliderOnly && (
                <label className="admin-wide">Subtitle<textarea rows={3} maxLength={SLIDER_ONLY_SUBTITLE_MAX_LENGTH} value={subtitle} onChange={(event) => setSubtitle(event.target.value)} required /></label>
              )}
              <EndpointInputs value={endpoints} onChange={setEndpoints} required sliderOnly={sliderOnly} />
              {!sliderOnly && <QuadrantPreview endpoints={endpoints} />}
            </fieldset>
            <fieldset className="admin-translation-group">
              <legend>German</legend>
              <label className="admin-wide">German {sliderOnly ? 'title' : 'question'}<input maxLength={sliderOnly ? SLIDER_ONLY_TITLE_MAX_LENGTH : 1000} value={promptDe} onChange={(event) => setPromptDe(event.target.value)} required={sliderOnly && Boolean(promptDe || subtitleDe)} /></label>
              {sliderOnly && (
                <label className="admin-wide">German subtitle<textarea rows={3} maxLength={SLIDER_ONLY_SUBTITLE_MAX_LENGTH} value={subtitleDe} onChange={(event) => setSubtitleDe(event.target.value)} required={Boolean(promptDe || subtitleDe)} /></label>
              )}
              <EndpointInputs language="German" value={endpointsDe} onChange={setEndpointsDe} sliderOnly={sliderOnly} />
            </fieldset>
            <fieldset className="admin-translation-group">
              <legend>Italian</legend>
              <label className="admin-wide">Italian {sliderOnly ? 'title' : 'question'}<input maxLength={sliderOnly ? SLIDER_ONLY_TITLE_MAX_LENGTH : 1000} value={promptIt} onChange={(event) => setPromptIt(event.target.value)} required={sliderOnly && Boolean(promptIt || subtitleIt)} /></label>
              {sliderOnly && (
                <label className="admin-wide">Italian subtitle<textarea rows={3} maxLength={SLIDER_ONLY_SUBTITLE_MAX_LENGTH} value={subtitleIt} onChange={(event) => setSubtitleIt(event.target.value)} required={Boolean(promptIt || subtitleIt)} /></label>
              )}
              <EndpointInputs language="Italian" value={endpointsIt} onChange={setEndpointsIt} sliderOnly={sliderOnly} />
            </fieldset>
            <button type="submit" disabled={busy}>Add question</button>
          </form>
        )}
      </section>

      <section className="admin-panel admin-danger-zone">
        <p className="eyebrow">Danger zone</p>
        <h2>Wipe collected participant data</h2>
        <p>
          Permanently delete every submitted response and pseudonymous participant UUID.
          Sessions and questions remain. Close every open session first. Export the CSV
          before continuing if you need a backup.
        </p>
        <label>
          Type <strong>WIPE DATA</strong> to confirm
          <input
            value={wipeConfirmation}
            onChange={(event) => setWipeConfirmation(event.target.value)}
            autoComplete="off"
          />
        </label>
        <button
          className="admin-danger-button"
          type="button"
          disabled={busy || wipeConfirmation !== 'WIPE DATA' || sessions.some((session) => session.is_open)}
          onClick={handleWipeCollectedData}
        >
          Permanently wipe collected data
        </button>
        {sessions.some((session) => session.is_open) && (
          <p className="admin-danger-help">Close the open session before wiping data.</p>
        )}
      </section>
    </main>
  )
}
