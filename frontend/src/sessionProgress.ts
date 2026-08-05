const STORAGE_KEY = 'conference-survey-session-progress-v1'

interface StoredProgress {
  runId: string
  completedQuestionIds: string[]
}

function readStoredProgress(): StoredProgress | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredProgress>
    if (
      typeof parsed.runId !== 'string' ||
      !Array.isArray(parsed.completedQuestionIds) ||
      !parsed.completedQuestionIds.every((id) => typeof id === 'string')
    ) {
      return null
    }
    return {
      runId: parsed.runId,
      completedQuestionIds: parsed.completedQuestionIds,
    }
  } catch {
    return null
  }
}

export function loadCompletedQuestions(runId: string): string[] {
  const stored = readStoredProgress()
  return stored?.runId === runId ? stored.completedQuestionIds : []
}

export function markQuestionCompleted(
  runId: string,
  questionId: string,
): string[] {
  const completed = new Set(loadCompletedQuestions(runId))
  completed.add(questionId)
  const completedQuestionIds = [...completed]
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ runId, completedQuestionIds } satisfies StoredProgress),
  )
  return completedQuestionIds
}
