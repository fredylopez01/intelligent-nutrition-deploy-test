import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { http } from './http'
import { productImagesService } from './productImages.service'

vi.mock('./http', async (importOriginal) => {
  const original = await importOriginal<typeof import('./http')>()
  return { ...original, http: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }
})

const post = vi.mocked(http.post)

class FakeXhr {
  static instances: FakeXhr[] = []
  static status = 200
  method = ''
  url = ''
  headers: Record<string, string> = {}
  body: unknown = null
  status = 0
  upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null

  constructor() {
    FakeXhr.instances.push(this)
  }

  open(method: string, url: string) {
    this.method = method
    this.url = url
  }

  setRequestHeader(name: string, value: string) {
    this.headers[name] = value
  }

  send(body: unknown) {
    this.body = body
    this.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 } as ProgressEvent)
    this.status = FakeXhr.status
    queueMicrotask(() => this.onload?.())
  }
}

const ticket = {
  uploadUrl: 'https://bucket.example.com/products/p1/abc.png?X-Amz-Signature=1',
  storageKey: 'products/p1/abc.png',
  publicUrl: 'https://cdn.example.com/products/p1/abc.png',
  expiresIn: 300,
}

beforeEach(() => {
  vi.resetAllMocks()
  FakeXhr.instances = []
  FakeXhr.status = 200
  vi.stubGlobal('XMLHttpRequest', FakeXhr)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('productImagesService.upload', () => {
  it('asks for a signed url, uploads straight to the bucket and confirms with the public url', async () => {
    post.mockResolvedValueOnce(ticket).mockResolvedValueOnce({ id: 'image-1' })
    const onProgress = vi.fn()
    const file = new File([new Uint8Array(10)], 'frente.png', { type: 'image/png' })

    await productImagesService.upload('p1', file, { isPrimary: true, onProgress }, 'token')

    expect(post).toHaveBeenNthCalledWith(
      1,
      '/products/p1/images/upload-url',
      { fileName: 'frente.png', mimeType: 'image/png', sizeBytes: 10 },
      { token: 'token' },
    )
    const [xhr] = FakeXhr.instances
    expect(xhr.method).toBe('PUT')
    expect(xhr.url).toBe(ticket.uploadUrl)
    expect(xhr.headers['Content-Type']).toBe('image/png')
    expect(xhr.body).toBe(file)
    expect(onProgress).toHaveBeenCalledWith(50)
    expect(onProgress).toHaveBeenLastCalledWith(100)
    expect(post).toHaveBeenNthCalledWith(
      2,
      '/products/p1/images',
      {
        fileName: 'frente.png',
        mimeType: 'image/png',
        sizeBytes: 10,
        storageKey: ticket.storageKey,
        url: ticket.publicUrl,
        isPrimary: true,
      },
      { token: 'token' },
    )
  })

  it('does not confirm when the bucket rejects the file', async () => {
    post.mockResolvedValueOnce(ticket)
    FakeXhr.status = 403
    const file = new File([new Uint8Array(10)], 'frente.png', { type: 'image/png' })

    await expect(productImagesService.upload('p1', file, {}, 'token')).rejects.toMatchObject({
      code: 'UPLOAD_FAILED',
    })
    expect(post).toHaveBeenCalledTimes(1)
  })

  it('leaves isPrimary out when the image is not the primary one', async () => {
    post.mockResolvedValueOnce(ticket).mockResolvedValueOnce({ id: 'image-1' })
    const file = new File([new Uint8Array(10)], 'lado.png', { type: 'image/png' })

    await productImagesService.upload('p1', file, { isPrimary: false }, 'token')

    expect(post.mock.calls[1][1]).not.toHaveProperty('isPrimary')
  })
})
