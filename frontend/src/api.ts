import type {
  ActiveSurveySession,
  AdminQuestion,
  AdminSession,
  CollectedDataWipeResult,
  Coordinate,
  ParticipantIdentity,
  ResponseAccepted,
} from './types'

interface ApiErrorBody {
  error?: {
    code?: string
    message?: string
  }
}

interface ParticipantCreatedBody {
  participant_id: string
  participant_token: string
}

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000').replace(
  /\/$/,
  '',
)

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function fetchApi(path: string, init?: RequestInit): Promise<Response> {
  let response: Response
  try {
    response = await fetch(`${apiBaseUrl}${path}`, init)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError('We could not reach the survey. Check your connection and try again.', 0)
  }

  if (!response.ok) {
    let body: ApiErrorBody | undefined
    try {
      body = (await response.json()) as ApiErrorBody
    } catch {
      body = undefined
    }
    throw new ApiError(
      body?.error?.message ?? 'Something went wrong. Please try again.',
      response.status,
      body?.error?.code,
    )
  }

  return response
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetchApi(path, init)
  return (await response.json()) as T
}

function organizerHeaders(token: string, json = false): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    ...(json ? { 'Content-Type': 'application/json' } : {}),
  }
}

export async function createParticipant(signal?: AbortSignal): Promise<ParticipantIdentity> {
  const body = await request<ParticipantCreatedBody>('/api/v1/participants', {
    method: 'POST',
    signal,
  })
  return {
    participantId: body.participant_id,
    participantToken: body.participant_token,
  }
}

export function getActiveSession(signal?: AbortSignal): Promise<ActiveSurveySession> {
  return request<ActiveSurveySession>('/api/v1/sessions/active', { signal })
}

export function submitResponse(
  questionId: string,
  coordinate: Coordinate,
  participantToken: string,
  signal?: AbortSignal,
): Promise<ResponseAccepted> {
  return request<ResponseAccepted>(`/api/v1/questions/${questionId}/response`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${participantToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(coordinate),
    signal,
  })
}

export function listAdminSessions(token: string): Promise<AdminSession[]> {
  return request<AdminSession[]>('/api/v1/sessions', {
    headers: organizerHeaders(token),
  })
}

export function listAdminQuestions(token: string): Promise<AdminQuestion[]> {
  return request<AdminQuestion[]>('/api/v1/questions', {
    headers: organizerHeaders(token),
  })
}

export function createAdminSession(
  token: string,
  title: string,
): Promise<AdminSession> {
  return request<AdminSession>('/api/v1/sessions', {
    method: 'POST',
    headers: organizerHeaders(token, true),
    body: JSON.stringify({ title }),
  })
}

export function setAdminSessionOpen(
  token: string,
  sessionId: string,
  open: boolean,
): Promise<AdminSession> {
  return request<AdminSession>(
    `/api/v1/sessions/${sessionId}/${open ? 'open' : 'close'}`,
    { method: 'PUT', headers: organizerHeaders(token) },
  )
}

export async function deleteAdminSession(
  token: string,
  sessionId: string,
): Promise<void> {
  await fetchApi(`/api/v1/sessions/${sessionId}`, {
    method: 'DELETE',
    headers: organizerHeaders(token),
  })
}

export async function deleteAdminQuestion(
  token: string,
  questionId: string,
): Promise<void> {
  await fetchApi(`/api/v1/questions/${questionId}`, {
    method: 'DELETE',
    headers: organizerHeaders(token),
  })
}

export function wipeAdminCollectedData(
  token: string,
): Promise<CollectedDataWipeResult> {
  return request<CollectedDataWipeResult>('/api/v1/admin/collected-data', {
    method: 'DELETE',
    headers: organizerHeaders(token),
  })
}

export function createAdminQuestion(
  token: string,
  question: {
    session_id: string
    prompt: string
    x_axis_label: string | null
    y_axis_label: string | null
    prompt_de: string | null
    x_axis_label_de: string | null
    y_axis_label_de: string | null
    prompt_it: string | null
    x_axis_label_it: string | null
    y_axis_label_it: string | null
  },
): Promise<AdminQuestion> {
  return request<AdminQuestion>('/api/v1/questions', {
    method: 'POST',
    headers: organizerHeaders(token, true),
    body: JSON.stringify(question),
  })
}

export async function downloadAdminResults(token: string): Promise<void> {
  const response = await fetchApi('/api/v1/results.csv', {
    headers: organizerHeaders(token),
  })
  const blobUrl = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = blobUrl
  link.download = 'conference-survey-results.csv'
  link.click()
  URL.revokeObjectURL(blobUrl)
}
