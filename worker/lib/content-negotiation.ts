// Content negotiation middleware — JSON by default, TOON for agent clients.
//
// TOON (Token-Oriented Object Notation, https://github.com/toon-format/toon)
// is ~30-40% more token-efficient than JSON for LLM consumption. We serve it
// when the caller looks like an AI agent or explicitly asks for it, and
// keep JSON as the default for browsers, curl, and traditional clients.
//
// Agent detection (in order of preference):
//   1. Explicit `?format=toon`  or `?format=json`  query param
//   2. Accept header includes `text/toon` / `application/toon`
//   3. User-Agent matches a known agent signature (Claude, GPT, Cursor, ...)
//
// Behavior: middleware runs AFTER the handler. If the response is JSON
// and the client wants TOON, the body is re-encoded and Content-Type
// switches to `text/toon; charset=utf-8`. Anything that's not JSON
// (HTML, plain text, errors that aren't c.json()) passes through.

import { encode } from '@toon-format/toon'
import type { Context, MiddlewareHandler } from 'hono'

const AGENT_UA_PATTERNS = [
  'claude',
  'anthropic',
  'gpt',
  'openai',
  'chatgpt',
  'cursor',
  'cody',
  'copilot',
  'agent',
  'llm',
  'gemini',
  'mistral',
  'perplexity',
  'wrangler', // wrangler dev itself fetches with this UA
  'deno',
  'curl/agent' // hypothetical curl explicitly identifying as agent
]

const TOON_ACCEPT_TYPES = ['text/toon', 'application/toon', 'application/vnd.toon']

export type ResponseFormat = 'json' | 'toon'

export function detectFormat(c: Context): ResponseFormat {
  // Explicit override via query
  const fmt = c.req.query('format')?.toLowerCase()
  if (fmt === 'toon') return 'toon'
  if (fmt === 'json') return 'json'

  // Accept header
  const accept = (c.req.header('accept') ?? '').toLowerCase()
  if (TOON_ACCEPT_TYPES.some((t) => accept.includes(t))) return 'toon'

  // Agent UA heuristic
  const ua = (c.req.header('user-agent') ?? '').toLowerCase()
  if (AGENT_UA_PATTERNS.some((p) => ua.includes(p))) return 'toon'

  return 'json'
}

export function contentNegotiation(): MiddlewareHandler {
  return async (c, next) => {
    await next()

    // Only re-encode JSON responses
    const ct = c.res.headers.get('content-type') ?? ''
    if (!ct.toLowerCase().includes('application/json')) return

    const desired = detectFormat(c)
    if (desired !== 'toon') return

    let parsed: unknown
    try {
      parsed = await c.res.clone().json()
    } catch {
      // Not parseable — leave as is
      return
    }

    let body: string
    try {
      body = encode(parsed as Parameters<typeof encode>[0])
    } catch (err) {
      // Encoding failure is non-fatal — fall back to original JSON
      console.warn(
        `[toon] encode failed: ${err instanceof Error ? err.message : String(err)} — serving JSON`
      )
      return
    }

    const newHeaders = new Headers(c.res.headers)
    newHeaders.set('content-type', 'text/toon; charset=utf-8')
    newHeaders.delete('content-length') // recomputed by runtime
    newHeaders.set('x-bursarium-format', 'toon')

    c.res = new Response(body, {
      status: c.res.status,
      headers: newHeaders
    })
  }
}
