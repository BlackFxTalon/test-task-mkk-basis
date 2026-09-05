import type { NoteInput } from './noteInput'

export interface Draft {
  sessionId: string
  targetNoteId: string | null
  baselineRevision: number | null
  current: NoteInput
  updatedAt: string
}

export interface DraftRepository {
  read(sessionId: string): Draft | null
  write(draft: Draft): void
  delete(sessionId: string): void
  deleteOlderThan(cutoff: string): void
}
