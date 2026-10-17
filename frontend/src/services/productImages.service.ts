import type {
  ConfirmImagePayload,
  ImageUploadRequest,
  ImageUploadTicket,
  ProductImage,
  UpdateImagePayload,
} from '../types/product'

import { ApiError, http } from './http'

export type UploadProgressHandler = (percent: number) => void

function putToBucket(
  uploadUrl: string,
  file: File,
  onProgress?: UploadProgressHandler,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('PUT', uploadUrl)
    request.setRequestHeader('Content-Type', file.type)
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100))
    }
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress?.(100)
        resolve()
      } else {
        reject(new ApiError('Upload failed', request.status, undefined, 'UPLOAD_FAILED'))
      }
    }
    request.onerror = () => reject(new ApiError('Upload failed', 0, undefined, 'UPLOAD_FAILED'))
    request.send(file)
  })
}

const imagesPath = (productId: string) => `/products/${productId}/images`

export const productImagesService = {
  list: (productId: string, token: string | null) =>
    http.get<ProductImage[]>(imagesPath(productId), { token }),

  requestUploadUrl: (productId: string, payload: ImageUploadRequest, token: string | null) =>
    http.post<ImageUploadTicket>(`${imagesPath(productId)}/upload-url`, payload, { token }),

  confirm: (productId: string, payload: ConfirmImagePayload, token: string | null) =>
    http.post<ProductImage>(imagesPath(productId), payload, { token }),

  update: (productId: string, imageId: string, payload: UpdateImagePayload, token: string | null) =>
    http.patch<ProductImage>(`${imagesPath(productId)}/${imageId}`, payload, { token }),

  remove: (productId: string, imageId: string, token: string | null) =>
    http.delete<null>(`${imagesPath(productId)}/${imageId}`, { token }),

  async upload(
    productId: string,
    file: File,
    options: { isPrimary?: boolean; onProgress?: UploadProgressHandler },
    token: string | null,
  ): Promise<ProductImage> {
    const request = { fileName: file.name, mimeType: file.type, sizeBytes: file.size }
    const ticket = await productImagesService.requestUploadUrl(productId, request, token)
    await putToBucket(ticket.uploadUrl, file, options.onProgress)
    return productImagesService.confirm(
      productId,
      {
        ...request,
        storageKey: ticket.storageKey,
        url: ticket.publicUrl,
        ...(options.isPrimary ? { isPrimary: true } : {}),
      },
      token,
    )
  },
}
