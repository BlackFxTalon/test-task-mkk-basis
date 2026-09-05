<script setup lang="ts">
import {
  NOTE_ITEM_MAX_LENGTH,
  NOTE_TITLE_MAX_LENGTH,
  type TodoItem,
} from '../domain/note'
import type { HistoryOperationType, HistoryResult } from '../domain/noteHistory'
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
const activeDialog = ref<'cancel' | 'delete' | 'navigation' | 'recovery' | null>(null)
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
      isNotFound.value = true
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

  if (editorStore.recoveryDraft) {
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

const saveNote = async (): Promise<void> => {
  isSaving.value = true
  clearErrors()
  editorStore.commitText()

  const result = props.noteId === undefined
    ? notesStore.createNote(editorStore.getInput())
    : notesStore.updateNote(props.noteId, editorStore.getInput())

  if (!result.ok && result.reason !== 'unchanged') {
    isSaving.value = false

    if (result.reason === 'title-required') {
      titleError.value = 'Введите название заметки.'
      await focusInvalidTitle()
    }
    else if (result.reason === 'title-too-long') {
      titleError.value = `Название не должно быть длиннее ${NOTE_TITLE_MAX_LENGTH} символов.`
      await focusInvalidTitle()
    }
    else if (result.reason === 'item-too-long') {
      formError.value = `Текст пункта не должен быть длиннее ${NOTE_ITEM_MAX_LENGTH} символов.`
    }
    else if (result.reason === 'not-found') {
      isNotFound.value = true
    }
    else if (result.reason === 'persistence') {
      formError.value = 'Не удалось сохранить заметку. Попробуйте ещё раз.'
    }

    return
  }

  if (!editorStore.finishSession()) {
    isSaving.value = false
    return
  }

  if (result.ok) {
    announce(isEditing.value ? 'Изменения сохранены.' : 'Заметка создана.')
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
})
onBeforeUnmount(() => {
  disposed = true
  window.removeEventListener('beforeunload', handleBeforeUnload)
  window.removeEventListener('pagehide', handlePageHide)
  window.removeEventListener('keydown', handleHistoryShortcut)
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
              <input
                class="item-row__checkbox"
                type="checkbox"
                :checked="item.completed"
                @change="updateItemCompleted(index, $event)"
              >
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
      @cancel="closeDialog"
      @confirm="confirmDialog"
    />
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
    @include rem(width, 22px);
    @include rem(height, 22px);
    margin: 0;
    accent-color: var(--color-accent-strong);
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
