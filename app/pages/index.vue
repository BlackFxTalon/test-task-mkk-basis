<script setup lang="ts">
useHead({ title: 'Заметки' })
</script>

<template>
  <section class="hero" >
    <h1 class="page-title">Ваши заметки</h1>
    <p class="hero__description">
      Каркас приложения готов. Создание и список заметок появятся на следующем этапе.
    </p>
    <NuxtLink class="button button--primary" to="/notes/new">
      Открыть маршрут создания
    </NuxtLink>
  </section>
</template>

<style scoped lang="scss">
.hero {
  display: grid;
  justify-items: start;
  max-width: 44rem;
  padding-block: clamp(3rem, 10vw, 7rem) 2.5rem;

  h1 {
    margin: 0;
    font-size: clamp(2.5rem, 8vw, 5rem);
    line-height: 0.98;
    letter-spacing: -0.055em;
  }

  &__description {
    max-width: 36rem;
    margin: 1.25rem 0 2rem;
    color: var(--color-text-muted);
    font-size: clamp(1rem, 2vw, 1.25rem);
    line-height: 1.65;
  }
}
</style>
