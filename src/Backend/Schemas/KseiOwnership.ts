import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/**
 * KSEI ownership composition schema.
 * @description Monthly snapshot of share ownership per ticker, broken down
 * by investor type (IS/CP/PF/IB/ID/MF/SC/FD/OT) and local vs foreign.
 * Source: web.ksei.co.id BalanceposEfek{YYYYMMDD}.zip
 */
export const kseiOwnership = sqliteTable('ksei_ownership', {
  /** Composite identifier: code-reportDate(YYYYMMDD) */
  id: text('id').primaryKey(),
  /** Security ticker code (e.g. BBCA) */
  code: text('code').notNull(),
  /** Security type: EQUITY, BOND, WARRANT, etc. */
  type: text('type').notNull(),
  /** Snapshot date (last business day of month, epoch ms UTC) */
  reportDate: integer('report_date').notNull(),
  /** Total listed/outstanding shares as numeric */
  totalShares: real('total_shares').notNull(),
  /** Reference price at snapshot (IDR) */
  price: real('price'),

  // Local investor breakdown
  /** Local Individual */
  localIs: real('local_is'),
  /** Local Corporate */
  localCp: real('local_cp'),
  /** Local Pension Fund */
  localPf: real('local_pf'),
  /** Local Insurance/Bank */
  localIb: real('local_ib'),
  /** Local Insurance */
  localId: real('local_id'),
  /** Local Mutual Fund */
  localMf: real('local_mf'),
  /** Local Securities Company */
  localSc: real('local_sc'),
  /** Local Foundation */
  localFd: real('local_fd'),
  /** Local Others */
  localOt: real('local_ot'),
  /** Local total (sum of all local breakdown columns) */
  localTotal: real('local_total'),

  // Foreign investor breakdown
  /** Foreign Individual */
  foreignIs: real('foreign_is'),
  /** Foreign Corporate */
  foreignCp: real('foreign_cp'),
  /** Foreign Pension Fund */
  foreignPf: real('foreign_pf'),
  /** Foreign Insurance/Bank */
  foreignIb: real('foreign_ib'),
  /** Foreign Insurance */
  foreignId: real('foreign_id'),
  /** Foreign Mutual Fund */
  foreignMf: real('foreign_mf'),
  /** Foreign Securities Company */
  foreignSc: real('foreign_sc'),
  /** Foreign Foundation */
  foreignFd: real('foreign_fd'),
  /** Foreign Others */
  foreignOt: real('foreign_ot'),
  /** Foreign total (sum of all foreign breakdown columns) */
  foreignTotal: real('foreign_total')
})
