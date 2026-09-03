<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useNotesStore } from '../stores/notes'

useHead({ title: 'Заметки' })

const notesStore = useNotesStore()
const { notes, isInitialized, error } = storeToRefs(notesStore)
const { message } = useOperationStatus()

onMounted(() => {
  notesStore.initialize()
})
</script>

<template>
  <section class="notes-page">
    <p v-if="message" class="status-message" role="status" aria-live="polite">
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

    <p v-if="!isInitialized" class="notes-page__state" role="status">
      Загружаем заметки…
    </p>

    <p v-else-if="error" class="notes-page__error" role="alert">
      {{ error }}
    </p>

    <div v-else-if="notes.length === 0" class="empty-state">
      <span class="empty-state__icon" aria-hidden="true">✦</span>
      <h2>Заметок пока нет</h2>
      <p>Создайте первую заметку, чтобы собрать важное в одном месте.</p>
      <NuxtLink class="button button--primary" to="/notes/new">
        Создать первую заметку
      </NuxtLink>
    </div>

    <div v-else class="notes-grid">
      <NoteCard v-for="note in notes" :key="note.id" :note="note" />
    </div>
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

  &__error {
    color: var(--color-danger);
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
