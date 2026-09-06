<script setup lang="ts">
import {
  NOTE_ITEM_MAX_LENGTH,
  NOTE_TITLE_MAX_LENGTH,
  type Note,
  type TodoItem,
} from '../domain/note'
import { useNoteEditorStore } from '../stores/noteEditor'
import { useNotesStore } from '../stores/notes'
import type { EditorDialogKind } from './NoteEditor/EditorDialogs.vue'

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

const { permitNavigation } = useUnsavedChangesGuard({
  isDirty: () => editorStore.isDirty,
  persistDraft: () => editorStore.persistDraft(),
  onBlockedNavigation: (target) => {
    pendingNavigation.value = target
    activeDialog.value = 'navigation'
  },
})

const isReady = ref(false)
const isSaving = ref(false)
const isNotFound = ref(false)
const titleError = ref<string | null>(null)
const formError = ref<string | null>(null)
const activeDialog = ref<EditorDialogKind | null>(null)
const pendingNavigation = ref<string | null>(null)

let disposed = false

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

const dialogDescription = computed(() => {
  if (activeDialog.value === 'delete') {
    return deletionDescription.value
  }
  if (activeDialog.value === 'recovery') {
    return 'Для этой вкладки найдены несохранённые изменения. Их можно восстановить или удалить.'
  }
  if (activeDialog.value === 'conflict') {
    return 'Пока вы редактировали заметку, её сохранили в другой вкладке. Выберите, как поступить с вашими изменениями.'
  }
  if (activeDialog.value === 'deleted') {
    return 'Заметку удалили, пока вы её редактировали. Ваша работа осталась в этом редакторе: сохраните её как новую заметку или выйдите без сохранения.'
  }
  if (activeDialog.value === 'deleted-recovery') {
    return 'Эта заметка больше не существует, но для вкладки найден её несохранённый черновик. Его можно восстановить как новую заметку или удалить.'
  }
  return 'Несохранённые изменения будут потеряны.'
})

const sessionIdFromRoute = (): string | undefined => {
  const value = route.query.session
  const sessionId = Array.isArray(value) ? value[0] : value
  return typeof sessionId === 'string' && sessionId.length > 0 ? sessionId : undefined
}

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

const updateItemText = (index: number, value: string): void => {
  editorStore.setItemText(index, value)
  formError.value = null
}

const updateItemCompleted = (index: number, completed: boolean): void => {
  editorStore.setItemCompleted(index, completed)
  formError.value = null
}

const clearErrors = (): void => {
  titleError.value = null
  formError.value = null
}

const titleField = useTemplateRef<{ focus: () => void }>('titleField')

const focusInvalidTitle = async (): Promise<void> => {
  await nextTick()
  titleField.value?.focus()
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
  permitNavigation()
  await navigateTo('/')
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
  permitNavigation()
  activeDialog.value = null
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
  permitNavigation()
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
      permitNavigation()
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
  permitNavigation()
  activeDialog.value = null
  void navigateTo('/')
}

const deletedExitWithoutSaving = async (): Promise<void> => {
  await exitEditor('/')
}

const { historyMessage, undo, redo } = useNoteHistoryControls(editorStore)

useCrossTabNoteSync({
  noteId: () => props.noteId,
  isReady: () => isReady.value,
  onNoteDeleted: (hasLocalChanges) => {
    if (hasLocalChanges) {
      activeDialog.value = 'deleted'
    }
    else {
      isNotFound.value = true
      editorStore.closeSession()
    }
  },
})

onBeforeUnmount(() => {
  disposed = true
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
        <NoteTitleField
          ref="titleField"
          v-model="title"
          :error="titleError"
          @clear-error="clearErrors"
          @commit="editorStore.commitText"
        />

        <NoteItemsEditor
          :items="items"
          @add="addItem"
          @remove="removeItem"
          @update-text="updateItemText"
          @update-completed="updateItemCompleted"
          @commit-text="editorStore.commitText"
        />

        <p v-if="formError" class="note-form__error">{{ formError }}</p>
        <p v-if="notesStore.error" class="note-form__error">{{ notesStore.error }}</p>
        <p v-if="editorStore.draftError" class="note-form__error">{{ editorStore.draftError }}</p>

        <NoteHistoryControls
          :can-undo="editorStore.canUndo"
          :can-redo="editorStore.canRedo"
          :message="historyMessage"
          @undo="undo"
          @redo="redo"
        />

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

    <EditorDialogs
      v-if="activeDialog !== null"
      :key="activeDialog"
      :kind="activeDialog"
      :description="dialogDescription"
      @cancel="closeDialog"
      @confirm="confirmDialog"
      @restore-latest="conflictReloadLatest"
      @save-as-new="conflictSaveAsNew"
      @overwrite-external="conflictOverwrite"
      @exit-without-saving="deletedExitWithoutSaving"
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
</style>
