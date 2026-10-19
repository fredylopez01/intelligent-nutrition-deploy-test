import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { http } from '../../services/http'
import type { ProductImage } from '../../types/product'

import { ProductImageManager } from './ProductImageManager'

vi.mock('../../services/http', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../services/http')>()
  return {
    ...original,
    http: { ...original.http, post: vi.fn() },
  }
})

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

const post = vi.mocked(http.post)

const ticket = {
  uploadUrl: 'https://products-images-dev.example.com/products/product-1/front.png?signature=1',
  storageKey: 'products/product-1/front.png',
  publicUrl: 'https://cdn.example.com/products/product-1/front.png',
  expiresIn: 300,
}

const uploadedImage: ProductImage = {
  id: 'image-front',
  url: ticket.publicUrl,
  fileName: 'front.png',
  mimeType: 'image/png',
  sizeBytes: 5 * 1024 * 1024,
  isPrimary: true,
  sortOrder: 0,
}

class ControlledXhr {
  static instances: ControlledXhr[] = []
  method = ''
  url = ''
  headers: Record<string, string> = {}
  body: unknown
  status = 0
  upload: { onprogress: ((event: ProgressEvent) => void) | null } = {
    onprogress: null,
  }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null

  constructor() {
    ControlledXhr.instances.push(this)
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
  }

  reportProgress(loaded: number, total: number) {
    this.upload.onprogress?.({
      lengthComputable: true,
      loaded,
      total,
    } as ProgressEvent)
  }

  finish(status = 200) {
    this.status = status
    this.onload?.()
  }
}

function imageFile(name: string, type: string, size: number) {
  return new File([new Uint8Array(size)], name, { type })
}

function renderManager(onChange = vi.fn()) {
  const user = userEvent.setup({ applyAccept: false })
  const view = render(
    <ProductImageManager
      productId="product-1"
      productName="Proteína"
      images={[]}
      onChange={onChange}
    />,
  )
  return { user, onChange, ...view }
}

beforeEach(() => {
  vi.resetAllMocks()
  ControlledXhr.instances = []
  vi.stubGlobal('XMLHttpRequest', ControlledXhr)
  URL.createObjectURL = vi.fn((file: Blob) => `blob:${(file as File).name}`)
  URL.revokeObjectURL = vi.fn()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ProductImageManager upload integration', () => {
  it('rejects unsupported MIME types and files over 5 MB before requesting an upload URL', async () => {
    const { user } = renderManager()

    await user.upload(screen.getByLabelText('Seleccionar imágenes del producto'), [
      imageFile('manual.pdf', 'application/pdf', 1024),
      imageFile('large.png', 'image/png', 5 * 1024 * 1024 + 1),
    ])

    const notice = screen.getByRole('status')
    expect(notice).toHaveTextContent('manual.pdf no es JPG, PNG, WebP ni AVIF')
    expect(notice).toHaveTextContent('large.png supera el máximo de 5 MB')
    expect(post).not.toHaveBeenCalled()
    expect(ControlledXhr.instances).toHaveLength(0)
  })

  it('accepts a 5 MB image and performs signed URL, direct PUT, then confirmation with preview and progress', async () => {
    post.mockResolvedValueOnce(ticket).mockResolvedValueOnce(uploadedImage)
    const onChange = vi.fn()
    const { user } = renderManager(onChange)
    const file = imageFile('front.png', 'image/png', 5 * 1024 * 1024)

    await user.upload(screen.getByLabelText('Seleccionar imágenes del producto'), file)

    const xhr = await waitFor(() => {
      expect(ControlledXhr.instances).toHaveLength(1)
      return ControlledXhr.instances[0]
    })

    expect(post).toHaveBeenNthCalledWith(
      1,
      '/products/product-1/images/upload-url',
      { fileName: 'front.png', mimeType: 'image/png', sizeBytes: 5 * 1024 * 1024 },
      { token: 'test-token' },
    )
    expect(xhr.method).toBe('PUT')
    expect(xhr.url).toBe(ticket.uploadUrl)
    expect(xhr.headers['Content-Type']).toBe('image/png')
    expect(xhr.body).toBe(file)

    xhr.reportProgress(45, 100)
    expect(await screen.findByRole('progressbar', { name: 'Subiendo front.png' })).toHaveAttribute(
      'aria-valuenow',
      '45',
    )
    expect(screen.getByText('Subiendo 45 %')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Vista previa de front.png' })).toHaveAttribute(
      'src',
      'blob:front.png',
    )
    expect(post).toHaveBeenCalledTimes(1)

    xhr.finish()
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2))
    expect(post).toHaveBeenNthCalledWith(
      2,
      '/products/product-1/images',
      {
        fileName: 'front.png',
        mimeType: 'image/png',
        sizeBytes: 5 * 1024 * 1024,
        storageKey: ticket.storageKey,
        url: ticket.publicUrl,
        isPrimary: true,
      },
      { token: 'test-token' },
    )
    await waitFor(() => expect(onChange).toHaveBeenCalledOnce())
  })

  it('does not confirm the image if the direct bucket upload fails', async () => {
    post.mockResolvedValueOnce(ticket)
    const { user, onChange } = renderManager()

    await user.upload(screen.getByLabelText('Seleccionar imágenes del producto'), [
      imageFile('front.png', 'image/png', 1024),
    ])
    const xhr = await waitFor(() => {
      expect(ControlledXhr.instances).toHaveLength(1)
      return ControlledXhr.instances[0]
    })

    xhr.finish(403)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo subir el archivo al almacenamiento',
    )
    expect(post).toHaveBeenCalledTimes(1)
    expect(onChange).not.toHaveBeenCalled()
  })
})
