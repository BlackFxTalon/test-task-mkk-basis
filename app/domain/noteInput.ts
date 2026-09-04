import {
  NOTE_ITEM_MAX_LENGTH,
  NOTE_TITLE_MAX_LENGTH,
  type Note,
} from './note'

export interface NoteInput {
  title: string
  items: Note['items']
}

export type NoteValidationFailure = 'title-required' | 'title-too-long' | 'item-too-long'

export type NormalizedNoteInputResult =
  | { ok: true, title: string, items: Note['items'] }
  | { ok: false, reason: NoteValidationFailure }

export const normalizeNoteInputForComparison = (input: NoteInput): NoteInput => ({
  title: input.title.trim(),
  items: input.items
    .map(item => ({ ...item, text: item.text.trim() }))
    .filter(item => item.text.length > 0),
})

export const normalizeNoteInput = (input: NoteInput): NormalizedNoteInputResult => {
  const normalized = normalizeNoteInputForComparison(input)

  if (!normalized.title) {
    return { ok: false, reason: 'title-required' }
  }
  if (normalized.title.length > NOTE_TITLE_MAX_LENGTH) {
    return { ok: false, reason: 'title-too-long' }
  }
  if (input.items.some(item => item.text.trim().length > NOTE_ITEM_MAX_LENGTH)) {
    return { ok: false, reason: 'item-too-long' }
  }

  return { ok: true, ...normalized }
}

export const areNoteInputsEqual = (left: NoteInput, right: NoteInput): boolean => {
  const normalizedLeft = normalizeNoteInputForComparison(left)
  const normalizedRight = normalizeNoteInputForComparison(right)

  return normalizedLeft.title === normalizedRight.title
    && normalizedLeft.items.length === normalizedRight.items.length
    && normalizedLeft.items.every((item, index) => {
      const other = normalizedRight.items[index]
      return other !== undefined
        && item.id === other.id
        && item.text === other.text
        && item.completed === other.completed
    })
}
