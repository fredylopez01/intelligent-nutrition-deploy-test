import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../services/http'
import { productImagesService } from '../../services/productImages.service'
import type { ProductImage } from '../../types/product'

import { ProductImageManager } from './ProductImageManager'

vi.mock('../../services/productImages.service', () => ({
  productImagesService: { upload: vi.fn(), update: vi.fn(), remove: vi.fn() },
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

const uploadImage = vi.mocked(productImagesService.upload)
const updateImage = vi.mocked(productImagesService.update)
const removeImage = vi.mocked(productImagesService.remove)

function image(id: string, sortOrder: number, isPrimary = false): ProductImage {
  return {
    id,
    url: `https://cdn.example.com/${id}.webp`,
    fileName: `${id}.webp`,
    mimeType: 'image/webp',
    sizeBytes: 184320,
    isPrimary,
    sortOrder,
  }
}

function imageFile(name: string, type = 'image/png', size = 2048) {
  return new File([new Uint8Array(size)], name, { type })
}

function renderManager(images: ProductImage[]) {
  const onChange = vi.fn()
  const user = userEvent.setup()
  const view = render(
    <ProductImageManager
      productId="product-whey"
      productName="Whey Protein 2 lb"
      images={images}
      onChange={onChange}
    />,
  )
  return { user, onChange, ...view }
}

function cards() {
  return within(screen.getByRole('list', { name: 'Imágenes de Whey Protein 2 lb' }))
    .getAllByRole('img')
    .map((img) => img.getAttribute('alt'))
}

beforeEach(() => {
  vi.resetAllMocks()
  URL.createObjectURL = vi.fn((file: Blob) => `blob:${(file as File).name}`)
  URL.revokeObjectURL = vi.fn()
  updateImage.mockResolvedValue(image('front', 0, true))
  removeImage.mockResolvedValue(null)
})

describe('ProductImageManager', () => {
  it('lists the images by sort order and marks the primary one', () => {
    renderManager([image('back', 1), image('front', 0, true)])

    expect(screen.getByText('2 de 5')).toBeInTheDocument()
    expect(cards()).toEqual(['Imagen 1: front.webp', 'Imagen 2: back.webp'])
    expect(screen.getByText('Principal')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'La imagen 1 es la principal' })).toBeDisabled()
  })

  it('uploads the chosen files one by one and makes the first one primary when there is none', async () => {
    uploadImage.mockImplementation(async (_productId, file, options) => {
      options.onProgress?.(100)
      return { ...image(file.name, 0), isPrimary: options.isPrimary ?? false }
    })
    const { user, onChange } = renderManager([])

    await user.upload(screen.getByLabelText('Seleccionar imágenes del producto'), [
      imageFile('frente.png'),
      imageFile('reverso.jpg', 'image/jpeg'),
    ])

    await waitFor(() => expect(uploadImage).toHaveBeenCalledTimes(2))
    expect(uploadImage.mock.calls[0][1].name).toBe('frente.png')
    expect(uploadImage.mock.calls[0][2]).toMatchObject({ isPrimary: true })
    expect(uploadImage.mock.calls[1][1].name).toBe('reverso.jpg')
    expect(uploadImage.mock.calls[1][2]).toMatchObject({ isPrimary: false })
    expect(uploadImage.mock.calls[0][3]).toBe('test-token')
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(2))
  })

  it('does not mark new uploads as primary when the product already has one', async () => {
    uploadImage.mockResolvedValue(image('lado', 1))
    const { user } = renderManager([image('front', 0, true)])

    await user.upload(screen.getByLabelText('Seleccionar imágenes del producto'), [
      imageFile('lado.png'),
    ])

    await waitFor(() => expect(uploadImage).toHaveBeenCalledTimes(1))
    expect(uploadImage.mock.calls[0][2]).toMatchObject({ isPrimary: false })
  })

  it('shows the upload progress while the file travels to the bucket', async () => {
    let finish: (value: ProductImage) => void = () => undefined
    uploadImage.mockImplementation((_productId, _file, options) => {
      options.onProgress?.(45)
      return new Promise((resolve) => {
        finish = resolve
      })
    })
    const { user } = renderManager([])

    await user.upload(screen.getByLabelText('Seleccionar imágenes del producto'), [
      imageFile('frente.png'),
    ])

    const progress = await screen.findByRole('progressbar', { name: 'Subiendo frente.png' })
    expect(progress).toHaveAttribute('aria-valuenow', '45')
    expect(screen.getByText('Subiendo 45 %')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Vista previa de frente.png' })).toHaveAttribute(
      'src',
      'blob:frente.png',
    )
    finish(image('frente', 0, true))
  })

  it('rejects files with the wrong type or size and the ones that exceed five images', async () => {
    renderManager([image('a', 0, true), image('b', 1), image('c', 2), image('d', 3)])
    uploadImage.mockReturnValue(new Promise(() => undefined))

    fireEvent.change(screen.getByLabelText('Seleccionar imágenes del producto'), {
      target: {
        files: [
          imageFile('manual.pdf', 'application/pdf'),
          imageFile('enorme.png', 'image/png', 6 * 1024 * 1024),
          imageFile('quinta.png'),
          imageFile('sexta.png'),
        ],
      },
    })

    const notice = screen.getByRole('status')
    expect(notice).toHaveTextContent('manual.pdf no es JPG, PNG, WebP ni AVIF')
    expect(notice).toHaveTextContent('enorme.png supera el máximo de 5 MB (pesa 6 MB)')
    expect(notice).toHaveTextContent('sexta.png no cabe: el producto admite máximo 5 imágenes')
    await waitFor(() => expect(uploadImage).toHaveBeenCalledTimes(1))
    expect(uploadImage.mock.calls[0][1].name).toBe('quinta.png')
  })

  it('explains a failed upload and retries it', async () => {
    uploadImage
      .mockRejectedValueOnce(new ApiError('Bad content', 422, undefined, 'INVALID_FILE_CONTENT'))
      .mockResolvedValueOnce(image('frente', 0, true))
    const { user, onChange } = renderManager([])

    await user.upload(screen.getByLabelText('Seleccionar imágenes del producto'), [
      imageFile('frente.png'),
    ])

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El contenido del archivo no corresponde a una imagen válida',
    )
    expect(onChange).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Reintentar' }))

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1))
    expect(uploadImage).toHaveBeenCalledTimes(2)
  })

  it('discards a failed upload', async () => {
    uploadImage.mockRejectedValue(new ApiError('Upload failed', 0, undefined, 'UPLOAD_FAILED'))
    const { user } = renderManager([])

    await user.upload(screen.getByLabelText('Seleccionar imágenes del producto'), [
      imageFile('frente.png'),
    ])
    await screen.findByRole('alert')
    await user.click(screen.getByRole('button', { name: 'Quitar' }))

    expect(screen.queryByText('frente.png')).not.toBeInTheDocument()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:frente.png')
  })

  it('marks another image as the primary one', async () => {
    const { user, onChange } = renderManager([image('front', 0, true), image('back', 1)])

    await user.click(screen.getByRole('button', { name: 'Marcar la imagen 2 como principal' }))

    await waitFor(() =>
      expect(updateImage).toHaveBeenCalledWith(
        'product-whey',
        'back',
        { isPrimary: true },
        'test-token',
      ),
    )
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('moves an image with the arrows and blocks the moves at the ends', async () => {
    const { user, onChange } = renderManager([image('front', 0, true), image('back', 1)])

    expect(screen.getByRole('button', { name: 'Mover la imagen 1 a la izquierda' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Mover la imagen 2 a la derecha' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Mover la imagen 1 a la derecha' }))

    expect(cards()).toEqual(['Imagen 1: back.webp', 'Imagen 2: front.webp'])
    await waitFor(() =>
      expect(updateImage).toHaveBeenCalledWith(
        'product-whey',
        'front',
        { sortOrder: 1 },
        'test-token',
      ),
    )
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('reorders by dragging an image onto another position', async () => {
    renderManager([image('front', 0, true), image('back', 1), image('side', 2)])
    const list = screen.getByRole('list', { name: 'Imágenes de Whey Protein 2 lb' })
    const [first, , third] = within(list).getAllByRole('listitem')
    const dataTransfer = { setData: vi.fn(), effectAllowed: '', dropEffect: '', types: [] }

    fireEvent.dragStart(third, { dataTransfer })
    fireEvent.dragOver(first, { dataTransfer })
    fireEvent.drop(first, { dataTransfer })

    await waitFor(() =>
      expect(updateImage).toHaveBeenCalledWith(
        'product-whey',
        'side',
        { sortOrder: 0 },
        'test-token',
      ),
    )
  })

  it('restores the order and explains the error when the move fails', async () => {
    updateImage.mockRejectedValue(new ApiError('Error', 500))
    const { user, onChange } = renderManager([image('front', 0, true), image('back', 1)])

    await user.click(screen.getByRole('button', { name: 'Mover la imagen 1 a la derecha' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No fue posible cambiar el orden')
    expect(cards()).toEqual(['Imagen 1: front.webp', 'Imagen 2: back.webp'])
    expect(onChange).not.toHaveBeenCalled()
  })

  it('deletes an image after confirming and warns when it is the primary one', async () => {
    const { user, onChange } = renderManager([image('front', 0, true), image('back', 1)])

    await user.click(screen.getByRole('button', { name: 'Eliminar la imagen 1' }))

    const dialog = screen.getByRole('dialog', { name: '¿Eliminar esta imagen?' })
    expect(dialog).toHaveTextContent('la primera que quede en el orden pasará a ser la principal')
    await user.click(within(dialog).getByRole('button', { name: 'Sí, eliminar' }))

    await waitFor(() =>
      expect(removeImage).toHaveBeenCalledWith('product-whey', 'front', 'test-token'),
    )
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps the dialog open with the error when the delete fails', async () => {
    removeImage.mockRejectedValue(new ApiError('Not found', 404))
    const { user, onChange } = renderManager([image('front', 0, true)])

    await user.click(screen.getByRole('button', { name: 'Eliminar la imagen 1' }))
    await user.click(screen.getByRole('button', { name: 'Sí, eliminar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'La imagen o el producto ya no existen',
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('hides the drop zone when the product already has five images', () => {
    renderManager([0, 1, 2, 3, 4].map((index) => image(`img-${index}`, index, index === 0)))

    expect(screen.getByText('5 de 5')).toBeInTheDocument()
    expect(screen.queryByLabelText('Seleccionar imágenes del producto')).not.toBeInTheDocument()
  })
})
