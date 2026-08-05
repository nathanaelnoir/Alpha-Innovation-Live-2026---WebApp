import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { ApiError, createParticipant, getActiveSession, submitResponse } from './api'
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
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
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

  it('creates and persists a pseudonymous participant while loading the session', async () => {
    await renderReadyApp()
    expect(screen.getByTestId('question-signal-line')).toBeInTheDocument()
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
    expect(screen.queryByText('Data transmission completed')).not.toBeInTheDocument()

    await act(async () => pending.resolve(accepted))
    expect(
      await screen.findByRole('heading', { name: 'Data transmission completed' }),
    ).toBeInTheDocument()
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
    expect(screen.queryByText('Data transmission completed')).not.toBeInTheDocument()

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
      await screen.findByText('The response could not be saved. Please try again.'),
    ).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Try sending again' }))
    expect(
      await screen.findByRole('heading', { name: 'Data transmission completed' }),
    ).toBeInTheDocument()
    expect(mockedSubmitResponse).toHaveBeenCalledTimes(2)
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

    mockedGetActiveSession.mockResolvedValueOnce(surveySession)
    await userEvent.click(screen.getByRole('button', { name: 'Check again' }))
    expect(await screen.findByRole('heading', { name: question.prompt })).toBeInTheDocument()
  })
})
