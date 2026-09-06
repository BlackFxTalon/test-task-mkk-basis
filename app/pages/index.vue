<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { NOTES_STORAGE_KEY } from '../repositories/browserNotesRepository'
import { useNotesStore } from '../stores/notes'

useHead({ title: 'Заметки' })

const notesStore = useNotesStore()
const { notes, isInitialized, error, storageBlocker } = storeToRefs(notesStore)
const { message } = useOperationStatus()
const {
  notePendingDeletion,
  deletionDescription,
  requestDeletion,
  cancelDeletion,
  confirmDeletion,
} = useNoteDeletion()
const isResetPending = ref(false)

const blockerReason = computed(() =>
  storageBlocker.value?.kind === 'future-version'
    ? 'Сохранённые данные созданы более новой версией приложения. Обновите приложение или сбросьте сохранённые данные заметок, чтобы продолжить работу в этой версии.'
    : storageBlocker.value?.kind === 'blocked'
      ? 'Браузер запретил доступ к хранилищу. Сброс возможен только после возврата доступа: разрешите сайту сохранять данные и обновите страницу.'
      : 'Сохранённые данные заметок не удалось прочитать. Сброс вернёт приложение в рабочее состояние, но удалит сохранённые заметки.',
)

const requestReset = (): void => {
  isResetPending.value = true
}

const cancelReset = (): void => {
  isResetPending.value = false
}

const confirmReset = (): void => {
  isResetPending.value = false
  const result = notesStore.resetSavedNotes()

  if (result.ok) {
    message.value = 'Сохранённые данные заметок сброшены.'
  }
}

const handleStorageChange = (event: StorageEvent): void => {
  // A null key means storage.clear() wiped everything in another tab.
  if (event.key !== NOTES_STORAGE_KEY && event.key !== null) {
    return
  }

  notesStore.refresh()
}

onMounted(() => {
  notesStore.initialize()
  window.addEventListener('storage', handleStorageChange)
})

onBeforeUnmount(() => {
  window.removeEventListener('storage', handleStorageChange)
})
</script>

<template>
  <section class="notes-page">
    <p v-if="message" class="status-message">
      {{ message }}
    </p>

    <header class="notes-page__header">
      <div>
        <p class="notes-page__eyebrow">Локально в браузере</p>
        <h1 class="page-title">Ваши заметки</h1>
      </div>
      <NuxtLink
        v-if="isInitialized && !error && notes.length > 0"
        class="button button--primary"
        to="/notes/new"
      >
        Создать заметку
      </NuxtLink>
    </header>

    <p v-if="!isInitialized" class="notes-page__state">
      Загружаем заметки…
    </p>

    <div v-if="isInitialized && error" class="notes-page__error notes-page__error-box">
      <p>{{ error }}</p>
      <button
        v-if="storageBlocker"
        class="button button--danger"
        type="button"
        @click="requestReset"
      >
        Сбросить данные заметок
      </button>
    </div>

    <div v-if="isInitialized && !error && notes.length === 0" class="empty-state">
      <span class="empty-state__icon">✦</span>
      <h2>Заметок пока нет</h2>
      <p>Создайте первую заметку, чтобы собрать важное в одном месте.</p>
      <NuxtLink class="button button--primary" to="/notes/new">
        Создать первую заметку
      </NuxtLink>
    </div>

    <div v-else-if="isInitialized && notes.length > 0" class="notes-grid">
      <NoteCard
        v-for="note in notes"
        :key="note.id"
        :note="note"
        @delete="requestDeletion"
      />
    </div>

    <ConfirmDialog
      :open="isResetPending"
      title="Сбросить сохранённые данные заметок?"
      :description="blockerReason"
      confirm-label="Сбросить данные"
      destructive
      @cancel="cancelReset"
      @confirm="confirmReset"
    />

    <ConfirmDialog
      :open="notePendingDeletion !== null"
      title="Удалить заметку?"
      :description="deletionDescription"
      confirm-label="Удалить заметку"
      destructive
      @cancel="cancelDeletion"
      @confirm="confirmDeletion"
    />
  </section>
</template>

<style scoped lang="scss">
.notes-page {
  display: grid;
  @include rem(gap, 32px);
  padding-block: clamp(#{to-rem(40px)}, 8vw, #{to-rem(80px)});

  &__header {
    display: flex;
    align-items: end;
    justify-content: space-between;
    @include rem(gap, 24px);
  }

  &__eyebrow {
    @include rem(margin, 0px, 0px, 9.6px);
    color: var(--color-accent-strong);
    font-weight: 800;
  }

  h1 {
    margin: 0;
    font-size: clamp(#{to-rem(40px)}, 7vw, #{to-rem(72px)});
    line-height: 1;
    letter-spacing: -0.055em;
  }

  &__state,
  &__error {
    margin: 0;
    @include rem(padding, 16px, 20px);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-control);
    background: var(--color-surface);
  }

  &__error-box {
    display: grid;
    justify-items: start;
    @include rem(gap, 16px);
    border-color: var(--color-danger);
    color: var(--color-danger);

    p {
      margin: 0;
      line-height: 1.5;
    }
  }
}

.status-message {
  margin: 0;
  @include rem(padding, 14.4px, 16px);
  border: 1px solid var(--color-brand-cyan);
  border-radius: var(--radius-control);
  background: var(--color-surface-muted);
  font-weight: 700;
}

.empty-state {
  display: grid;
  justify-items: start;
  @include rem(max-width, 672px);
  padding: clamp(#{to-rem(24px)}, 5vw, #{to-rem(48px)});
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  background: var(--color-surface);
  box-shadow: var(--shadow-card);

  &__icon {
    display: grid;
    @include rem(width, 48px);
    @include rem(height, 48px);
    place-items: center;
    border-radius: 50%;
    color: var(--color-on-accent);
    background: var(--color-accent);
    @include rem(font-size, 22.4px);
  }

  h2 {
    @include rem(margin, 20px, 0px, 0px);
    font-size: clamp(#{to-rem(25.6px)}, 4vw, #{to-rem(36px)});
  }

  p {
    @include rem(max-width, 512px);
    @include rem(margin, 12px, 0px, 24px);
    color: var(--color-text-muted);
    line-height: 1.6;
  }
}

.notes-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, #{to-rem(320px)}), 1fr));
  @include rem(gap, 20px);
}

@media (max-width: #{to-rem(640px)}) {
  .notes-page__header {
    display: grid;
    align-items: start;
  }
}
</style>
