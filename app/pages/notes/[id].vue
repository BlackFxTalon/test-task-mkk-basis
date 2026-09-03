<script setup lang="ts">
const route = useRoute()

useHead({ title: 'Редактирование заметки' })
</script>

<template>
  <section class="placeholder-page" >
    <p class="placeholder-page__eyebrow">Заметка {{ route.params.id }}</p>
    <h1 class="page-title">Редактирование заметки</h1>
    <p>Редактор появится на следующем этапе реализации.</p>
    <NuxtLink class="button button--secondary" to="/">Вернуться к заметкам</NuxtLink>
  </section>
</template>
