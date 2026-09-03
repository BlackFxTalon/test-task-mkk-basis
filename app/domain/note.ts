export const NOTE_TITLE_MAX_LENGTH = 120
export const NOTE_ITEM_MAX_LENGTH = 300

export interface TodoItem {
  id: string
  text: string
  completed: boolean
}

export interface Note {
  id: string
  title: string
  items: TodoItem[]
  createdAt: string
  updatedAt: string
  revision: number
}

export interface NotesRepository {
  read(): Note[]
  write(notes: Note[]): void
}
