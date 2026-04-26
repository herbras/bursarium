// IDX scraping client adapted for Cloudflare Workers.
// Differences from the Deno version (src/Client.ts):
//   - No persistent session cookie cache (Worker isolates are short-lived).
//     Each invocation acquires a fresh session — slower but stateless.
//   - Retries via exponential backoff still work; CPU time is the limit.
//
// If the cold-cookie cost matters, cache the cookie in KV with short TTL.

const BROWSER_HEADERS: Record<string, string> = {
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
  Referer: 'https://www.idx.co.id/',
  'Upgrade-Insecure-Requests': '1',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36'
}

interface FetchOptions {
  maxAttempts?: number
  cookie?: string
}

export class IdxClient {
  private cookie = ''
  private readonly baseUrl: string

  constructor(baseUrl = 'https://www.idx.co.id') {
    this.baseUrl = baseUrl
  }

  async ensureSession(): Promise<void> {
    if (this.cookie) return
    const response = await this.fetchUrl(`${this.baseUrl}/id`)
    this.cookie = collectSetCookie(response.headers)
    await response.body?.cancel()
    // Validation hit — same as Deno version
    const validation = await this.fetchUrl(`${this.baseUrl}/primary/home/GetIndexList`)
    await validation.body?.cancel()
  }

  async fetchUrl(url: string, options: FetchOptions = {}): Promise<Response> {
    const maxAttempts = options.maxAttempts ?? 5
    const headers: Record<string, string> = {
      ...BROWSER_HEADERS,
      'X-Requested-With': 'XMLHttpRequest'
    }
    const cookieHeader = options.cookie ?? this.cookie
    if (cookieHeader) headers.Cookie = cookieHeader

    const attempt = async (n: number): Promise<Response> => {
      try {
        const response = await fetch(url, { headers })
        if (!response.ok && response.status >= 500) {
          await response.body?.cancel()
          throw new Error(`Server returned ${response.status}: ${response.statusText}`)
        }
        return response
      } catch (error) {
        if (n >= maxAttempts) throw error
        const delay = Math.min(1000 * 2 ** (n - 1), 15000)
        const message = error instanceof Error ? error.message : String(error)
        console.warn(
          `[IdxClient] fetch failed for ${url}. retry ${n}/${maxAttempts} in ${delay}ms: ${message}`
        )
        await wait(delay)
        return attempt(n + 1)
      }
    }
    return attempt(1)
  }

  async fetchJson<T>(url: string, options?: FetchOptions): Promise<T> {
    await this.ensureSession()
    const response = await this.fetchUrl(url, options)
    if (!response.ok) {
      const body = await response.text()
      throw new Error(`IDX request failed (${response.status}): ${body.slice(0, 200)}`)
    }
    return (await response.json()) as T
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Workers `Headers` exposes `Set-Cookie` via `getAll`/iteration, not the
// Node-style `getSetCookie()`. Collect every `set-cookie` line and join.
function collectSetCookie(headers: Headers): string {
  const cookies: string[] = []
  headers.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') cookies.push(value)
  })
  return cookies.join('; ')
}
