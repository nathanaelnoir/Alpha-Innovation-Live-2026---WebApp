import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminDashboard } from './AdminDashboard'
import {
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
import type { AdminSession } from './types'
import { encodeSliderOnlyPrompt } from './sliderOnly'

vi.mock('./api', async (importOriginal) => {
  const original = await importOriginal<typeof import('./api')>()
  return {
    ...original,
    createAdminQuestion: vi.fn(),
    createAdminSession: vi.fn(),
    deleteAdminQuestion: vi.fn(),
    deleteAdminSession: vi.fn(),
    downloadAdminResults: vi.fn(),
    listAdminQuestions: vi.fn(),
    listAdminSessions: vi.fn(),
    setAdminSessionOpen: vi.fn(),
    wipeAdminCollectedData: vi.fn(),
  }
})

const openSession: AdminSession = {
  id: 'session-open',
  current_run_id: 'run-1',
  title: 'Opening keynote',
  is_open: true,
  question_count: 1,
  created_at: '2026-08-05T12:00:00Z',
  opened_at: '2026-08-05T12:30:00Z',
  closed_at: null,
}

const closedSession: AdminSession = {
  ...openSession,
  id: 'session-closed',
  title: 'Closing session',
  is_open: false,
  question_count: 1,
  opened_at: null,
}

describe('AdminDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listAdminSessions).mockResolvedValue([openSession, closedSession])
    vi.mocked(listAdminQuestions).mockResolvedValue([
      {
        id: 'question-1',
        session_id: openSession.id,
        position: 1,
        prompt: 'How are you feeling?',
        x_axis_label: 'Energy',
        y_axis_label: 'Focus',
        prompt_de: null,
        x_axis_label_de: null,
        y_axis_label_de: null,
        prompt_it: null,
        x_axis_label_it: null,
        y_axis_label_it: null,
        is_active: true,
      },
      {
        id: 'question-closed',
        session_id: closedSession.id,
        position: 1,
        prompt: 'What changed?',
        x_axis_label: null,
        y_axis_label: null,
        prompt_de: null,
        x_axis_label_de: null,
        y_axis_label_de: null,
        prompt_it: null,
        x_axis_label_it: null,
        y_axis_label_it: null,
        is_active: false,
      },
    ])
  })

  it('keeps the organizer token in memory and controls sessions', async () => {
    render(<AdminDashboard />)
    const tokenInput = screen.getByLabelText('Organizer token')
    await userEvent.type(tokenInput, 'organizer-secret')
    await userEvent.click(screen.getByRole('button', { name: 'Open dashboard' }))

    expect(await screen.findByText('Opening keynote')).toBeInTheDocument()
    expect(screen.getByText('How are you feeling?')).toBeInTheDocument()
    expect(window.localStorage.length).toBe(0)

    vi.mocked(setAdminSessionOpen).mockResolvedValue({
      ...openSession,
      is_open: false,
    })
    await userEvent.click(screen.getByRole('button', { name: 'Close session' }))
    await waitFor(() => {
      expect(setAdminSessionOpen).toHaveBeenCalledWith(
        'organizer-secret',
        openSession.id,
        false,
      )
    })
  })

  it('creates an ordered question in a closed session', async () => {
    vi.mocked(createAdminQuestion).mockResolvedValue({
      id: 'question-2',
      session_id: closedSession.id,
      position: 1,
      prompt: 'What changed?',
      x_axis_label: 'Low energy ↔ High energy',
      y_axis_label: 'Low focus ↔ High focus',
      prompt_de: null,
      x_axis_label_de: null,
      y_axis_label_de: null,
      prompt_it: null,
      x_axis_label_it: null,
      y_axis_label_it: null,
      is_active: false,
    })
    render(<AdminDashboard />)
    await userEvent.type(screen.getByLabelText('Organizer token'), 'organizer-secret')
    await userEvent.click(screen.getByRole('button', { name: 'Open dashboard' }))
    await screen.findByLabelText('Question')

    await userEvent.type(screen.getByLabelText('Question'), 'What changed?')
    await userEvent.type(screen.getByLabelText('X negative / left'), 'Internal processes')
    await userEvent.type(screen.getByLabelText('X positive / right'), 'Products and services')
    await userEvent.type(screen.getByLabelText('Y negative / bottom'), 'Human-driven decisions')
    await userEvent.type(screen.getByLabelText('Y positive / top'), 'AI-based decisions')
    await userEvent.type(screen.getByLabelText('German question'), 'Was hat sich verändert?')
    await userEvent.type(screen.getByLabelText('German X negative / left'), 'Interne Prozesse')
    await userEvent.type(screen.getByLabelText('German X positive / right'), 'Produkte und Dienste')
    await userEvent.type(screen.getByLabelText('German Y negative / bottom'), 'Menschlich entschieden')
    await userEvent.type(screen.getByLabelText('German Y positive / top'), 'KI-basiert entschieden')
    await userEvent.type(screen.getByLabelText('Italian question'), 'Che cosa è cambiato?')
    await userEvent.type(screen.getByLabelText('Italian X negative / left'), 'Processi interni')
    await userEvent.type(screen.getByLabelText('Italian X positive / right'), 'Prodotti e servizi')
    await userEvent.type(screen.getByLabelText('Italian Y negative / bottom'), 'Decisioni umane')
    await userEvent.type(screen.getByLabelText('Italian Y positive / top'), 'Decisioni basate su IA')
    expect(screen.getByLabelText('Quadrant preview')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Add question' }))

    await waitFor(() => {
      expect(createAdminQuestion).toHaveBeenCalledWith('organizer-secret', {
        session_id: closedSession.id,
        prompt: 'What changed?',
        x_axis_label: 'Internal processes ↔ Products and services',
        y_axis_label: 'Human-driven decisions ↔ AI-based decisions',
        prompt_de: 'Was hat sich verändert?',
        x_axis_label_de: 'Interne Prozesse ↔ Produkte und Dienste',
        y_axis_label_de: 'Menschlich entschieden ↔ KI-basiert entschieden',
        prompt_it: 'Che cosa è cambiato?',
        x_axis_label_it: 'Processi interni ↔ Prodotti e servizi',
        y_axis_label_it: 'Decisioni umane ↔ Decisioni basate su IA',
      })
    })
    expect(createAdminSession).not.toHaveBeenCalled()
    expect(downloadAdminResults).not.toHaveBeenCalled()
  })

  it('creates a slider-only question using the existing prompt and axis fields', async () => {
    vi.mocked(createAdminQuestion).mockResolvedValue({
      id: 'question-slider',
      session_id: closedSession.id,
      position: 1,
      prompt: encodeSliderOnlyPrompt('Decision making', 'Choose where responsibility belongs.'),
      x_axis_label: 'Internal processes ↔ Products and services',
      y_axis_label: 'Human-driven ↔ AI-based',
      prompt_de: null,
      x_axis_label_de: null,
      y_axis_label_de: null,
      prompt_it: null,
      x_axis_label_it: null,
      y_axis_label_it: null,
      is_active: false,
    })
    render(<AdminDashboard />)
    await userEvent.type(screen.getByLabelText('Organizer token'), 'organizer-secret')
    await userEvent.click(screen.getByRole('button', { name: 'Open dashboard' }))
    await userEvent.click(
      screen.getByLabelText('Slider-only layout (hide the coordinate plane)'),
    )

    await userEvent.type(screen.getByLabelText('Title'), 'Decision making')
    await userEvent.type(
      screen.getByLabelText('Subtitle'),
      'Choose where responsibility belongs.',
    )
    await userEvent.type(screen.getByLabelText('First slider — left'), 'Internal processes')
    await userEvent.type(screen.getByLabelText('First slider — right'), 'Products and services')
    await userEvent.type(screen.getByLabelText('Second slider — left'), 'Human-driven')
    await userEvent.type(screen.getByLabelText('Second slider — right'), 'AI-based')
    await userEvent.click(screen.getByRole('button', { name: 'Add question' }))

    await waitFor(() => {
      expect(createAdminQuestion).toHaveBeenCalledWith('organizer-secret', {
        session_id: closedSession.id,
        prompt: encodeSliderOnlyPrompt(
          'Decision making',
          'Choose where responsibility belongs.',
        ),
        x_axis_label: 'Internal processes ↔ Products and services',
        y_axis_label: 'Human-driven ↔ AI-based',
        prompt_de: null,
        x_axis_label_de: null,
        y_axis_label_de: null,
        prompt_it: null,
        x_axis_label_it: null,
        y_axis_label_it: null,
      })
    })
  })

  it('warns before deleting closed questions and sessions', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<AdminDashboard />)
    await userEvent.type(screen.getByLabelText('Organizer token'), 'organizer-secret')
    await userEvent.click(screen.getByRole('button', { name: 'Open dashboard' }))

    const closedQuestion = await screen.findByText('What changed?')
    await userEvent.click(
      within(closedQuestion.closest('li')!).getByRole('button', {
        name: 'Delete question',
      }),
    )
    await waitFor(() => {
      expect(deleteAdminQuestion).toHaveBeenCalledWith(
        'organizer-secret',
        'question-closed',
      )
    })
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('cannot be undone'))

    const closedSessionCard = screen
      .getByText('Closing session', { selector: 'strong' })
      .closest('article')!
    await userEvent.click(
      within(closedSessionCard).getByRole('button', { name: 'Delete session' }),
    )
    await waitFor(() => {
      expect(deleteAdminSession).toHaveBeenCalledWith(
        'organizer-secret',
        closedSession.id,
      )
    })
    confirm.mockRestore()
  })

  it('requires typed and final confirmation before wiping collected data', async () => {
    vi.mocked(listAdminSessions).mockResolvedValue([closedSession])
    vi.mocked(listAdminQuestions).mockResolvedValue([])
    vi.mocked(wipeAdminCollectedData).mockResolvedValue({
      responses_deleted: 14,
      participants_deleted: 9,
    })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<AdminDashboard />)
    await userEvent.type(screen.getByLabelText('Organizer token'), 'organizer-secret')
    await userEvent.click(screen.getByRole('button', { name: 'Open dashboard' }))

    const wipeButton = await screen.findByRole('button', {
      name: 'Permanently wipe collected data',
    })
    expect(wipeButton).toBeDisabled()
    await userEvent.type(
      screen.getByLabelText(/Type WIPE DATA to confirm/),
      'WIPE DATA',
    )
    expect(wipeButton).toBeEnabled()
    await userEvent.click(wipeButton)

    await waitFor(() => {
      expect(wipeAdminCollectedData).toHaveBeenCalledWith('organizer-secret')
    })
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Wiped 14 responses and 9 pseudonymous participants.',
    )
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Final warning'))
    confirm.mockRestore()
  })
})
