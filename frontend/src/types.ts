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
