import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, createParticipant, getActiveSession, submitResponse } from './api'
import { ArtworkBrand } from './ArtworkBrand'
import { CoordinatePlane } from './CoordinatePlane'
import {
  clearParticipantIdentity,
  loadParticipantIdentity,
  saveParticipantIdentity,
} from './identity'
import {
  copy,
  languages,
  loadLanguage,
  localizeQuestion,
  saveLanguage,
  type Language,
} from './i18n'
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
type MessageKey = '' | 'loadError' | 'responseError'

interface LoadSurveyOptions {
  showLoading?: boolean
  emptyFeedbackMs?: number
}

const ACTIVE_POLL_INTERVAL_MS = 5_000
const WAITING_POLL_INTERVAL_MS = 15_000
const POLL_JITTER_MS = 2_000
const MANUAL_EMPTY_FEEDBACK_MS = 3_000
const MINIMUM_LOADING_FEEDBACK_MS = 600

async function waitForMinimumLoadingFeedback(
  startedAt: number,
  signal: AbortSignal,
) {
  const remaining = MINIMUM_LOADING_FEEDBACK_MS - (performance.now() - startedAt)
  if (remaining <= 0 || signal.aborted) return
  await new Promise<void>((resolve) => {
    const handleAbort = () => {
      window.clearTimeout(timer)
      resolve()
    }
    const timer = window.setTimeout(() => {
      signal.removeEventListener('abort', handleAbort)
      resolve()
    }, remaining)
    signal.addEventListener('abort', handleAbort, { once: true })
  })
}

function readableAxisLabel(label: string | null, fallback: string): string {
  return label?.replace(/\s*\([^)]*\)/g, '').trim() || fallback
}

export default function App() {
  const loadingPreview = new URLSearchParams(window.location.search).get('preview') === 'loading'
  const [language, setLanguage] = useState<Language>(() => loadLanguage())
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [surveySession, setSurveySession] = useState<ActiveSurveySession | null>(null)
  const [question, setQuestion] = useState<ActiveQuestion | null>(null)
  const [identity, setIdentity] = useState<ParticipantIdentity | null>(() =>
    loadParticipantIdentity(),
  )
  const [coordinate, setCoordinate] = useState<Coordinate | null>(null)
  const [submitState, setSubmitState] = useState<SubmitState>('idle')
  const [message, setMessage] = useState<MessageKey>('')
  const identityRef = useRef(identity)
  const sessionRef = useRef<ActiveSurveySession | null>(null)
  const questionRef = useRef<ActiveQuestion | null>(null)
  const loadControllerRef = useRef<AbortController | null>(null)
  const submitControllerRef = useRef<AbortController | null>(null)
  const emptyFeedbackTimerRef = useRef<number | undefined>(undefined)

  const loadSurvey = useCallback(async (options: LoadSurveyOptions = {}) => {
    const { showLoading = true, emptyFeedbackMs = 0 } = options
    const loadingStartedAt = performance.now()
    loadControllerRef.current?.abort()
    window.clearTimeout(emptyFeedbackTimerRef.current)
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
      if (showLoading) {
        await waitForMinimumLoadingFeedback(loadingStartedAt, controller.signal)
        if (controller.signal.aborted) return
      }
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
        if (emptyFeedbackMs > 0) {
          setLoadState('loading')
          setMessage('')
          emptyFeedbackTimerRef.current = window.setTimeout(() => {
            setLoadState('empty')
          }, emptyFeedbackMs)
        } else {
          setLoadState('empty')
        }
      } else if (showLoading) {
        setMessage('loadError')
        setLoadState('error')
      }
    }
  }, [])

  useEffect(() => {
    if (loadingPreview) return
    void loadSurvey()
    return () => {
      loadControllerRef.current?.abort()
      window.clearTimeout(emptyFeedbackTimerRef.current)
    }
  }, [loadSurvey, loadingPreview])

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
        void loadSurvey({ showLoading: false }).finally(schedulePoll)
      }, delay)
    }

    const handleVisibilityChange = () => {
      window.clearTimeout(timer)
      if (document.visibilityState === 'visible') {
        void loadSurvey({ showLoading: false }).finally(schedulePoll)
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

  useEffect(() => {
    document.documentElement.lang = language
    saveLanguage(language)
  }, [language])

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
      if (error instanceof ApiError && error.code === 'participant_not_found') {
        clearParticipantIdentity()
        identityRef.current = null
        setIdentity(null)
        await loadSurvey({ showLoading: false })
      }
      setSubmitState('error')
      setMessage('responseError')
    }
  }

  const text = copy[language]
  const localizedQuestion = question ? localizeQuestion(question, language) : null
  const localizedMessage = message ? text[message] : ''

  const selectLanguage = (nextLanguage: Language) => {
    setLanguage(nextLanguage)
  }

  return (
    <main className="app-shell">
      <div className="signal-field" aria-hidden="true">
        <span>10010100101101001011001001110100101100100110101100101</span>
        <span>00110101001011010011101001001101010100110100100101110</span>
        <span>10100100110100101101001001011010100110100111001001001</span>
      </div>
      <header className="site-header">
        <ArtworkBrand />
        <div className="header-data" aria-hidden="true">
          <span>SYSTEM/01</span><span>INPUT/XY</span><span>RANGE/0—1</span>
        </div>
        <div className="header-controls">
          <div className="language-switch" role="group" aria-label={text.languageSelector}>
            {languages.map((item) => (
              <button
                key={item}
                type="button"
                className={item === language ? 'language-switch__button language-switch__button--active' : 'language-switch__button'}
                aria-pressed={item === language}
                onClick={() => selectLanguage(item)}
              >
                {item.toUpperCase()}
              </button>
            ))}
          </div>
          <span className="privacy-note"><i /> {text.privacyStatus}</span>
        </div>
      </header>

      <section
        className={`survey-card${loadState === 'loading' ? ' survey-card--loading' : ''}${loadState === 'ready' && question ? ' survey-card--question' : ''}${loadState === 'completed' ? ' survey-card--completed' : ''}`}
        aria-live="polite"
      >
        {loadState === 'loading' && (
          <div className="center-state center-state--loading">
            <ResponseStream
              coordinate={{ x: 0.5, y: 0.5 }}
              flow="vertical"
              showAccent={false}
              className="loading-stream"
              testId="loading-stream"
            />
            <span className="loading-label">{text.loadingIndicator}</span>
            <span className="visually-hidden" role="status">
              {text.loadingTitle} {text.loadingBody}
            </span>
          </div>
        )}

        {loadState === 'empty' && (
          <div className="center-state center-state--waiting">
            <WaitingParticles />
            <div className="waiting-content">
              <p className="eyebrow">{text.waitingEyebrow}</p>
              <h1>{text.waitingTitle}</h1>
              <p>{text.waitingBody}</p>
              <button
                className="secondary-button"
                type="button"
                onClick={() =>
                  void loadSurvey({
                    showLoading: false,
                    emptyFeedbackMs: MANUAL_EMPTY_FEEDBACK_MS,
                  })
                }
              >
                {text.checkAgain}
              </button>
            </div>
          </div>
        )}

        {loadState === 'error' && (
          <div className="center-state">
            <span className="state-icon">!</span>
            <p className="eyebrow">{text.connectionEyebrow}</p>
            <h1>{text.connectionTitle}</h1>
            <p>{localizedMessage}</p>
            <button className="secondary-button" type="button" onClick={() => void loadSurvey()}>
              {text.tryAgain}
            </button>
          </div>
        )}

        {loadState === 'completed' && surveySession && (
          <div className="completion-screen">
            <div className="completion-heading">
              <h1>{text.completionTitle}</h1>
              <p>{text.completionBody(surveySession.title)}</p>
            </div>

            <div className="completion-visual">
              <ResponseStream coordinate={{ x: 0.5, y: 0.5 }} />
            </div>

            <div className="completion-actions">
              <div className="completion-status">
                <span className="completion-status__key">
                  <i className="completion-status__swatch completion-status__swatch--others" />
                  {text.completionOthers}
                </span>
                <span className="completion-status__key">
                  <i className="completion-status__swatch completion-status__swatch--yours" />
                  {text.completionYours}
                </span>
                <span className="completion-status__label">{text.completionStatus}</span>
              </div>
              <p className="fine-print">{text.completionNote}</p>
            </div>
          </div>
        )}

        {loadState === 'ready' && question && surveySession && (
          <div className="survey-content">
            <div className="question-heading">
              <div className="question-index" aria-hidden="true">
                <span>Q/{question.position}</span>
                <span>{String(surveySession.questions.length).padStart(4, '0')}</span>
              </div>
              <h1>{localizedQuestion?.prompt}</h1>
              {/* <p className="instruction">TAP OR DRAG ON THE FIELD · ADJUST BEFORE TRANSMISSION</p> */}
            </div>

            <div
              className={`position-readout${coordinate ? ' position-readout--active' : ''}`}
              aria-live="polite"
              aria-label={text.currentPosition}
            >
              <span className="position-readout__label">{text.livePosition}</span>
              <output className="position-readout__value">
                <span className="position-readout__axis-item">
                  {readableAxisLabel(localizedQuestion?.xAxisLabel ?? null, text.horizontal)}
                </span>
                <span className="position-readout__arrow" aria-hidden="true">→</span>
                <span className="position-readout__axis-item">
                  {coordinate ? `${Math.round(coordinate.x * 100)}%` : '---'}
                </span>
                <span className="position-readout__separator" aria-hidden="true">·</span>
                <span className="position-readout__axis-item">
                  {readableAxisLabel(localizedQuestion?.yAxisLabel ?? null, text.vertical)}
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
              xAxisLabel={localizedQuestion?.xAxisLabel ?? null}
              yAxisLabel={localizedQuestion?.yAxisLabel ?? null}
              disabled={submitState === 'submitting'}
              text={text.coordinatePlane}
            />

            <div className="submission-area">
              {(submitState === 'submitting' || submitState === 'error') && (
                <div className={`status-message status-message--${submitState}`} role="status">
                  {submitState === 'submitting' ? text.saving : localizedMessage}
                </div>
              )}
              <button
                className="submit-button"
                type="button"
                disabled={!coordinate || submitState === 'submitting'}
                onClick={() => void handleSubmit()}
              >
                {submitState === 'submitting' ? text.sending : submitState === 'error' ? text.retrySending : text.sendResponse}
              </button>
              <p className="fine-print">{text.privacyNote}</p>
            </div>
            <div className="data-footer" aria-hidden="true">
              <span>{text.identityFooter}</span>
              <span>{text.signalFooter}</span>
              <span>{text.readyFooter}</span>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}
