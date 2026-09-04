import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { TodoItem } from '../domain/note'
import {
  createNoteHistory,
  type HistoryResult,
  type NoteHistory,
} from '../domain/noteHistory'
import {
  areNoteInputsEqual,
  cloneNoteInput,
  type NoteInput,
} from '../domain/noteInput'

export interface EditingSession extends NoteInput {
  noteId: string | null
  baseline: NoteInput
}

export const useNoteEditorStore = defineStore('note-editor', () => {
  const session = ref<EditingSession | null>(null)
  const canUndo = ref(false)
  const canRedo = ref(false)
  let history: NoteHistory | null = null

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

  const startSession = (input: NoteInput & { noteId: string | null }): void => {
    history?.destroy()
    const baseline = cloneNoteInput(input)
    session.value = {
      noteId: input.noteId,
      ...cloneNoteInput(input),
      baseline,
    }
    history = createNoteHistory(session.value, { onChange: syncHistoryAvailability })
    syncHistoryAvailability()
  }

  const getInput = (): NoteInput => session.value
    ? cloneNoteInput(session.value)
    : { title: '', items: [] }

  const setTitle = (title: string): void => {
    history?.setTitle(title)
  }

  const addItem = (item: TodoItem): void => {
    history?.addItem(item)
  }

  const setItemText = (index: number, text: string): void => {
    const itemId = session.value?.items[index]?.id
    if (itemId) {
      history?.setItemText(itemId, text)
    }
  }

  const setItemCompleted = (index: number, completed: boolean): void => {
    const itemId = session.value?.items[index]?.id
    if (itemId) {
      history?.setItemCompleted(itemId, completed)
    }
  }

  const removeItem = (index: number): void => {
    const itemId = session.value?.items[index]?.id
    if (itemId) {
      history?.removeItem(itemId)
    }
  }

  const commitText = (): void => {
    history?.commitText()
  }

  const undo = (): HistoryResult | null => history?.undo() ?? null

  const redo = (): HistoryResult | null => history?.redo() ?? null

  const cancelSession = (): void => {
    history?.clear()
    history?.destroy()
    history = null
    session.value = null
    canUndo.value = false
    canRedo.value = false
  }

  return {
    session,
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
    cancelSession,
  }
})
