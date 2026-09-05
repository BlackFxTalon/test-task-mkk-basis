import type { Draft, DraftRepository } from '../domain/draft'

interface DraftsEnvelope {
  schemaVersion: 1
  drafts: Draft[]
}

export const DRAFTS_STORAGE_KEY = 'basis-notes:drafts'

const cloneDraft = (draft: Draft): Draft => structuredClone(draft)

const isDraftsEnvelope = (value: unknown): value is DraftsEnvelope => {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<DraftsEnvelope>
  return candidate.schemaVersion === 1 && Array.isArray(candidate.drafts)
}

class BrowserDraftRepository implements DraftRepository {
  private readAll(): Draft[] {
    const serialized = localStorage.getItem(DRAFTS_STORAGE_KEY)
    if (serialized === null) {
      return []
    }

    const parsed: unknown = JSON.parse(serialized)
    if (!isDraftsEnvelope(parsed)) {
      throw new Error('Unsupported drafts storage format')
    }

    return parsed.drafts.map(cloneDraft)
  }

  private writeAll(drafts: Draft[]): void {
    localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify({
      schemaVersion: 1,
      drafts,
    } satisfies DraftsEnvelope))
  }

  read(sessionId: string): Draft | null {
    const draft = this.readAll().find(candidate => candidate.sessionId === sessionId)
    return draft ? cloneDraft(draft) : null
  }

  write(draft: Draft): void {
    const drafts = this.readAll()
      .filter(candidate => candidate.sessionId !== draft.sessionId)
    drafts.push(cloneDraft(draft))
    this.writeAll(drafts)
  }

  delete(sessionId: string): void {
    const current = this.readAll()
    const drafts = current.filter(candidate => candidate.sessionId !== sessionId)
    if (drafts.length !== current.length) {
      this.writeAll(drafts)
    }
  }

  deleteOlderThan(cutoff: string): void {
    const current = this.readAll()
    const drafts = current.filter(draft => draft.updatedAt >= cutoff)
    if (drafts.length !== current.length) {
      this.writeAll(drafts)
    }
  }
}

export const browserDraftRepository: DraftRepository = new BrowserDraftRepository()
