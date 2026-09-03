<script setup lang="ts">
const themeOptions = [
  { value: 'system', label: 'Системная' },
  { value: 'light', label: 'Светлая' },
  { value: 'dark', label: 'Тёмная' },
] as const

const { theme, setTheme } = useTheme()

const indicatorStyle = computed(() => {
  const activeIndex = Math.max(
    themeOptions.findIndex(option => option.value === theme.value),
    0,
  )

  return {
    transform: `translate3d(${activeIndex * 3}rem, 0, 0)`,
  }
})
</script>

<template>
  <div class="theme-switcher">
    <span
      class="theme-switcher__indicator"
      :style="indicatorStyle"
      aria-hidden="true"
    />
    <button
      v-for="option in themeOptions"
      :key="option.value"
      class="theme-switcher__option"
      type="button"
      :aria-label="`Тема: ${option.label}`"
      :title="option.label"
      :aria-pressed="theme === option.value"
      @click="setTheme(option.value)"
    >
      <svg
        v-if="option.value === 'system'"
        class="theme-switcher__icon"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M8 20h8M12 16v4" />
      </svg>
      <svg
        v-else-if="option.value === 'light'"
        class="theme-switcher__icon"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41" />
      </svg>
      <svg
        v-else
        class="theme-switcher__icon"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
      </svg>
    </button>
  </div>
</template>

<style scoped lang="scss">
.theme-switcher {
  position: relative;
  display: inline-grid;
  grid-template-columns: repeat(3, 2.75rem);
  gap: 0.25rem;
  padding: 0.25rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  background: var(--color-surface-muted);

  &__indicator {
    position: absolute;
    top: 0.25rem;
    left: 0.25rem;
    width: 2.75rem;
    height: 2.75rem;
    border-radius: var(--radius-pill);
    background: var(--color-accent);
    box-shadow: var(--shadow-control);
    pointer-events: none;
    transition: transform 280ms cubic-bezier(0.22, 1, 0.36, 1);
    will-change: transform;
  }

  &__option {
    position: relative;
    z-index: 1;
    display: grid;
    min-width: 2.75rem;
    min-height: 2.75rem;
    padding: 0.5rem;
    place-items: center;
    border: 0;
    border-radius: var(--radius-pill);
    color: var(--color-text-muted);
    background: transparent;
    cursor: pointer;
    font: inherit;
    transition: color 160ms ease, background-color 160ms ease, box-shadow 160ms ease;

    &[aria-pressed='true'] {
      color: var(--color-on-accent);
    }

    &:hover:not([aria-pressed='true']) {
      color: var(--color-text);
      background: var(--color-surface);
    }
  }

  &__icon {
    width: 1.25rem;
    height: 1.25rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
}
</style>
