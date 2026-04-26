// Company announcements for a single date — fetched via dateFrom=dateTo=date
// (upstream pattern). Heavy because it joins announcement + attachments.
import type { D1Database } from '@cloudflare/workers-types'
import type { IdxClient } from '../lib/client.ts'
import { getDb, schemas } from '../lib/db.ts'
import { IDX_BASE, batchUpsert, fetchIdxJson } from './_helpers.ts'

interface AnnouncementRaw {
  pengumuman: {
    Id2: string
    NoPengumuman: string
    TglPengumuman: string
    JudulPengumuman: string
    JenisPengumuman: string
    Kode_Emiten?: string
    CreatedDate: string
    Form_Id: string
    PerihalPengumuman?: string
    EfekEmiten_Saham?: boolean
    EfekEmiten_Obligasi?: boolean
  }
  attachments?: { PDFFilename?: string; FullSavePath?: string; OriginalFilename?: string; IsAttachment?: boolean }[]
}

interface AnnouncementResponse {
  Replies?: AnnouncementRaw[]
}

export async function syncCompanyAnnouncement(
  d1: D1Database,
  client: IdxClient,
  date: string
): Promise<{ count: number }> {
  const url = `${IDX_BASE}/primary/ListedCompany/GetAnnouncement?kodeEmiten=&indexFrom=0&pageSize=9999&dateFrom=${date}&dateTo=${date}&lang=id`
  const raw = await fetchIdxJson<AnnouncementResponse>(client, url)
  if (!raw?.Replies?.length) return { count: 0 }

  const rows = raw.Replies
    .filter((item) => item.pengumuman?.Id2 && item.pengumuman?.Kode_Emiten && item.pengumuman?.TglPengumuman)
    .map((item) => ({
      id: item.pengumuman.Id2,
      number: item.pengumuman.NoPengumuman,
      date: new Date(item.pengumuman.TglPengumuman).getTime(),
      title: item.pengumuman.JudulPengumuman,
      type: item.pengumuman.JenisPengumuman,
      companyCode: (item.pengumuman.Kode_Emiten as string).trim(),
      createdDate: new Date(item.pengumuman.CreatedDate).getTime(),
      formId: item.pengumuman.Form_Id,
      subject: item.pengumuman.PerihalPengumuman ?? null,
      isStock: Boolean(item.pengumuman.EfekEmiten_Saham),
      isBond: Boolean(item.pengumuman.EfekEmiten_Obligasi),
      attachments: JSON.stringify(
        (item.attachments ?? []).map((att) => ({
          filename: att.PDFFilename,
          url: att.FullSavePath,
          originalName: att.OriginalFilename,
          isAttachment: att.IsAttachment
        }))
      )
    }))

  const db = getDb(d1)
  const count = await batchUpsert(db, rows, (row) =>
    db.insert(schemas.companyAnnouncement).values(row).onConflictDoUpdate({
      target: schemas.companyAnnouncement.id,
      set: row
    })
  )
  return { count }
}
