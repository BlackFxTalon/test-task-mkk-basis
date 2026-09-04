import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { TodoItem } from '../domain/note'
import {
  areNoteInputsEqual,
  type NoteInput,
} from '../domain/noteInput'

export interface EditingSession extends NoteInput {
  noteId: string | null
  baseline: NoteInput
}

const cloneInput = (input: NoteInput): NoteInput => ({
  title: input.title,
  items: input.items.map(item => ({ ...item })),
})

export const useNoteEditorStore = defineStore('note-editor', () => {
  const session = ref<EditingSession | null>(null)

  const isDirty = computed(() => {
    if (!session.value) {
      return false
    }

    return !areNoteInputsEqual(session.value, session.value.baseline)
  })

  const startSession = (input: NoteInput & { noteId: string | null }): void => {
    const baseline = cloneInput(input)
    session.value = {
      noteId: input.noteId,
      ...cloneInput(input),
      baseline,
    }
  }

  const getInput = (): NoteInput => session.value
    ? cloneInput(session.value)
    : { title: '', items: [] }

  const setTitle = (title: string): void => {
    if (session.value) {
      session.value.title = title
    }
  }

  const addItem = (item: TodoItem): void => {
    session.value?.items.push({ ...item })
  }

  const setItemText = (index: number, text: string): void => {
    const item = session.value?.items[index]
    if (item) {
      item.text = text
    }
  }

  const setItemCompleted = (index: number, completed: boolean): void => {
    const item = session.value?.items[index]
    if (item) {
      item.completed = completed
    }
  }

  const removeItem = (index: number): void => {
    session.value?.items.splice(index, 1)
  }

  const cancelSession = (): void => {
    session.value = null
  }

  return {
    session,
    isDirty,
    startSession,
    getInput,
    setTitle,
    addItem,
    setItemText,
    setItemCompleted,
    removeItem,
    cancelSession,
  }
})
