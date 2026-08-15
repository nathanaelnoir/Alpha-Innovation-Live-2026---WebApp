import type { ParticipantIdentity } from './types'

const STORAGE_KEY = 'conference-survey-participant-v1'

export function loadParticipantIdentity(): ParticipantIdentity | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null

    const value: unknown = JSON.parse(raw)
    if (
      typeof value === 'object' &&
      value !== null &&
      'participantId' in value &&
      'participantToken' in value &&
      typeof value.participantId === 'string' &&
      typeof value.participantToken === 'string'
    ) {
      return value as ParticipantIdentity
    }
  } catch {
    // Storage can be unavailable or contain an older malformed value.
  }
  return null
}

export function saveParticipantIdentity(identity: ParticipantIdentity): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(identity))
  } catch {
    // A participant can still answer in private modes where storage is unavailable.
  }
}

export function clearParticipantIdentity(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage can be unavailable in private browsing modes.
  }
}
