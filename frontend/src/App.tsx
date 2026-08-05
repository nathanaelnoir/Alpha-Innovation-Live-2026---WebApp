import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, createParticipant, getActiveSession, submitResponse } from './api'
import { CoordinatePlane } from './CoordinatePlane'
import { loadParticipantIdentity, saveParticipantIdentity } from './identity'
import { loadCompletedQuestions, markQuestionCompleted } from './sessionProgress'
import { ResponseStream } from './ResponseStream'
import { WaitingParticles } from './WaitingParticles'
import type {
  ActiveQuestion,
  ActiveSurveySession,
  Coordinate,
  ParticipantIdentity,
} from './types'

type LoadState = 'loading' | 'ready' | 'completed' | 'empty' | 'error'
type SubmitState = 'idle' | 'selected' | 'submitting' | 'error'

const ACTIVE_POLL_INTERVAL_MS = 5_000
const WAITING_POLL_INTERVAL_MS = 15_000
const POLL_JITTER_MS = 2_000

function friendlyError(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : 'Something went wrong. Please try again.'
}

function readableAxisLabel(label: string | null, fallback: string): string {
  return label?.replace(/\s*\([^)]*\)/g, '').trim() || fallback
}

export default function App() {
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [surveySession, setSurveySession] = useState<ActiveSurveySession | null>(null)
  const [question, setQuestion] = useState<ActiveQuestion | null>(null)
  const [identity, setIdentity] = useState<ParticipantIdentity | null>(() =>
    loadParticipantIdentity(),
  )
  const [coordinate, setCoordinate] = useState<Coordinate | null>(null)
  const [submitState, setSubmitState] = useState<SubmitState>('idle')
  const [message, setMessage] = useState('')
  const identityRef = useRef(identity)
  const sessionRef = useRef<ActiveSurveySession | null>(null)
  const questionRef = useRef<ActiveQuestion | null>(null)
  const loadControllerRef = useRef<AbortController | null>(null)
  const submitControllerRef = useRef<AbortController | null>(null)

  const loadSurvey = useCallback(async (showLoading = true) => {
    loadControllerRef.current?.abort()
    const controller = new AbortController()
    loadControllerRef.current = controller
    if (showLoading) {
      setLoadState('loading')
      setMessage('')
    }

    try {
      let participant = identityRef.current
      if (!participant) {
        participant = await createParticipant(controller.signal)
        if (controller.signal.aborted) return
        saveParticipantIdentity(participant)
        identityRef.current = participant
        setIdentity(participant)
      }

      const activeSession = await getActiveSession(controller.signal)
      if (controller.signal.aborted) return
      const completed = new Set(loadCompletedQuestions(activeSession.run_id))
      const nextQuestion = activeSession.questions.find(
        (candidate) => !completed.has(candidate.id),
      ) ?? null
      if (
        sessionRef.current?.id !== activeSession.id ||
        questionRef.current?.id !== nextQuestion?.id
      ) {
        setCoordinate(null)
        setSubmitState('idle')
        setMessage('')
      }
      sessionRef.current = activeSession
      questionRef.current = nextQuestion
      setSurveySession(activeSession)
      setQuestion(nextQuestion)
      setLoadState(nextQuestion ? 'ready' : 'completed')
    } catch (error) {
      if (controller.signal.aborted) return
      if (error instanceof ApiError && error.code === 'active_session_not_found') {
        if (questionRef.current !== null) {
          setCoordinate(null)
          setSubmitState('idle')
          setMessage('')
        }
        questionRef.current = null
        sessionRef.current = null
        setSurveySession(null)
        setQuestion(null)
        setLoadState('empty')
      } else if (showLoading) {
        setMessage(friendlyError(error))
        setLoadState('error')
      }
    }
  }, [])

  useEffect(() => {
    void loadSurvey()
    return () => loadControllerRef.current?.abort()
  }, [loadSurvey])

  useEffect(() => {
    if (loadState !== 'ready' && loadState !== 'completed' && loadState !== 'empty') return

    let stopped = false
    let timer: number | undefined

    const schedulePoll = () => {
      if (stopped || document.visibilityState === 'hidden') return
      const interval = questionRef.current
        ? ACTIVE_POLL_INTERVAL_MS
        : WAITING_POLL_INTERVAL_MS
      const delay = interval + Math.floor(Math.random() * POLL_JITTER_MS)
      timer = window.setTimeout(() => {
        void loadSurvey(false).finally(schedulePoll)
      }, delay)
    }

    const handleVisibilityChange = () => {
      window.clearTimeout(timer)
      if (document.visibilityState === 'visible') {
        void loadSurvey(false).finally(schedulePoll)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    schedulePoll()
    return () => {
      stopped = true
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [loadState, loadSurvey])

  useEffect(() => () => submitControllerRef.current?.abort(), [])

  const handleCoordinateChange = (next: Coordinate) => {
    setCoordinate(next)
    setSubmitState('selected')
    setMessage('')
  }

  const handleSubmit = async () => {
    if (!question || !coordinate || !identity || submitState === 'submitting') return

    const controller = new AbortController()
    submitControllerRef.current = controller
    setSubmitState('submitting')
    setMessage('')
    try {
      await submitResponse(
        question.id,
        coordinate,
        identity.participantToken,
        controller.signal,
      )
      if (controller.signal.aborted) return
      if (!surveySession) return
      const completed = new Set(
        markQuestionCompleted(surveySession.run_id, question.id),
      )
      const nextQuestion = surveySession.questions.find(
        (candidate) => !completed.has(candidate.id),
      ) ?? null
      setCoordinate(nextQuestion ? null : coordinate)
      setSubmitState('idle')
      setMessage('')
      questionRef.current = nextQuestion
      setQuestion(nextQuestion)
      setLoadState(nextQuestion ? 'ready' : 'completed')
    } catch (error) {
      if (controller.signal.aborted) return
      setSubmitState('error')
      setMessage(friendlyError(error))
    }
  }

  return (
    <main className="app-shell">
      <div className="signal-field" aria-hidden="true">
        <span>10010100101101001011001001110100101100100110101100101</span>
        <span>00110101001011010011101001001101010100110100100101110</span>
        <span>10100100110100101101001001011010100110100111001001001</span>
      </div>
      <header className="site-header">
        <a className="brand" href="/" aria-label="Alpha Innovation Live 2026 home">
          <span>ALPHA INNOVATION LIVE 2026</span>
        </a>
        <div className="header-data" aria-hidden="true">
          <span>SYSTEM/01</span><span>INPUT/XY</span><span>RANGE/0—1</span>
        </div>
        <span className="privacy-note"><i /> ANONYMOUS / ACTIVE</span>
      </header>

      <section
        className={`survey-card${loadState === 'ready' && question ? ' survey-card--question' : ''}`}
        aria-live="polite"
      >
        {loadState === 'loading' && (
          <div className="center-state">
            <span className="loader" aria-hidden="true" />
            <h1>Getting the question…</h1>
            <p>This should only take a moment.</p>
          </div>
        )}

        {loadState === 'empty' && (
          <div className="center-state center-state--waiting">
            <WaitingParticles />
            <div className="waiting-content">
              <p className="eyebrow">Session pulse</p>
              <h1>Waiting for the next session</h1>
              <p>Keep this page open. The next session will appear automatically.</p>
              <button className="secondary-button" type="button" onClick={() => void loadSurvey()}>
                Check again
              </button>
            </div>
          </div>
        )}

        {loadState === 'error' && (
          <div className="center-state">
            <span className="state-icon">!</span>
            <p className="eyebrow">Connection interrupted</p>
            <h1>We couldn’t load the survey</h1>
            <p>{message}</p>
            <button className="secondary-button" type="button" onClick={() => void loadSurvey()}>
              Try again
            </button>
          </div>
        )}

        {loadState === 'completed' && surveySession && (
          <div className="completion-screen">
            <div className="completion-heading">
              <h1>Data transmission completed</h1>
              <p>All responses for {surveySession.title} have been securely recorded.</p>
            </div>

            <div className="completion-visual">
              <ResponseStream coordinate={{ x: 0.5, y: 0.5 }} />
            </div>

            <div className="completion-actions">
              <p className="completion-status"><i /> COMPLETED</p>
              <p className="fine-print">Please keep this page open until the organizer closes the session.</p>
            </div>
          </div>
        )}

        {loadState === 'ready' && question && surveySession && (
          <div className="survey-content">
            <div className="question-signal-line" data-testid="question-signal-line" aria-hidden="true" />
            <div className="question-heading">
              <div className="question-index" aria-hidden="true">
                <span>Q/{question.position}</span>
                <span>{String(surveySession.questions.length).padStart(4, '0')}</span>
              </div>
              <h1>{question.prompt}</h1>
              {/* <p className="instruction">TAP OR DRAG ON THE FIELD · ADJUST BEFORE TRANSMISSION</p> */}
            </div>

            <div
              className={`position-readout${coordinate ? ' position-readout--active' : ''}`}
              aria-live="polite"
              aria-label="Current coordinate position"
            >
              <span className="position-readout__label">LIVE POSITION</span>
              <output className="position-readout__value">
                <span className="position-readout__axis-item">
                  {readableAxisLabel(question.x_axis_label, 'Horizontal')}
                </span>
                <span className="position-readout__arrow" aria-hidden="true">→</span>
                <span className="position-readout__axis-item">
                  {coordinate ? `${Math.round(coordinate.x * 100)}%` : '---'}
                </span>
                <span className="position-readout__separator" aria-hidden="true">·</span>
                <span className="position-readout__axis-item">
                  {readableAxisLabel(question.y_axis_label, 'Vertical')}
                </span>
                <span className="position-readout__arrow" aria-hidden="true">↑</span>
                <span className="position-readout__axis-item">
                  {coordinate ? `${Math.round(coordinate.y * 100)}%` : '---'}
                </span>
              </output>
            </div>

            <CoordinatePlane
              value={coordinate}
              onChange={handleCoordinateChange}
              xAxisLabel={question.x_axis_label}
              yAxisLabel={question.y_axis_label}
              disabled={submitState === 'submitting'}
            />

            <div className="submission-area">
              {(submitState === 'submitting' || submitState === 'error') && (
                <div className={`status-message status-message--${submitState}`} role="status">
                  {submitState === 'submitting' ? 'Saving your response…' : message}
                </div>
              )}
              <button
                className="submit-button"
                type="button"
                disabled={!coordinate || submitState === 'submitting'}
                onClick={() => void handleSubmit()}
              >
                {submitState === 'submitting' ? 'Sending…' : submitState === 'error' ? 'Try sending again' : 'Send response'}
              </button>
              <p className="fine-print">No name or contact details are collected.</p>
            </div>
            <div className="data-footer" aria-hidden="true">
              <span>UUID // ENCRYPTED TOKEN</span>
              <span>NORMALIZED SIGNAL [0.000000—1.000000]</span>
              <span>SYS.READY</span>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}
