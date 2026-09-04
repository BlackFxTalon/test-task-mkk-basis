import type { TodoItem } from './note'
import { cloneNoteInput, type NoteInput } from './noteInput'

const HISTORY_LIMIT = 50
const TEXT_GROUP_DELAY_MS = 700

type TextTarget =
  | { type: 'title' }
  | { type: 'item-text', itemId: string }

export type HistoryOperationType =
  | 'title'
  | 'item-text'
  | 'item-completed'
  | 'item-inserted'
  | 'item-removed'

type HistoryOperation =
  | { type: 'title', before: string, after: string }
  | { type: 'item-text', itemId: string, before: string, after: string }
  | { type: 'item-completed', itemId: string, before: boolean, after: boolean }
  | { type: 'item-inserted', item: TodoItem, index: number }
  | { type: 'item-removed', item: TodoItem, index: number }

interface PendingTextOperation {
  target: TextTarget
  before: string
  after: string
}

export interface HistoryResult {
  action: 'undo' | 'redo'
  operation: HistoryOperationType
}

export interface NoteHistoryOptions {
  onChange?: () => void
}

const cloneItem = (item: TodoItem): TodoItem => ({ ...item })


const targetsMatch = (left: TextTarget, right: TextTarget): boolean =>
  left.type === right.type
  && (left.type === 'title' || (right.type === 'item-text' && left.itemId === right.itemId))

export const createNoteHistory = (
  state: NoteInput,
  options: NoteHistoryOptions = {},
) => {
  const operations: HistoryOperation[] = []
  let cursor = 0
  let pendingText: PendingTextOperation | null = null
  let textTimer: ReturnType<typeof setTimeout> | null = null

  const notify = (): void => {
    options.onChange?.()
  }

  const clearTextTimer = (): void => {
    if (textTimer !== null) {
      clearTimeout(textTimer)
      textTimer = null
    }
  }

  const discardRedo = (): void => {
    if (cursor < operations.length) {
      operations.splice(cursor)
    }
  }

  const recordOperation = (operation: HistoryOperation): void => {
    discardRedo()
    operations.push(operation)
    cursor = operations.length

    if (operations.length > HISTORY_LIMIT) {
      const overflow = operations.length - HISTORY_LIMIT
      operations.splice(0, overflow)
      cursor -= overflow
    }

    notify()
  }

  const commitText = (): void => {
    clearTextTimer()
    const pending = pendingText
    pendingText = null

    if (!pending || pending.before === pending.after) {
      notify()
      return
    }

    if (pending.target.type === 'title') {
      recordOperation({
        type: 'title',
        before: pending.before,
        after: pending.after,
      })
    }
    else {
      recordOperation({
        type: 'item-text',
        itemId: pending.target.itemId,
        before: pending.before,
        after: pending.after,
      })
    }
  }

  const scheduleTextCommit = (): void => {
    clearTextTimer()
    textTimer = setTimeout(commitText, TEXT_GROUP_DELAY_MS)
  }

  const beginOrUpdateText = (
    target: TextTarget,
    before: string,
    after: string,
    apply: () => void,
  ): void => {
    if (pendingText && !targetsMatch(pendingText.target, target)) {
      commitText()
    }

    if (!pendingText) {
      if (before === after) {
        return
      }
      discardRedo()
      pendingText = { target, before, after }
    }
    else {
      pendingText.after = after
    }

    apply()
    scheduleTextCommit()
    notify()
  }

  const setTitle = (title: string): void => {
    beginOrUpdateText(
      { type: 'title' },
      state.title,
      title,
      () => {
        state.title = title
      },
    )
  }

  const setItemText = (itemId: string, text: string): void => {
    const item = state.items.find(candidate => candidate.id === itemId)
    if (!item) {
      return
    }

    beginOrUpdateText(
      { type: 'item-text', itemId },
      item.text,
      text,
      () => {
        item.text = text
      },
    )
  }

  const setItemCompleted = (itemId: string, completed: boolean): void => {
    commitText()
    const item = state.items.find(candidate => candidate.id === itemId)
    if (!item || item.completed === completed) {
      return
    }

    const before = item.completed
    item.completed = completed
    recordOperation({ type: 'item-completed', itemId, before, after: completed })
  }

  const addItem = (item: TodoItem, requestedIndex = state.items.length): void => {
    commitText()
    const index = Math.max(0, Math.min(requestedIndex, state.items.length))
    const insertedItem = cloneItem(item)
    state.items.splice(index, 0, insertedItem)
    recordOperation({ type: 'item-inserted', item: cloneItem(insertedItem), index })
  }

  const removeItem = (itemId: string): void => {
    commitText()
    const index = state.items.findIndex(item => item.id === itemId)
    if (index < 0) {
      return
    }

    const [removedItem] = state.items.splice(index, 1)
    if (removedItem) {
      recordOperation({ type: 'item-removed', item: cloneItem(removedItem), index })
    }
  }

  const applyOperation = (operation: HistoryOperation, direction: 'forward' | 'reverse'): void => {
    switch (operation.type) {
      case 'title':
        state.title = direction === 'forward' ? operation.after : operation.before
        break
      case 'item-text': {
        const item = state.items.find(candidate => candidate.id === operation.itemId)
        if (item) {
          item.text = direction === 'forward' ? operation.after : operation.before
        }
        break
      }
      case 'item-completed': {
        const item = state.items.find(candidate => candidate.id === operation.itemId)
        if (item) {
          item.completed = direction === 'forward' ? operation.after : operation.before
        }
        break
      }
      case 'item-inserted':
        if (direction === 'forward') {
          state.items.splice(operation.index, 0, cloneItem(operation.item))
        }
        else {
          const index = state.items.findIndex(item => item.id === operation.item.id)
          if (index >= 0) {
            state.items.splice(index, 1)
          }
        }
        break
      case 'item-removed':
        if (direction === 'forward') {
          const index = state.items.findIndex(item => item.id === operation.item.id)
          if (index >= 0) {
            state.items.splice(index, 1)
          }
        }
        else {
          state.items.splice(operation.index, 0, cloneItem(operation.item))
        }
        break
    }
  }

  const undo = (): HistoryResult | null => {
    commitText()
    if (cursor === 0) {
      return null
    }

    const operation = operations[cursor - 1]
    if (!operation) {
      return null
    }

    applyOperation(operation, 'reverse')
    cursor -= 1
    notify()
    return { action: 'undo', operation: operation.type }
  }

  const redo = (): HistoryResult | null => {
    commitText()
    const operation = operations[cursor]
    if (!operation) {
      return null
    }

    applyOperation(operation, 'forward')
    cursor += 1
    notify()
    return { action: 'redo', operation: operation.type }
  }

  const clear = (): void => {
    clearTextTimer()
    pendingText = null
    operations.splice(0)
    cursor = 0
    notify()
  }

  const destroy = (): void => {
    clearTextTimer()
    pendingText = null
  }

  return {
    get state(): NoteInput {
      return cloneNoteInput(state)
    },
    get canUndo(): boolean {
      return pendingText !== null || cursor > 0
    },
    get canRedo(): boolean {
      return pendingText === null && cursor < operations.length
    },
    setTitle,
    setItemText,
    setItemCompleted,
    addItem,
    removeItem,
    commitText,
    undo,
    redo,
    clear,
    destroy,
  }
}

export type NoteHistory = ReturnType<typeof createNoteHistory>
