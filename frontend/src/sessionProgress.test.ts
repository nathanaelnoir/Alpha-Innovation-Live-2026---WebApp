import { beforeEach, describe, expect, it } from 'vitest'
import { loadCompletedQuestions, markQuestionCompleted } from './sessionProgress'

describe('session progress', () => {
  beforeEach(() => window.localStorage.clear())

  it('keeps progress for the current session without duplicates', () => {
    markQuestionCompleted('session-1', 'question-1')
    markQuestionCompleted('session-1', 'question-1')
    expect(loadCompletedQuestions('session-1')).toEqual(['question-1'])
  })

  it('starts fresh when a new session opens', () => {
    markQuestionCompleted('session-1', 'question-1')
    expect(loadCompletedQuestions('session-2')).toEqual([])
  })

  it('ignores malformed local data', () => {
    window.localStorage.setItem('conference-survey-session-progress-v1', '{broken')
    expect(loadCompletedQuestions('session-1')).toEqual([])
  })
})
