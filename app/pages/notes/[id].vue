<script setup lang="ts">
const route = useRoute()
const noteId = computed(() => Array.isArray(route.params.id) ? route.params.id[0] : route.params.id)

useHead({ title: 'Редактирование заметки' })
</script>

<template>
  <NoteEditor v-if="noteId" :note-id="noteId" />
</template>
