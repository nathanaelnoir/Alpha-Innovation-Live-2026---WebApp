import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminDashboard } from './AdminDashboard'
import {
  createAdminQuestion,
  createAdminSession,
  downloadAdminResults,
  listAdminQuestions,
  listAdminSessions,
  setAdminSessionOpen,
} from './api'
import type { AdminSession } from './types'

vi.mock('./api', async (importOriginal) => {
  const original = await importOriginal<typeof import('./api')>()
  return {
    ...original,
    createAdminQuestion: vi.fn(),
    createAdminSession: vi.fn(),
    downloadAdminResults: vi.fn(),
    listAdminQuestions: vi.fn(),
    listAdminSessions: vi.fn(),
    setAdminSessionOpen: vi.fn(),
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
  question_count: 0,
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
        is_active: true,
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
      x_axis_label: 'Energy',
      y_axis_label: null,
      is_active: false,
    })
    render(<AdminDashboard />)
    await userEvent.type(screen.getByLabelText('Organizer token'), 'organizer-secret')
    await userEvent.click(screen.getByRole('button', { name: 'Open dashboard' }))
    await screen.findByLabelText('Question')

    await userEvent.type(screen.getByLabelText('Question'), 'What changed?')
    await userEvent.type(screen.getByLabelText('X-axis label'), 'Energy')
    await userEvent.click(screen.getByRole('button', { name: 'Add question' }))

    await waitFor(() => {
      expect(createAdminQuestion).toHaveBeenCalledWith('organizer-secret', {
        session_id: closedSession.id,
        prompt: 'What changed?',
        x_axis_label: 'Energy',
        y_axis_label: null,
      })
    })
    expect(createAdminSession).not.toHaveBeenCalled()
    expect(downloadAdminResults).not.toHaveBeenCalled()
  })
})
