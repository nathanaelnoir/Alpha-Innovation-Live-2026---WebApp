import type {
  ActiveSurveySession,
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
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

  return (await response.json()) as T
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
