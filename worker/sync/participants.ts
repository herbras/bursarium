// Three participant syncs — broker, dealer (primary), profile (member firm).
// Bundled because they share fetcher shape.
import type { D1Database } from '@cloudflare/workers-types'
import type { IdxClient } from '../lib/client.ts'
import { getDb, schemas } from '../lib/db.ts'
import { IDX_BASE, batchUpsert, fetchIdxJson } from './_helpers.ts'

interface MemberRaw {
  Code: string
  Name: string
  License?: string
  IsPd?: number
}

interface BrokerResponse {
  data: MemberRaw[]
}

interface PaginatedResp {
  data: MemberRaw[]
}

export async function syncParticipantBroker(
  d1: D1Database,
  client: IdxClient
): Promise<{ count: number }> {
  const url = `${IDX_BASE}/primary/ExchangeMember/GetBrokerSearch?start=0&length=9999`
  const raw = await fetchIdxJson<BrokerResponse>(client, url)
  if (!raw?.data?.length) return { count: 0 }

  const db = getDb(d1)
  const rows = raw.data
    .filter((item) => item.Code && item.Name)
    .map((item) => ({
      code: item.Code,
      name: item.Name,
      license: item.License ?? null
    }))

  const count = await batchUpsert(rows, (row) =>
    db
      .insert(schemas.participantBroker)
      .values(row)
      .onConflictDoUpdate({
        target: schemas.participantBroker.code,
        set: { name: row.name, license: row.license }
      })
  )
  return { count }
}

export async function syncParticipantDealer(
  d1: D1Database,
  client: IdxClient
): Promise<{ count: number }> {
  const url = `${IDX_BASE}/primary/ExchangeMember/GetPrimaryDealerSearch?start=0&length=9999&codeName=&license=`
  const raw = await fetchIdxJson<PaginatedResp>(client, url)
  if (!raw?.data?.length) return { count: 0 }

  const db = getDb(d1)
  const rows = raw.data
    .filter((item) => item.Code && item.Name)
    .map((item) => ({
      code: item.Code,
      name: item.Name,
      license: item.License ?? null,
      isPrimary: item.IsPd === 1
    }))

  const count = await batchUpsert(rows, (row) =>
    db
      .insert(schemas.participantDealer)
      .values(row)
      .onConflictDoUpdate({
        target: schemas.participantDealer.code,
        set: { name: row.name, license: row.license, isPrimary: row.isPrimary }
      })
  )
  return { count }
}

export async function syncParticipantProfile(
  d1: D1Database,
  client: IdxClient
): Promise<{ count: number }> {
  const url = `${IDX_BASE}/primary/ExchangeMember/GetParticipantSearch?start=0&length=9999&codeName=&license=`
  const raw = await fetchIdxJson<PaginatedResp>(client, url)
  if (!raw?.data?.length) return { count: 0 }

  const db = getDb(d1)
  const rows = raw.data
    .filter((item) => item.Code && item.Name)
    .map((item) => ({
      code: item.Code,
      name: item.Name,
      license: item.License ?? null,
      isPrimary: item.IsPd === 1
    }))

  const count = await batchUpsert(rows, (row) =>
    db
      .insert(schemas.participantProfile)
      .values(row)
      .onConflictDoUpdate({
        target: schemas.participantProfile.code,
        set: { name: row.name, license: row.license, isPrimary: row.isPrimary }
      })
  )
  return { count }
}
