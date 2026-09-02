import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { ApiError, createParticipant, getActiveSession, submitResponse } from './api'
import { encodeSliderOnlyPrompt } from './sliderOnly'
import type { ActiveSurveySession, ResponseAccepted } from './types'

vi.mock('./api', async (importOriginal) => {
  const original = await importOriginal<typeof import('./api')>()
  return {
    ...original,
    createParticipant: vi.fn(),
    getActiveSession: vi.fn(),
    submitResponse: vi.fn(),
  }
})

const mockedCreateParticipant = vi.mocked(createParticipant)
const mockedGetActiveSession = vi.mocked(getActiveSession)
const mockedSubmitResponse = vi.mocked(submitResponse)

const question = {
  id: 'question-1',
  position: 1,
  prompt: 'How are you experiencing this session right now?',
  x_axis_label: 'Engagement (low to high)',
  y_axis_label: 'Understanding (low to high)',
  prompt_de: 'Wie erleben Sie diese Sitzung gerade?',
  x_axis_label_de: 'Engagement (niedrig bis hoch)',
  y_axis_label_de: 'Verständnis (niedrig bis hoch)',
  prompt_it: 'Come sta vivendo questa sessione in questo momento?',
  x_axis_label_it: 'Coinvolgimento (basso-alto)',
  y_axis_label_it: 'Comprensione (bassa-alta)',
}
const surveySession: ActiveSurveySession = {
  id: 'session-1',
  run_id: 'run-1',
  title: 'Opening session',
  questions: [question],
}
const participant = { participantId: 'participant-1', participantToken: 'signed-token' }
const accepted: ResponseAccepted = {
  response_id: 'response-1',
  question_id: question.id,
  x: 0.5,
  y: 0.5,
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

async function renderReadyApp(activeSession = surveySession) {
  mockedCreateParticipant.mockResolvedValue(participant)
  mockedGetActiveSession.mockResolvedValue(activeSession)
  render(<App />)
  const currentQuestion = activeSession.questions[0]
  if (!currentQuestion) throw new Error('Test session requires a question')
  await screen.findByRole('heading', { name: currentQuestion.prompt })
  const surface = screen.getByTestId('coordinate-surface')
  vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 200,
    height: 200,
    right: 200,
    bottom: 200,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  })
  return surface
}

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
  })

  it('shows the minimal monochrome stream while loading', () => {
    mockedCreateParticipant.mockReturnValue(new Promise(() => undefined))

    render(<App />)

    expect(screen.getByTestId('loading-stream')).toBeInTheDocument()
    expect(screen.getByText('LOADING…')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading the question… This will only take a moment.',
    )
    expect(screen.queryByRole('heading', { name: 'Loading the question…' })).not.toBeInTheDocument()
  })

  it('keeps loading feedback visible for a perceptible minimum duration', async () => {
    vi.useFakeTimers()
    try {
      mockedCreateParticipant.mockResolvedValue(participant)
      mockedGetActiveSession.mockResolvedValue(surveySession)

      render(<App />)
      await act(async () => undefined)

      expect(screen.getByTestId('loading-stream')).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: question.prompt })).not.toBeInTheDocument()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(600)
      })
      expect(screen.getByRole('heading', { name: question.prompt })).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('creates and persists a pseudonymous participant while loading the session', async () => {
    await renderReadyApp()
    expect(screen.queryByTestId('question-signal-line')).not.toBeInTheDocument()
    expect(mockedCreateParticipant).toHaveBeenCalledOnce()
    expect(mockedGetActiveSession).toHaveBeenCalledOnce()
    expect(window.localStorage.getItem('conference-survey-participant-v1')).toContain(
      'signed-token',
    )
  })

  it('disables duplicate submission and completes only after server confirmation', async () => {
    const surface = await renderReadyApp()
    fireEvent.pointerDown(surface, { pointerId: 1, clientX: 100, clientY: 100 })

    const pending = deferred<ResponseAccepted>()
    mockedSubmitResponse.mockReturnValue(pending.promise)
    const sendButton = screen.getByRole('button', { name: 'Send response' })
    await userEvent.click(sendButton)

    expect(sendButton).toBeDisabled()
    expect(screen.getByText('Saving your response…')).toBeInTheDocument()
    expect(screen.queryByText('All responses submitted')).not.toBeInTheDocument()

    await act(async () => pending.resolve(accepted))
    const completionHeading = await screen.findByRole('heading', {
      name: 'All responses submitted',
    })
    expect(completionHeading).toBeInTheDocument()
    expect(completionHeading.closest('.survey-card')).toHaveClass('survey-card--completed')
    expect(screen.getByText('OTHER RESPONSES')).toBeInTheDocument()
    expect(screen.getByText('YOUR RESPONSE')).toBeInTheDocument()
    expect(screen.getByText('COMPLETED')).toBeInTheDocument()
    expect(screen.getByText(/Opening session/)).toBeInTheDocument()
    expect(window.localStorage.getItem('conference-survey-session-progress-v1')).toContain(
      question.id,
    )
  })

  it('advances each browser through ordered questions and stores local progress', async () => {
    const secondQuestion = {
      ...question,
      id: 'question-2',
      position: 2,
      prompt: 'What changed during the keynote?',
    }
    const twoQuestionSession = {
      ...surveySession,
      questions: [question, secondQuestion],
    }
    const surface = await renderReadyApp(twoQuestionSession)
    fireEvent.pointerDown(surface, { pointerId: 1, clientX: 100, clientY: 100 })
    mockedSubmitResponse.mockResolvedValue(accepted)

    await userEvent.click(screen.getByRole('button', { name: 'Send response' }))

    expect(
      await screen.findByRole('heading', { name: secondQuestion.prompt }),
    ).toBeInTheDocument()
    expect(screen.queryByText('All responses submitted')).not.toBeInTheDocument()

    const storedProgress = window.localStorage.getItem(
      'conference-survey-session-progress-v1',
    )
    expect(storedProgress).toContain(question.id)
    expect(storedProgress).not.toContain(secondQuestion.id)
  })

  it('keeps the selected point and allows a failed submission to be retried', async () => {
    const surface = await renderReadyApp()
    fireEvent.pointerDown(surface, { pointerId: 1, clientX: 50, clientY: 150 })
    mockedSubmitResponse
      .mockRejectedValueOnce(
        new ApiError('The response could not be saved. Please try again.', 503),
      )
      .mockResolvedValueOnce({ ...accepted, x: 0.25, y: 0.25 })

    await userEvent.click(screen.getByRole('button', { name: 'Send response' }))
    expect(
      await screen.findByText('Your response could not be saved. Please try again.'),
    ).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Try sending again' }))
    expect(
      await screen.findByRole('heading', { name: 'All responses submitted' }),
    ).toBeInTheDocument()
    expect(mockedSubmitResponse).toHaveBeenCalledTimes(2)
  })

  it('replaces a wiped participant identity before retrying', async () => {
    const surface = await renderReadyApp()
    fireEvent.pointerDown(surface, { pointerId: 1, clientX: 50, clientY: 150 })
    const replacement = {
      participantId: 'participant-2',
      participantToken: 'replacement-token',
    }
    mockedCreateParticipant.mockResolvedValue(replacement)
    mockedSubmitResponse
      .mockRejectedValueOnce(
        new ApiError(
          'The participant token is no longer valid.',
          401,
          'participant_not_found',
        ),
      )
      .mockResolvedValueOnce({ ...accepted, x: 0.25, y: 0.25 })

    await userEvent.click(screen.getByRole('button', { name: 'Send response' }))
    expect(
      await screen.findByText('Your response could not be saved. Please try again.'),
    ).toBeInTheDocument()
    expect(mockedCreateParticipant).toHaveBeenCalledTimes(2)
    expect(window.localStorage.getItem('conference-survey-participant-v1')).toContain(
      'replacement-token',
    )

    await userEvent.click(screen.getByRole('button', { name: 'Try sending again' }))
    expect(mockedSubmitResponse).toHaveBeenLastCalledWith(
      question.id,
      { x: 0.25, y: 0.25 },
      'replacement-token',
      expect.any(AbortSignal),
    )
  })

  it('waits when no session is open and can retry', async () => {
    mockedCreateParticipant.mockResolvedValue(participant)
    mockedGetActiveSession.mockRejectedValueOnce(
      new ApiError('There is no open session right now.', 404, 'active_session_not_found'),
    )
    render(<App />)
    expect(
      await screen.findByRole('heading', { name: 'Waiting for the next session' }),
    ).toBeInTheDocument()

    const refresh = deferred<ActiveSurveySession>()
    mockedGetActiveSession.mockReturnValueOnce(refresh.promise)
    await userEvent.click(screen.getByRole('button', { name: 'Check again' }))

    expect(
      screen.getByRole('heading', { name: 'Waiting for the next session' }),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('loading-stream')).not.toBeInTheDocument()

    await act(async () => refresh.resolve(surveySession))
    expect(await screen.findByRole('heading', { name: question.prompt })).toBeInTheDocument()
  })

  it('shows three seconds of loading feedback when a manual check finds no session', async () => {
    mockedCreateParticipant.mockResolvedValue(participant)
    mockedGetActiveSession.mockRejectedValueOnce(
      new ApiError('There is no open session right now.', 404, 'active_session_not_found'),
    )
    render(<App />)
    expect(
      await screen.findByRole('heading', { name: 'Waiting for the next session' }),
    ).toBeInTheDocument()

    const refresh = deferred<ActiveSurveySession>()
    mockedGetActiveSession.mockReturnValueOnce(refresh.promise)
    vi.useFakeTimers()
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Check again' }))
      await act(async () =>
        refresh.reject(
          new ApiError(
            'There is no open session right now.',
            404,
            'active_session_not_found',
          ),
        ),
      )

      expect(screen.getByTestId('loading-stream')).toBeInTheDocument()
      act(() => vi.advanceTimersByTime(2_999))
      expect(screen.getByTestId('loading-stream')).toBeInTheDocument()
      act(() => vi.advanceTimersByTime(1))
      expect(
        screen.getByRole('heading', { name: 'Waiting for the next session' }),
      ).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows semantic balance meters instead of technical coordinates', async () => {
    const quadrantQuestion = {
      ...question,
      x_axis_label: 'Internal processes ↔ Products and services',
      y_axis_label: 'Human-driven decisions ↔ AI-based decisions',
    }
    const surface = await renderReadyApp({
      ...surveySession,
      questions: [quadrantQuestion],
    })

    const horizontal = screen.getByTestId('balance-meter-horizontal')
    const vertical = screen.getByTestId('balance-meter-vertical')
    expect(horizontal).toHaveTextContent('Internal processes')
    expect(horizontal).toHaveTextContent('Products and services')
    expect(vertical).toHaveTextContent('Human-driven decisions')
    expect(vertical).toHaveTextContent('AI-based decisions')
    expect(
      screen.getByText('Move the sliders or choose a position directly in the coordinate system.'),
    ).toBeInTheDocument()
    expect(horizontal.querySelector('.balance-meter__marker')).not.toBeInTheDocument()

    vi.spyOn(horizontal, 'getBoundingClientRect').mockReturnValue({
      left: 10,
      top: 0,
      width: 200,
      height: 30,
      right: 210,
      bottom: 30,
      x: 10,
      y: 0,
      toJSON: () => ({}),
    })
    fireEvent.pointerDown(horizontal, { pointerId: 2, clientX: 160 })

    expect(horizontal.querySelector('.balance-meter__marker')).toHaveStyle({ left: '75%' })
    expect(vertical.querySelector('.balance-meter__marker')).toHaveStyle({ left: '50%' })

    fireEvent.pointerDown(surface, { pointerId: 1, clientX: 50, clientY: 50 })

    expect(horizontal.querySelector('.balance-meter__marker')).toHaveStyle({ left: '25%' })
    expect(vertical.querySelector('.balance-meter__marker')).toHaveStyle({ left: '75%' })
    expect(screen.queryByText('X 25% · Y 75%')).not.toBeInTheDocument()

    fireEvent.keyDown(horizontal, { key: 'ArrowRight' })
    expect(horizontal).toHaveAttribute('aria-valuenow', '27')
  })

  it('renders a focused slider-only question and submits the same coordinates', async () => {
    const sliderQuestion = {
      ...question,
      prompt: encodeSliderOnlyPrompt(
        'Who should make these decisions?',
        'Decision making',
        'Choose where responsibility should sit for this situation.',
        'Degree of automation',
        'Choose how strongly technology should influence the decision.',
      ),
      x_axis_label: 'Internal processes ↔ Products and services',
      y_axis_label: 'Human-driven decisions ↔ AI-based decisions',
    }
    mockedCreateParticipant.mockResolvedValue(participant)
    mockedGetActiveSession.mockResolvedValue({
      ...surveySession,
      questions: [sliderQuestion],
    })
    mockedSubmitResponse.mockResolvedValue({
      ...accepted,
      question_id: sliderQuestion.id,
      x: 0.75,
      y: 0.25,
    })
    render(<App />)

    expect(
      await screen.findByRole('heading', { name: 'Who should make these decisions?' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Decision making' })).toBeInTheDocument()
    expect(
      screen.getByText('Choose where responsibility should sit for this situation.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Degree of automation' })).toBeInTheDocument()
    expect(
      screen.getByText('Choose how strongly technology should influence the decision.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Balanced')).not.toBeInTheDocument()
    expect(screen.queryByTestId('coordinate-surface')).not.toBeInTheDocument()

    const bounds = {
      left: 0,
      top: 0,
      width: 200,
      height: 40,
      right: 200,
      bottom: 40,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }
    const horizontal = screen.getByTestId('balance-meter-horizontal')
    const vertical = screen.getByTestId('balance-meter-vertical')
    vi.spyOn(horizontal, 'getBoundingClientRect').mockReturnValue(bounds)
    vi.spyOn(vertical, 'getBoundingClientRect').mockReturnValue(bounds)
    fireEvent.pointerDown(horizontal, { pointerId: 3, clientX: 150 })
    fireEvent.pointerDown(vertical, { pointerId: 4, clientX: 50 })
    await userEvent.click(screen.getByRole('button', { name: 'Send response' }))

    expect(mockedSubmitResponse).toHaveBeenCalledWith(
      sliderQuestion.id,
      { x: 0.75, y: 0.25 },
      participant.participantToken,
      expect.any(AbortSignal),
    )
  })

  it('switches question, labels, interface text, and language preference', async () => {
    await renderReadyApp()

    await userEvent.click(screen.getByRole('button', { name: 'DE' }))

    expect(
      await screen.findByRole('heading', { name: question.prompt_de }),
    ).toBeInTheDocument()
    expect(screen.getByText('Verständnis')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Antwort senden' })).toBeInTheDocument()
    expect(screen.getByText('Es werden weder Namen noch Kontaktdaten erfasst.')).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('de')
    expect(window.localStorage.getItem('conference-survey-language-v1')).toBe('de')

    await userEvent.click(screen.getByRole('button', { name: 'IT' }))
    expect(
      await screen.findByRole('heading', { name: question.prompt_it }),
    ).toBeInTheDocument()
    expect(screen.getByText('Comprensione')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Invia risposta' })).toBeInTheDocument()
  })
})
