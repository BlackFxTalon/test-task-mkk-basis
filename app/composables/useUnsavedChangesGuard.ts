export const useUnsavedChangesGuard = (options: {
  isDirty: () => boolean
  persistDraft: () => void
  onBlockedNavigation: (target: string) => void
}) => {
  let allowNavigation = false

  const permitNavigation = (): void => {
    allowNavigation = true
  }

  const handleBeforeUnload = (event: BeforeUnloadEvent): void => {
    if (!options.isDirty()) {
      return
    }

    event.preventDefault()
    event.returnValue = ''
  }

  const handlePageHide = (): void => {
    options.persistDraft()
  }

  onBeforeRouteLeave((to) => {
    if (allowNavigation || !options.isDirty()) {
      return true
    }

    options.onBlockedNavigation(to.fullPath)
    return false
  })

  onMounted(() => {
    window.addEventListener('beforeunload', handleBeforeUnload)
    window.addEventListener('pagehide', handlePageHide)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('beforeunload', handleBeforeUnload)
    window.removeEventListener('pagehide', handlePageHide)
  })

  return {
    permitNavigation,
  }
}
