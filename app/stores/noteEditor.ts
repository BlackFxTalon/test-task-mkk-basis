import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Draft, DraftRepository } from '../domain/draft'
import type { Note, TodoItem } from '../domain/note'
import {
  createNoteHistory,
  type HistoryResult,
  type NoteHistory,
} from '../domain/noteHistory'
import {
  areNoteInputsEqual,
  cloneNoteInput,
  normalizeNoteInputForComparison,
  type NoteInput,
} from '../domain/noteInput'
import { browserDraftRepository } from '../repositories/browserDraftRepository'

const DRAFT_WRITE_DELAY_MS = 700
const DRAFT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

const isDraftRecoverable = (input: NoteInput): boolean => {
  const normalized = normalizeNoteInputForComparison(input)
  return normalized.title.length > 0 || normalized.items.length > 0
}

export interface EditingSession extends NoteInput {
  sessionId: string
  noteId: string | null
  baselineRevision: number | null
  baseline: NoteInput
}

export interface StartEditingSessionInput extends NoteInput {
  sessionId?: string
  noteId: string | null
  baselineRevision?: number | null
}

export interface NoteEditorStoreDependencies {
  repository: DraftRepository
  createSessionId: () => string
  now: () => string
}

export const createNoteEditorStore = (dependencies: NoteEditorStoreDependencies) =>
  defineStore('note-editor', () => {
    const session = ref<EditingSession | null>(null)
    const recoveryDraft = ref<Draft | null>(null)
    const draftError = ref<string | null>(null)
    const isExternallyDeleted = ref(false)
    const isExternallyModified = ref(false)
    const canUndo = ref(false)
    const canRedo = ref(false)
    let history: NoteHistory | null = null
    let draftTimer: ReturnType<typeof setTimeout> | null = null
    let pendingDeletionSessionId: string | null = null

    const isDirty = computed(() => {
      if (!session.value) {
        return false
      }

      return !areNoteInputsEqual(session.value, session.value.baseline)
    })

    const syncHistoryAvailability = (): void => {
      if (!history) {
        canUndo.value = false
        canRedo.value = false
        return
      }

      canUndo.value = history.canUndo
      canRedo.value = history.canRedo
    }

    const clearDraftTimer = (): void => {
      if (draftTimer !== null) {
        clearTimeout(draftTimer)
        draftTimer = null
      }
    }

    const deleteCurrentDraft = (): boolean => {
      const sessionId = session.value?.sessionId ?? pendingDeletionSessionId
      if (!sessionId) {
        return true
      }

      try {
        dependencies.repository.delete(sessionId)
        draftError.value = null
        return true
      }
      catch {
        draftError.value = 'Не удалось удалить черновик.'
        return false
      }
    }

    const persistDraft = (): boolean => {
      clearDraftTimer()
      const currentSession = session.value
      if (!currentSession) {
        return true
      }

      if (!isDirty.value) {
        return deleteCurrentDraft()
      }

      const draft: Draft = {
        sessionId: currentSession.sessionId,
        targetNoteId: currentSession.noteId,
        baselineRevision: currentSession.baselineRevision,
        current: cloneNoteInput(currentSession),
        updatedAt: dependencies.now(),
      }

      try {
        dependencies.repository.write(draft)
        draftError.value = null
        return true
      }
      catch {
        draftError.value = 'Не удалось сохранить черновик. Изменения остаются открыты в этой вкладке.'
        return false
      }
    }

    const scheduleDraftPersistence = (): void => {
      clearDraftTimer()
      draftTimer = setTimeout(persistDraft, DRAFT_WRITE_DELAY_MS)
    }

    const pruneExpiredDrafts = (): void => {
      const now = Date.parse(dependencies.now())
      const cutoff = new Date(now - DRAFT_MAX_AGE_MS).toISOString()
      try {
        dependencies.repository.deleteOlderThan(cutoff)
      }
      catch {
        draftError.value = 'Не удалось очистить старые черновики.'
      }
    }

    const loadRecoveryDraft = (sessionId: string, noteId: string | null): void => {
      recoveryDraft.value = null
      pruneExpiredDrafts()

      try {
        const draft = dependencies.repository.read(sessionId)
        if (draft?.targetNoteId === noteId) {
          recoveryDraft.value = draft
        }
      }
      catch {
        draftError.value = 'Не удалось загрузить черновик.'
      }
    }

    const startSession = (input: StartEditingSessionInput): string => {
      clearDraftTimer()
      history?.destroy()
      isExternallyDeleted.value = false
      isExternallyModified.value = false
      pendingDeletionSessionId = null
      const sessionId = input.sessionId ?? dependencies.createSessionId()
      const baseline = cloneNoteInput(input)
      session.value = {
        sessionId,
        noteId: input.noteId,
        baselineRevision: input.baselineRevision ?? null,
        ...cloneNoteInput(input),
        baseline,
      }
      history = createNoteHistory(session.value, { onChange: syncHistoryAvailability })
      syncHistoryAvailability()
      loadRecoveryDraft(sessionId, input.noteId)
      return sessionId
    }

    const getInput = (): NoteInput => session.value
      ? cloneNoteInput(session.value)
      : { title: '', items: [] }

    const setTitle = (title: string): void => {
      history?.setTitle(title)
      scheduleDraftPersistence()
    }

    const addItem = (item: TodoItem): void => {
      history?.addItem(item)
      scheduleDraftPersistence()
    }

    const setItemText = (index: number, text: string): void => {
      const itemId = session.value?.items[index]?.id
      if (itemId) {
        history?.setItemText(itemId, text)
        scheduleDraftPersistence()
      }
    }

    const setItemCompleted = (index: number, completed: boolean): void => {
      const itemId = session.value?.items[index]?.id
      if (itemId) {
        history?.setItemCompleted(itemId, completed)
        scheduleDraftPersistence()
      }
    }

    const removeItem = (index: number): void => {
      const itemId = session.value?.items[index]?.id
      if (itemId) {
        history?.removeItem(itemId)
        scheduleDraftPersistence()
      }
    }

    const commitText = (): void => {
      history?.commitText()
    }

    const undo = (): HistoryResult | null => {
      const result = history?.undo() ?? null
      if (result) {
        scheduleDraftPersistence()
      }
      return result
    }

    const redo = (): HistoryResult | null => {
      const result = history?.redo() ?? null
      if (result) {
        scheduleDraftPersistence()
      }
      return result
    }

    const restoreRecoveryDraft = (): void => {
      if (!session.value || !recoveryDraft.value) {
        return
      }

      clearDraftTimer()
      history?.destroy()
      session.value.title = recoveryDraft.value.current.title
      session.value.items = cloneNoteInput(recoveryDraft.value.current).items
      recoveryDraft.value = null
      history = createNoteHistory(session.value, { onChange: syncHistoryAvailability })
      syncHistoryAvailability()
    }

    const discardRecoveryDraft = (): boolean => {
      const deleted = deleteCurrentDraft()
      if (deleted) {
        recoveryDraft.value = null
        pendingDeletionSessionId = null
      }
      return deleted
    }

    const closeSession = (): void => {
      clearDraftTimer()
      history?.destroy()
      history = null
      session.value = null
      recoveryDraft.value = null
      isExternallyDeleted.value = false
      isExternallyModified.value = false
      pendingDeletionSessionId = null
      canUndo.value = false
      canRedo.value = false
    }

    const finishSession = (): boolean => {
      clearDraftTimer()
      if (!deleteCurrentDraft()) {
        return false
      }

      closeSession()
      return true
    }

    const cancelSession = finishSession

    const rebaseTo = (
      targetSession: NonNullable<typeof session.value>,
      externalNote: Note,
    ): void => {
      clearDraftTimer()
      history?.destroy()
      const nextInput: NoteInput = {
        title: externalNote.title,
        items: externalNote.items.map(item => ({ ...item })),
      }
      history = createNoteHistory(targetSession, { onChange: syncHistoryAvailability })
      targetSession.title = nextInput.title
      targetSession.items = nextInput.items
      targetSession.baselineRevision = externalNote.revision
      targetSession.baseline = cloneNoteInput(nextInput)
      syncHistoryAvailability()
    }

    const applyExternalChange = (externalNote: Note | null): 'rebased' | 'notified' | 'deleted' | 'ignored' => {
      const currentSession = session.value
      if (!currentSession) {
        return 'ignored'
      }

      if (!externalNote) {
        if (currentSession.noteId === null) {
          return 'ignored'
        }

        isExternallyDeleted.value = true
        isExternallyModified.value = false
        return 'deleted'
      }

      if (currentSession.noteId !== externalNote.id) {
        return 'ignored'
      }

      if (currentSession.baselineRevision === externalNote.revision) {
        return 'ignored'
      }

      if (isDirty.value) {
        isExternallyModified.value = true
        return 'notified'
      }

      rebaseTo(currentSession, externalNote)
      isExternallyModified.value = false
      return 'rebased'
    }

    const resolveConflictReload = (externalNote: Note): boolean => {
      const currentSession = session.value
      if (!currentSession || currentSession.noteId !== externalNote.id) {
        return false
      }

      rebaseTo(currentSession, externalNote)
      isExternallyModified.value = false
      return true
    }

    const offerDraftForDeletedNote = (noteId: string, sessionId: string | null): Draft | null => {
      if (session.value || recoveryDraft.value || !sessionId) {
        return null
      }

      pruneExpiredDrafts()

      try {
        const draft = dependencies.repository.read(sessionId)
        if (draft && draft.targetNoteId === noteId && isDraftRecoverable(draft.current)) {
          recoveryDraft.value = draft
          pendingDeletionSessionId = draft.sessionId
          return draft
        }
      }
      catch {
        draftError.value = 'Не удалось загрузить черновик.'
      }
      return null
    }

    const restoreOrphanedDraftAsNew = (): boolean => {
      const draft = recoveryDraft.value
      if (!draft || session.value) {
        return false
      }

      const restoredInput = cloneNoteInput(draft.current)
      clearDraftTimer()
      history?.destroy()
      session.value = {
        sessionId: draft.sessionId,
        noteId: null,
        baselineRevision: null,
        ...cloneNoteInput(restoredInput),
        baseline: { title: '', items: [] },
      }
      history = createNoteHistory(session.value, { onChange: syncHistoryAvailability })
      syncHistoryAvailability()
      recoveryDraft.value = null
      pendingDeletionSessionId = null
      isExternallyDeleted.value = false
      isExternallyModified.value = false
      return true
    }

    return {
      session,
      recoveryDraft,
      draftError,
      isExternallyDeleted,
      isExternallyModified,
      isDirty,
      canUndo,
      canRedo,
      startSession,
      getInput,
      setTitle,
      addItem,
      setItemText,
      setItemCompleted,
      removeItem,
      commitText,
      undo,
      redo,
      persistDraft,
      restoreRecoveryDraft,
      discardRecoveryDraft,
      applyExternalChange,
      resolveConflictReload,
      offerDraftForDeletedNote,
      restoreOrphanedDraftAsNew,
      closeSession,
      finishSession,
      cancelSession,
    }
  })

export const useNoteEditorStore = createNoteEditorStore({
  repository: browserDraftRepository,
  createSessionId: () => crypto.randomUUID(),
  now: () => new Date().toISOString(),
})