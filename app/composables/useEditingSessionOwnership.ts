interface SessionProbeMessage {
  type: 'probe'
  requestId: string
  sessionId: string
  ownerId: string
}

interface SessionOccupiedMessage {
  type: 'occupied'
  requestId: string
  sessionId: string
  ownerId: string
  claimantId: string
}

type SessionOwnershipMessage = SessionProbeMessage | SessionOccupiedMessage

const CHANNEL_NAME = 'basis-notes:editing-sessions'
const CLAIM_WAIT_MS = 120

const isSessionOwnershipMessage = (value: unknown): value is SessionOwnershipMessage => {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<SessionProbeMessage> & Partial<SessionOccupiedMessage>
  return (candidate.type === 'probe' || candidate.type === 'occupied')
    && typeof candidate.requestId === 'string'
    && typeof candidate.sessionId === 'string'
    && typeof candidate.ownerId === 'string'
    && (candidate.type === 'probe' || typeof candidate.claimantId === 'string')
}

export const useEditingSessionOwnership = () => {
  const ownerId = crypto.randomUUID()
  const channel = typeof BroadcastChannel === 'undefined'
    ? null
    : new BroadcastChannel(CHANNEL_NAME)
  const occupiedRequests = new Set<string>()
  let activeSessionId: string | null = null

  if (channel) {
    channel.onmessage = (event: MessageEvent<unknown>): void => {
      if (!isSessionOwnershipMessage(event.data) || event.data.ownerId === ownerId) {
        return
      }

      if (event.data.type === 'probe' && event.data.sessionId === activeSessionId) {
        channel.postMessage({
          type: 'occupied',
          requestId: event.data.requestId,
          sessionId: event.data.sessionId,
          ownerId,
          claimantId: event.data.ownerId,
        } satisfies SessionOccupiedMessage)
      }
      else if (event.data.type === 'occupied' && event.data.claimantId === ownerId) {
        occupiedRequests.add(event.data.requestId)
      }
    }
  }

  const claimRequestedSession = async (sessionId: string | undefined): Promise<string | undefined> => {
    if (!sessionId || !channel) {
      return sessionId
    }

    activeSessionId = sessionId
    const requestId = crypto.randomUUID()
    channel.postMessage({
      type: 'probe',
      requestId,
      sessionId,
      ownerId,
    } satisfies SessionProbeMessage)

    await new Promise(resolve => setTimeout(resolve, CLAIM_WAIT_MS))
    const occupied = occupiedRequests.delete(requestId)
    if (occupied) {
      activeSessionId = null
      return undefined
    }

    return sessionId
  }

  const ownSession = (sessionId: string): void => {
    activeSessionId = sessionId
  }

  const releaseSession = (): void => {
    activeSessionId = null
    channel?.close()
  }

  onBeforeUnmount(releaseSession)

  return {
    claimRequestedSession,
    ownSession,
  }
}
