import type { D1Database, KVNamespace, Queue, Fetcher } from '@cloudflare/workers-types'

export interface Env {
  DB: D1Database
  SYNC_QUEUE: Queue<SyncJob>
  IDX_BASE_URL: string
  LOG_LEVEL: string
  // BROWSER + COOKIE_KV are optional so local dev (without --remote) and
  // testing degrade gracefully — code that uses them must null-check.
  BROWSER?: Fetcher
  COOKIE_KV?: KVNamespace
  ASSETS?: R2Bucket
}

export type R2Bucket = import('@cloudflare/workers-types').R2Bucket

export interface SyncJob {
  kind: SyncKind
  params?: SyncParams
}

export type SyncKind =
  | 'companyProfile'
  | 'securityStock'
  | 'companySuspend'
  | 'companyRelisting'
  | 'tradeSummary'
  | 'dealerParticipant'
  | 'profileParticipant'
  | 'brokerParticipant'
  | 'indexList'
  | 'stockScreener'
  | 'additionalListing'
  | 'companyDelisting'
  | 'foreignTrading'
  | 'companyDividend'
  | 'financialRatio'
  | 'topGainer'
  | 'topLoser'
  | 'rightOffering'
  | 'industryTrading'
  | 'newListing'
  | 'stockSplit'
  | 'companyAnnouncement'

export interface SyncParams {
  year?: number
  month?: number
  date?: string
  code?: string
}

export interface PaginationParams {
  limit: number
  offset: number
  includeTotal: boolean
}

export interface PaginatedMeta {
  limit: number
  offset: number
  total?: number
}

export interface PaginatedEnvelope<T> {
  data: T[]
  meta: PaginatedMeta
}
