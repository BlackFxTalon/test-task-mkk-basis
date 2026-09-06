<script setup lang="ts">
import {
  NOTE_ITEM_MAX_LENGTH,
  NOTE_TITLE_MAX_LENGTH,
  type Note,
  type TodoItem,
} from '../domain/note'
import type { HistoryOperationType, HistoryResult } from '../domain/noteHistory'
import { NOTES_STORAGE_KEY } from '../repositories/browserNotesRepository'
import { useNoteEditorStore } from '../stores/noteEditor'
import { useNotesStore } from '../stores/notes'

const props = defineProps<{
  noteId?: string
}>()

const notesStore = useNotesStore()
const editorStore = useNoteEditorStore()
const route = useRoute()
const { claimRequestedSession, ownSession } = useEditingSessionOwnership()
const { announce } = useOperationStatus()
const {
  deletionDescription,
  requestDeletion,
  cancelDeletion,
  confirmDeletion,
} = useNoteDeletion()
const titleInput = useTemplateRef<HTMLInputElement>('titleInput')
const isReady = ref(false)
const isSaving = ref(false)
const isNotFound = ref(false)
const titleError = ref<string | null>(null)
const formError = ref<string | null>(null)
const historyMessage = ref<string | null>(null)
const activeDialog = ref<'cancel' | 'delete' | 'navigation' | 'recovery' | 'conflict' | 'deleted' | 'deleted-recovery' | null>(null)
const pendingNavigation = ref<string | null>(null)
let allowNavigation = false
let historyMessageTimeout: ReturnType<typeof setTimeout> | null = null

const isEditing = computed(() => props.noteId !== undefined)
const pageTitle = computed(() => isEditing.value ? 'Редактирование заметки' : 'Новая заметка')
const title = computed({
  get: () => editorStore.session?.title ?? '',
  set: value => editorStore.setTitle(value),
})
const items = computed(() => editorStore.session?.items ?? [])
const isSaveDisabled = computed(() =>
  isSaving.value
  || (isEditing.value && !editorStore.isDirty),
)

const DIALOG_TEXT: Record<NonNullable<typeof activeDialog.value>, { title: string, confirmLabel: string, cancelLabel: string, description?: string }> = {
  cancel: {
    title: 'Выйти из редактора?',
    confirmLabel: 'Выйти без сохранения',
    cancelLabel: 'Отмена',
  },
  delete: {
    title: 'Удалить заметку?',
    confirmLabel: 'Удалить заметку',
    cancelLabel: 'Отмена',
  },
  navigation: {
    title: 'Выйти из редактора?',
    confirmLabel: 'Выйти без сохранения',
    cancelLabel: 'Отмена',
  },
  recovery: {
    title: 'Восстановить черновик?',
    description: 'Для этой вкладки найдены несохранённые изменения. Их можно восстановить или удалить.',
    confirmLabel: 'Восстановить черновик',
    cancelLabel: 'Удалить черновик',
  },
  conflict: {
    title: 'Заметка изменена в другой вкладке',
    description: 'Пока вы редактировали заметку, её сохранили в другой вкладке. Выберите, как поступить с вашими изменениями.',
    confirmLabel: 'Продолжить редактирование',
    cancelLabel: 'Продолжить редактирование',
  },
  deleted: {
    title: 'Заметка удалена в другой вкладке',
    description: 'Заметку удалили, пока вы её редактировали. Ваша работа осталась в этом редакторе: сохраните её как новую заметку или выйдите без сохранения.',
    confirmLabel: 'Выйти без сохранения',
    cancelLabel: 'Продолжить редактирование',
  },
  'deleted-recovery': {
    title: 'Заметка удалена, но есть несохранённая работа',
    description: 'Эта заметка больше не существует, но для вкладки найден её несохранённый черновик. Его можно восстановить как новую заметку или удалить.',
    confirmLabel: 'Восстановить как новую заметку',
    cancelLabel: 'Удалить черновик',
  },
}

const dialogTitle = computed(() => DIALOG_TEXT[activeDialog.value ?? 'cancel'].title)
const dialogDescription = computed(() => {
  if (activeDialog.value === 'delete') {
    return deletionDescription.value
  }
  return DIALOG_TEXT[activeDialog.value ?? 'cancel'].description ?? 'Несохранённые изменения будут потеряны.'
})
const dialogConfirmLabel = computed(() => DIALOG_TEXT[activeDialog.value ?? 'cancel'].confirmLabel)
const dialogCancelLabel = computed(() => DIALOG_TEXT[activeDialog.value ?? 'cancel'].cancelLabel)

const sessionIdFromRoute = (): string | undefined => {
  const value = route.query.session
  const sessionId = Array.isArray(value) ? value[0] : value
  return typeof sessionId === 'string' && sessionId.length > 0 ? sessionId : undefined
}

let disposed = false

const startOwnedSession = async (
  input: {
    noteId: string | null
    baselineRevision?: number
    title: string
    items: TodoItem[]
  },
  requestedSessionId: string | undefined,
): Promise<string | null> => {
  const claimedSessionId = await claimRequestedSession(requestedSessionId)
  if (disposed) {
    return null
  }

  const sessionId = editorStore.startSession({
    sessionId: claimedSessionId,
    noteId: input.noteId,
    baselineRevision: input.baselineRevision,
    title: input.title,
    items: input.items,
  })
  ownSession(sessionId)
  return sessionId
}

const initializeEditor = async (): Promise<void> => {
  if (!notesStore.isInitialized) {
    notesStore.initialize()
  }

  const requestedSessionId = sessionIdFromRoute()
  let sessionId: string | null = null

  if (props.noteId !== undefined && !notesStore.error) {
    const note = notesStore.getNote(props.noteId)
    if (!note) {
      const orphanedDraft = editorStore.offerDraftForDeletedNote(props.noteId, requestedSessionId ?? null)
      if (orphanedDraft) {
        sessionId = orphanedDraft.sessionId
        activeDialog.value = 'deleted-recovery'
      }
      else {
        isNotFound.value = true
      }
    }
    else {
      sessionId = await startOwnedSession({
        noteId: note.id,
        baselineRevision: note.revision,
        title: note.title,
        items: note.items,
      }, requestedSessionId)
    }
  }
  else if (props.noteId === undefined && !notesStore.error) {
    sessionId = await startOwnedSession({
      noteId: null,
      title: '',
      items: [],
    }, requestedSessionId)
  }

  if (sessionId && sessionId !== requestedSessionId) {
    await navigateTo({
      path: route.path,
      query: { ...route.query, session: sessionId },
    }, { replace: true })
  }

  if (editorStore.recoveryDraft && activeDialog.value === null) {
    activeDialog.value = 'recovery'
  }
  isReady.value = true
}

onMounted(() => {
  void initializeEditor()
})

const addItem = (): void => {
  editorStore.addItem({
    id: crypto.randomUUID(),
    text: '',
    completed: false,
  })
}

const removeItem = (index: number): void => {
  editorStore.removeItem(index)
  formError.value = null
}

const updateItemText = (index: number, event: Event): void => {
  editorStore.setItemText(index, (event.target as HTMLInputElement).value)
  formError.value = null
}

const updateItemCompleted = (index: number, event: Event): void => {
  editorStore.setItemCompleted(index, (event.target as HTMLInputElement).checked)
  formError.value = null
}

const clearErrors = (): void => {
  titleError.value = null
  formError.value = null
}

const focusInvalidTitle = async (): Promise<void> => {
  await nextTick()
  titleInput.value?.focus()
}

type SaveFailureReason = 'title-required' | 'title-too-long' | 'item-too-long' | 'persistence'

const handleSaveValidationFailure = async (reason: SaveFailureReason): Promise<void> => {
  if (reason === 'title-required') {
    titleError.value = 'Введите название заметки.'
    await focusInvalidTitle()
  }
  else if (reason === 'title-too-long') {
    titleError.value = `Название не должно быть длиннее ${NOTE_TITLE_MAX_LENGTH} символов.`
    await focusInvalidTitle()
  }
  else if (reason === 'item-too-long') {
    formError.value = `Текст пункта не должен быть длиннее ${NOTE_ITEM_MAX_LENGTH} символов.`
  }
  else {
    formError.value = 'Не удалось сохранить заметку. Попробуйте ещё раз.'
  }
}

const saveNote = async (): Promise<void> => {
  isSaving.value = true
  clearErrors()
  editorStore.commitText()

  const sessionNoteId = editorStore.session?.noteId ?? null
  const baselineRevision = editorStore.session?.baselineRevision ?? undefined
  const result = sessionNoteId === null
    ? notesStore.createNote(editorStore.getInput())
    : notesStore.updateNote(sessionNoteId, editorStore.getInput(), { baselineRevision })

  if (!result.ok && result.reason !== 'unchanged') {
    isSaving.value = false

    if (result.reason === 'not-found') {
      activeDialog.value = 'deleted'
    }
    else if (result.reason === 'revision-conflict') {
      activeDialog.value = 'conflict'
    }
    else {
      await handleSaveValidationFailure(result.reason)
    }

    return
  }

  if (!editorStore.finishSession()) {
    isSaving.value = false
    return
  }

  if (result.ok) {
    announce(sessionNoteId === null ? 'Заметка создана.' : 'Изменения сохранены.')
  }
  allowNavigation = true
  await navigateTo('/')
}

const requestCancel = (): void => {
  editorStore.commitText()
  activeDialog.value = 'cancel'
}

const requestDelete = (): void => {
  editorStore.commitText()
  const note = props.noteId === undefined ? null : notesStore.getNote(props.noteId)
  if (!note) {
    isNotFound.value = true
    return
  }

  requestDeletion(note)
  activeDialog.value = 'delete'
}

const closeDialog = (): void => {
  if (activeDialog.value === 'delete') {
    cancelDeletion()
  }
  else if (activeDialog.value === 'deleted-recovery') {
    if (!editorStore.discardRecoveryDraft()) {
      return
    }
    activeDialog.value = null
    pendingNavigation.value = null
    isNotFound.value = true
    return
  }
  else if (activeDialog.value === 'recovery' && !editorStore.discardRecoveryDraft()) {
    return
  }
  activeDialog.value = null
  pendingNavigation.value = null
}

const exitEditor = async (target: string): Promise<void> => {
  if (!editorStore.cancelSession()) {
    return
  }
  allowNavigation = true
  activeDialog.value = null
  pendingNavigation.value = null
  await navigateTo(target)
}

const confirmDialog = async (): Promise<void> => {
  if (activeDialog.value === 'recovery') {
    editorStore.restoreRecoveryDraft()
    activeDialog.value = null
    return
  }

  if (activeDialog.value === 'deleted-recovery') {
    if (editorStore.restoreOrphanedDraftAsNew()) {
      activeDialog.value = null
      announce('Черновик восстановлен. Сохраните его как новую заметку.')
    }
    return
  }

  if (activeDialog.value === 'deleted') {
    await exitEditor('/')
    return
  }

  if (activeDialog.value === 'delete' && props.noteId !== undefined) {
    const result = confirmDeletion()
    if (!result?.ok) {
      activeDialog.value = null
      if (result?.reason === 'not-found') {
        isNotFound.value = true
      }
      return
    }

    await exitEditor('/')
    return
  }

  const target = activeDialog.value === 'navigation'
    ? pendingNavigation.value ?? '/'
    : '/'
  await exitEditor(target)
}

const latestExternalNote = (): Note | null =>
  props.noteId === undefined ? null : notesStore.getNote(props.noteId)

const conflictReloadLatest = (): void => {
  const note = latestExternalNote()
  if (note && editorStore.resolveConflictReload(note)) {
    activeDialog.value = null
  }
}

const performSaveAsNew = async (): Promise<void> => {
  editorStore.commitText()
  const result = notesStore.createNote(editorStore.getInput())

  if (!result.ok) {
    isSaving.value = false
    activeDialog.value = null
    await handleSaveValidationFailure(result.reason)
    return
  }

  if (!editorStore.finishSession()) {
    activeDialog.value = null
    return
  }

  announce('Заметка создана.')
  allowNavigation = true
  activeDialog.value = null
  await navigateTo('/')
}

const conflictSaveAsNew = async (): Promise<void> => {
  await performSaveAsNew()
}

const conflictOverwrite = (): void => {
  const note = latestExternalNote()
  if (!note || props.noteId === undefined) {
    return
  }

  const result = notesStore.updateNote(props.noteId, editorStore.getInput(), { force: true })
  if (!result.ok) {
    if (result.reason === 'not-found') {
      activeDialog.value = null
      isNotFound.value = true
    }
    else if (result.reason === 'persistence') {
      activeDialog.value = null
      formError.value = 'Не удалось сохранить заметку. Попробуйте ещё раз.'
    }
    else if (result.reason === 'unchanged') {
      // Local content already equals the external revision: nothing to overwrite.
      if (!editorStore.finishSession()) {
        activeDialog.value = null
        return
      }
      announce('Изменения сохранены.')
      allowNavigation = true
      activeDialog.value = null
      void navigateTo('/')
    }
    return
  }

  if (!editorStore.finishSession()) {
    activeDialog.value = null
    return
  }

  announce('Изменения сохранены.')
  allowNavigation = true
  activeDialog.value = null
  void navigateTo('/')
}

const deletedSaveAsNew = async (): Promise<void> => {
  await performSaveAsNew()
}

const deletedExitWithoutSaving = async (): Promise<void> => {
  await exitEditor('/')
}

const handleStorageChange = (event: StorageEvent): void => {
  // A null key means storage.clear() wiped everything in another tab.
  if (event.key !== NOTES_STORAGE_KEY && event.key !== null) {
    return
  }

  if (!notesStore.refresh()) {
    return
  }

  if (props.noteId === undefined || !isReady.value) {
    return
  }

  const externalNote = notesStore.getNote(props.noteId)
  const outcome = editorStore.applyExternalChange(externalNote)

  if (outcome === 'deleted') {
    if (editorStore.isDirty) {
      activeDialog.value = 'deleted'
    }
    else {
      isNotFound.value = true
      editorStore.closeSession()
    }
  }
}

const handleBeforeUnload = (event: BeforeUnloadEvent): void => {
  if (!editorStore.isDirty) {
    return
  }

  event.preventDefault()
  event.returnValue = ''
}

const showHistoryMessage = (message: string): void => {
  historyMessage.value = message
  if (historyMessageTimeout !== null) {
    clearTimeout(historyMessageTimeout)
  }
  historyMessageTimeout = setTimeout(() => {
    historyMessage.value = null
    historyMessageTimeout = null
  }, 3000)
}

const historyOperationLabels: Record<HistoryOperationType, string> = {
  title: 'Изменение заголовка',
  'item-text': 'Изменение пункта',
  'item-completed': 'Изменение отметки пункта',
  'item-inserted': 'Добавление пункта',
  'item-removed': 'Удаление пункта',
}

const formatHistoryMessage = (result: HistoryResult): string =>
  `${historyOperationLabels[result.operation]} ${result.action === 'undo' ? 'отменено' : 'повторено'}.`

const undo = (): void => {
  const result = editorStore.undo()
  if (result) {
    showHistoryMessage(formatHistoryMessage(result))
  }
}

const redo = (): void => {
  const result = editorStore.redo()
  if (result) {
    showHistoryMessage(formatHistoryMessage(result))
  }
}

const isTextEditingTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement
  && target.matches([
    'textarea',
    '[contenteditable="true"]',
    'input:not([type])',
    'input[type="text"]',
    'input[type="search"]',
    'input[type="email"]',
    'input[type="url"]',
    'input[type="tel"]',
    'input[type="password"]',
  ].join(', '))

const handleHistoryShortcut = (event: KeyboardEvent): void => {
  if ((!event.ctrlKey && !event.metaKey) || event.altKey || isTextEditingTarget(event.target)) {
    return
  }

  const key = event.key.toLowerCase()
  if (key === 'z' && event.shiftKey) {
    event.preventDefault()
    redo()
  }
  else if (key === 'z') {
    event.preventDefault()
    undo()
  }
  else if (key === 'y') {
    event.preventDefault()
    redo()
  }
}

onBeforeRouteLeave((to) => {
  if (allowNavigation || !editorStore.isDirty) {
    return true
  }

  pendingNavigation.value = to.fullPath
  activeDialog.value = 'navigation'
  return false
})

const handlePageHide = (): void => {
  editorStore.persistDraft()
}

onMounted(() => {
  window.addEventListener('beforeunload', handleBeforeUnload)
  window.addEventListener('pagehide', handlePageHide)
  window.addEventListener('keydown', handleHistoryShortcut)
  window.addEventListener('storage', handleStorageChange)
})
onBeforeUnmount(() => {
  disposed = true
  window.removeEventListener('beforeunload', handleBeforeUnload)
  window.removeEventListener('pagehide', handlePageHide)
  window.removeEventListener('keydown', handleHistoryShortcut)
  window.removeEventListener('storage', handleStorageChange)
  if (historyMessageTimeout !== null) {
    clearTimeout(historyMessageTimeout)
  }
  editorStore.closeSession()
})
</script>

<template>
  <section class="note-editor-page">
    <p v-if="!isReady" class="note-editor-page__state">
      Загружаем заметку…
    </p>

    <div v-else-if="notesStore.error && !isNotFound" class="note-editor-page__state note-editor-page__state--error">
      <h1>Не удалось открыть заметку</h1>
      <p>{{ notesStore.error }}</p>
      <NuxtLink class="button button--secondary" to="/">Вернуться к заметкам</NuxtLink>
    </div>

    <div v-else-if="isNotFound" class="note-editor-page__state">
      <p class="note-editor-page__eyebrow">Ошибка</p>
      <h1>Заметка не найдена</h1>
      <p>Возможно, её удалили или адрес указан неверно.</p>
      <div class="note-editor-page__state-actions">
        <NuxtLink class="button button--secondary" to="/">Вернуться к заметкам</NuxtLink>
        <NuxtLink class="button button--primary" to="/notes/new">Создать заметку</NuxtLink>
      </div>
    </div>

    <template v-else>
      <header class="note-editor-page__header">
        <p class="note-editor-page__eyebrow">{{ pageTitle }}</p>
        <h1>{{ isEditing ? 'Измените заметку' : 'Что важно запомнить?' }}</h1>
        <p>Добавьте название и пункты. Изменения попадут в список только после сохранения.</p>
      </header>

      <p v-if="editorStore.isExternallyModified && editorStore.isDirty" class="note-editor-page__external">
        Заметка была изменена в другой вкладке. Ваши изменения не потеряны: при сохранении
        выберите, как поступить с конфликтом.
      </p>

      <p v-if="editorStore.isExternallyDeleted && editorStore.session" class="note-editor-page__external note-editor-page__external--danger">
        Заметка была удалена в другой вкладке. Ваша работа осталась в этом редакторе:
        сохраните её как новую заметку или выйдите без сохранения.
      </p>

      <form class="note-form" novalidate @submit.prevent="saveNote">
        <div class="field">
          <div class="field__label-row">
            <label for="note-title">Название</label>
            <span>{{ title.length }} / {{ NOTE_TITLE_MAX_LENGTH }}</span>
          </div>
          <input
            id="note-title"
            ref="titleInput"
            v-model="title"
            name="title"
            type="text"
            :maxlength="NOTE_TITLE_MAX_LENGTH"
            autocomplete="off"
            :class="{ 'field__input--invalid': Boolean(titleError) }"
            @input="clearErrors"
            @blur="editorStore.commitText"
          >
          <p id="note-title-help" class="field__help">
            Обязательное поле, до {{ NOTE_TITLE_MAX_LENGTH }} символов.
          </p>
          <p v-if="titleError" id="note-title-error" class="field__error">
            {{ titleError }}
          </p>
        </div>

        <fieldset class="items-editor">
          <legend>Список задач</legend>

          <p v-if="items.length === 0" class="items-editor__empty">
            Пунктов пока нет. Можно сохранить заметку без них.
          </p>

          <ol v-else class="items-editor__list">
            <li v-for="(item, index) in items" :key="item.id" class="item-row">
              <label class="item-row__checkbox">
                <span class="visually-hidden">Выполнено</span>
                <input
                  type="checkbox"
                  :checked="item.completed"
                  @change="updateItemCompleted(index, $event)"
                >
              </label>
              <div class="item-row__field">
                <label :for="`note-item-${item.id}`">Пункт {{ index + 1 }}</label>
                <input
                  :id="`note-item-${item.id}`"
                  type="text"
                  :value="item.text"
                  :maxlength="NOTE_ITEM_MAX_LENGTH"
                  @input="updateItemText(index, $event)"
                  @blur="editorStore.commitText"
                >
                <span :id="`note-item-count-${item.id}`" class="item-row__count">
                  {{ item.text.length }} / {{ NOTE_ITEM_MAX_LENGTH }}
                </span>
              </div>
              <button
                class="item-row__remove"
                type="button"
                @click="removeItem(index)"
              >
                Удалить
              </button>
            </li>
          </ol>

          <button class="button button--secondary" type="button" @click="addItem">
            Добавить пункт
          </button>
        </fieldset>

        <p v-if="formError" class="note-form__error">{{ formError }}</p>
        <p v-if="notesStore.error" class="note-form__error">{{ notesStore.error }}</p>
        <p v-if="editorStore.draftError" class="note-form__error">{{ editorStore.draftError }}</p>

        <div class="history-controls">
          <button
            class="button button--secondary"
            type="button"
            :disabled="!editorStore.canUndo"
            @click="undo"
          >
            Отменить изменение
          </button>
          <button
            class="button button--secondary"
            type="button"
            :disabled="!editorStore.canRedo"
            @click="redo"
          >
            Повторить изменение
          </button>
          <p v-if="historyMessage" class="history-controls__message">
            {{ historyMessage }}
          </p>
        </div>

        <div class="note-form__actions">
          <button
            class="button button--primary"
            type="submit"
            :disabled="isSaveDisabled"
            :title="isEditing && !isSaveDisabled ? undefined : isEditing ? 'Нет изменений для сохранения' : undefined"
          >
            {{ isSaving ? 'Сохраняем…' : 'Сохранить' }}
          </button>
          <button class="button button--secondary" type="button" @click="requestCancel">
            Отменить редактирование
          </button>
          <button
            v-if="isEditing"
            class="button button--danger"
            type="button"
            @click="requestDelete"
          >
            Удалить заметку
          </button>
        </div>
      </form>
    </template>

    <ConfirmDialog
      :open="activeDialog !== null"
      :title="dialogTitle"
      :description="dialogDescription"
      :confirm-label="dialogConfirmLabel"
      :cancel-label="dialogCancelLabel"
      :destructive="activeDialog === 'delete'"
      :custom-actions="activeDialog === 'conflict' || activeDialog === 'deleted'"
      @cancel="closeDialog"
      @confirm="confirmDialog"
    >
      <template v-if="activeDialog === 'conflict'" #actions>
        <button class="button button--secondary" type="button" @click="closeDialog">
          Продолжить редактирование
        </button>
        <button class="button button--secondary" type="button" @click="conflictReloadLatest">
          Загрузить актуальную версию
        </button>
        <button class="button button--secondary" type="button" @click="conflictSaveAsNew">
          Сохранить как новую заметку
        </button>
        <button class="button button--danger" type="button" @click="conflictOverwrite">
          Перезаписать изменения другой вкладки
        </button>
      </template>
      <template v-else-if="activeDialog === 'deleted'" #actions>
        <button class="button button--secondary" type="button" @click="deletedSaveAsNew">
          Сохранить как новую заметку
        </button>
        <button class="button button--danger" type="button" @click="deletedExitWithoutSaving">
          Выйти без сохранения
        </button>
      </template>
    </ConfirmDialog>
  </section>
</template>

<style scoped lang="scss">
.note-editor-page {
  display: grid;
  @include rem(gap, 32px);
  @include rem(max-width, 800px);
  padding-block: clamp(#{to-rem(40px)}, 8vw, #{to-rem(80px)});

  &__header {
    h1 {
      margin: 0;
      font-size: clamp(#{to-rem(36px)}, 7vw, #{to-rem(64px)});
      line-height: 1;
      letter-spacing: -0.05em;
    }

    > p:last-child {
      @include rem(max-width, 640px);
      @include rem(margin, 16px, 0px, 0px);
      color: var(--color-text-muted);
      line-height: 1.6;
    }
  }

  &__eyebrow {
    @include rem(margin, 0px, 0px, 10px);
    color: var(--color-accent-strong);
    font-weight: 800;
  }

  &__external {
    @include rem(margin, 0px);
    @include rem(padding, 14px, 16px);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-control);
    color: var(--color-text);
    background: var(--color-surface-muted);
    font-weight: 650;
    line-height: 1.5;

    &--danger {
      border-color: var(--color-danger);
      color: var(--color-danger);
    }
  }

  &__state {
    @include rem(padding, 24px);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-card);
    background: var(--color-surface);

    h1 {
      margin: 0;
    }

    > p:not(.note-editor-page__eyebrow) {
      @include rem(margin, 12px, 0px, 24px);
      color: var(--color-text-muted);
    }

    &--error h1 {
      color: var(--color-danger);
    }
  }

  &__state-actions {
    display: flex;
    flex-wrap: wrap;
    @include rem(gap, 12px);
  }
}

.note-form {
  display: grid;
  justify-items: stretch;
  @include rem(gap, 28px);
  padding: clamp(#{to-rem(20px)}, 4vw, #{to-rem(32px)});
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  background: var(--color-surface);
  box-shadow: var(--shadow-card);

  &__actions {
    display: flex;
    flex-wrap: wrap;
    @include rem(gap, 12px);
  }

  &__error {
    margin: 0;
    color: var(--color-danger);
    font-weight: 650;
  }

  .button {
    justify-self: start;

    &:disabled {
      cursor: not-allowed;
      opacity: 0.55;
      transform: none;
    }
  }
}

.history-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  @include rem(gap, 12px);

  &__message {
    flex-basis: 100%;
    margin: 0;
    color: var(--color-text-muted);
    font-weight: 650;
  }
}

.field {
  display: grid;
  @include rem(gap, 9px);

  &__label-row {
    display: flex;
    justify-content: space-between;
    @include rem(gap, 16px);

    label {
      font-weight: 750;
    }

    span {
      color: var(--color-text-muted);
      @include rem(font-size, 14px);
    }
  }

  input {
    width: 100%;
    @include rem(min-height, 48px);
    @include rem(padding, 11px, 14px);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-control);
    color: var(--color-text);
    background: var(--color-background);
    font: inherit;

    &.field__input--invalid {
      border-color: var(--color-danger);
    }
  }

  &__help,
  &__error {
    margin: 0;
    @include rem(font-size, 14px);
  }

  &__help {
    color: var(--color-text-muted);
  }

  &__error {
    color: var(--color-danger);
    font-weight: 650;
  }
}

.items-editor {
  display: grid;
  @include rem(gap, 16px);
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;

  legend {
    @include rem(margin-bottom, 12px);
    font-weight: 800;
    @include rem(font-size, 20px);
  }

  &__empty {
    margin: 0;
    color: var(--color-text-muted);
  }

  &__list {
    display: grid;
    @include rem(gap, 14px);
    margin: 0;
    padding: 0;
    list-style: none;
  }
}

.item-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  @include rem(gap, 12px);
  @include rem(padding, 12px);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  background: var(--color-surface-muted);

  &__checkbox {
    --hit-size: #{to-rem(44px)};
    --input-size: #{to-rem(22px)};

    display: grid;
    width: var(--hit-size);
    height: var(--hit-size);
    place-items: center;
    margin: calc((var(--hit-size) - var(--input-size)) / -2);
    cursor: pointer;

    input {
      width: var(--input-size);
      height: var(--input-size);
      margin: 0;
      accent-color: var(--color-accent-strong);
    }
  }

  &__field {
    display: grid;
    @include rem(gap, 6px);

    label,
    span {
      @include rem(font-size, 13px);
    }

    label {
      font-weight: 700;
    }

    input {
      width: 100%;
      @include rem(min-height, 44px);
      @include rem(padding, 9px, 12px);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-control);
      color: var(--color-text);
      background: var(--color-background);
      font: inherit;
    }
  }

  &__count {
    color: var(--color-text-muted);
  }

  &__remove {
    min-height: #{to-rem(44px)};
    padding-inline: #{to-rem(12px)};
    border: 1px solid currentColor;
    border-radius: var(--radius-control);
    color: var(--color-danger);
    background: transparent;
    cursor: pointer;
    font: inherit;
    font-weight: 700;
  }
}

@media (max-width: #{to-rem(640px)}) {
  .item-row {
    grid-template-columns: auto minmax(0, 1fr);

    &__remove {
      grid-column: 2;
      justify-self: start;
    }
  }
}
</style>
