import { Hono } from 'hono'
import type { Env } from '../lib/types.ts'

const resourceTree = {
  health: 'GET',
  companies: {
    '': 'GET limit, offset, total?',
    ':code': {
      '': 'GET',
      announcements: 'GET limit, offset, total?',
      'financial-reports': 'GET limit, offset, total?',
      'issued-history': 'GET limit, offset, total?'
    }
  },
  securities: 'GET limit, offset, total?, code?, board?',
  announcements: 'GET limit, offset, total?, dateFrom?, dateTo?, companyCode?',
  'stock-screener': 'GET limit, offset, total?',
  suspend: 'GET limit, offset, total?',
  relisting: 'GET limit, offset, total?',
  market: {
    indices: {
      '': 'GET limit, offset, total?',
      ':code': {
        chart: 'GET limit, offset, total?, period? (1D|1W|1M|1Q|1Y)'
      }
    },
    calendar: 'GET date= (YYYYMMDD), limit, offset, total?',
    'daily-index': 'GET year, month, limit, offset, total?',
    'sectoral-movement': 'GET year, month, limit, offset, total?',
    'index-summary': 'GET date= (YYYYMMDD), limit, offset, total?'
  },
  trading: {
    summary: 'GET limit, offset, total?',
    'stock-summary': 'GET date= (YYYYMMDD), limit, offset, total?',
    'broker-summary': 'GET date= (YYYYMMDD), limit, offset, total?',
    'top-gainer': 'GET year, month, limit, offset, total?',
    'top-loser': 'GET year, month, limit, offset, total?',
    domestic: 'GET year, month, limit, offset, total?',
    foreign: 'GET year, month, limit, offset, total?',
    'active-volume': 'GET year, month, limit, offset, total?',
    'active-value': 'GET year, month, limit, offset, total?',
    'active-frequency': 'GET year, month, limit, offset, total?',
    industry: 'GET year, month, limit, offset, total?',
    company: { ':code': { daily: 'GET limit, offset, total?', summary: 'GET limit, offset, total?' } }
  },
  data: {
    'additional-listing': 'GET year, month, limit, offset, total?',
    delisting: 'GET year, month, limit, offset, total?',
    dividend: 'GET year, month, limit, offset, total?',
    'financial-ratio': 'GET year, month, limit, offset, total?',
    'new-listing': 'GET year, month, limit, offset, total?',
    'right-offering': 'GET year, month, limit, offset, total?',
    'stock-split': 'GET year, month, limit, offset, total?'
  },
  participants: {
    brokers: 'GET limit, offset, total?',
    dealers: 'GET limit, offset, total?',
    profiles: 'GET limit, offset, total?'
  }
}

export const resourceRouter = new Hono<{ Bindings: Env }>()

resourceRouter.get('/', (c) =>
  c.json({
    name: 'IDX API (Cloudflare Workers)',
    version: '0.1.0-worker.1',
    docs: 'Pagination: limit (default 50, max 500), offset. Add ?total=1 for total count.',
    resources: resourceTree
  })
)
