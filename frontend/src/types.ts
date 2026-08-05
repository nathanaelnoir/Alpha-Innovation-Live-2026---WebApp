export interface ActiveQuestion {
  id: string
  position: number
  prompt: string
  x_axis_label: string | null
  y_axis_label: string | null
}

export interface ActiveSurveySession {
  id: string
  run_id: string
  title: string
  questions: ActiveQuestion[]
}

export interface ParticipantIdentity {
  participantId: string
  participantToken: string
}

export interface Coordinate {
  x: number
  y: number
}

export interface ResponseAccepted extends Coordinate {
  response_id: string
  question_id: string
}

export interface AdminSession {
  id: string
  current_run_id: string
  title: string
  is_open: boolean
  question_count: number
  created_at: string
  opened_at: string | null
  closed_at: string | null
}

export interface AdminQuestion extends ActiveQuestion {
  session_id: string
  is_active: boolean
}
