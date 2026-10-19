import { useEffect, useId, useRef, useState } from 'react'
import type { DragEvent } from 'react'

import { useAuth } from '../../hooks/useAuth'
import { productImagesService } from '../../services/productImages.service'
import type { ProductImage } from '../../types/product'
import {
  MAX_PRODUCT_IMAGES,
  formatFileSize,
  resolveImageError,
  selectImageFiles,
  sortImages,
  type RejectedImage,
} from '../../utils/productImages'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'

import { ImageDropzone } from './ImageDropzone'

import './ProductImageManager.css'

interface ProductImageManagerProps {
  productId: string
  productName: string
  images: ProductImage[]
  onChange: () => void
}

type UploadStatus = 'pending' | 'uploading' | 'error' | 'done'

interface UploadItem {
  key: string
  file: File
  previewUrl: string
  progress: number
  status: UploadStatus
  error?: string
  imageId?: string
  previewFailed?: boolean
}

const IMAGE_DRAG_TYPE = 'application/x-product-image'

let uploadSequence = 0

function Icon({ path }: { path: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  )
}

const ICONS = {
  left: 'm15 6-6 6 6 6',
  right: 'm9 6 6 6-6 6',
  star: 'm12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5Z',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3',
}

export function ProductImageManager({
  productId,
  productName,
  images,
  onChange,
}: ProductImageManagerProps) {
  const { token } = useAuth()
  const titleId = useId()
  const [uploads, setUploads] = useState<UploadItem[]>([])
  const [rejected, setRejected] = useState<RejectedImage[]>([])
  const [actionError, setActionError] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [busy, setBusy] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ProductImage | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const [order, setOrder] = useState<{ base: ProductImage[]; ids: string[] } | null>(null)
  const previewUrls = useRef(new Set<string>())

  const sorted = sortImages(images)
  const ordered =
    order && order.base === images
      ? order.ids
          .map((id) => sorted.find((image) => image.id === id))
          .filter((image): image is ProductImage => image !== undefined)
      : sorted

  const imageIds = new Set(images.map((image) => image.id))
  const visibleUploads = uploads.filter(
    (item) => !(item.status === 'done' && item.imageId && imageIds.has(item.imageId)),
  )
  const isUploading = uploads.some(
    (item) => item.status === 'pending' || item.status === 'uploading',
  )
  const locked = busy || isUploading
  const remaining = Math.max(0, MAX_PRODUCT_IMAGES - images.length - visibleUploads.length)
  const hasPrimary = images.some((image) => image.isPrimary)

  const queueRef = useRef<UploadItem[]>([])
  const runningRef = useRef(false)
  const hasPrimaryRef = useRef(hasPrimary)
  const primaryClaimedRef = useRef(false)

  useEffect(() => {
    hasPrimaryRef.current = hasPrimary
    if (hasPrimary) primaryClaimedRef.current = false
  }, [hasPrimary])

  useEffect(() => {
    const urls = previewUrls.current
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [])

  const pruneReflected = () =>
    setUploads((items) =>
      items.filter(
        (item) => !(item.status === 'done' && item.imageId && imageIds.has(item.imageId)),
      ),
    )

  const updateUpload = (key: string, changes: Partial<UploadItem>) =>
    setUploads((items) => items.map((item) => (item.key === key ? { ...item, ...changes } : item)))

  const processQueue = async () => {
    if (runningRef.current) return
    runningRef.current = true
    let item = queueRef.current.shift()
    while (item) {
      const current = item
      const isPrimary = !hasPrimaryRef.current && !primaryClaimedRef.current
      updateUpload(current.key, { status: 'uploading', progress: 0, error: undefined })
      try {
        const image = await productImagesService.upload(
          productId,
          current.file,
          { isPrimary, onProgress: (progress) => updateUpload(current.key, { progress }) },
          token,
        )
        if (isPrimary) primaryClaimedRef.current = true
        updateUpload(current.key, { status: 'done', progress: 100, imageId: image.id })
        setAnnouncement(`${current.file.name} se subió correctamente.`)
        onChange()
      } catch (error) {
        updateUpload(current.key, {
          status: 'error',
          error: resolveImageError(error, 'No fue posible subir la imagen. Intenta de nuevo.'),
        })
      }
      item = queueRef.current.shift()
    }
    runningRef.current = false
  }

  const enqueue = (items: UploadItem[]) => {
    queueRef.current.push(...items)
    void processQueue()
  }

  const handleFiles = (files: File[]) => {
    setActionError(null)
    pruneReflected()
    const { accepted, rejected: rejectedFiles } = selectImageFiles(files, remaining)
    setRejected(rejectedFiles)
    if (accepted.length === 0) return
    const items = accepted.map((file) => {
      const previewUrl = URL.createObjectURL(file)
      previewUrls.current.add(previewUrl)
      uploadSequence += 1
      return {
        key: `upload-${uploadSequence}`,
        file,
        previewUrl,
        progress: 0,
        status: 'pending' as const,
      }
    })
    setUploads((current) => [...current, ...items])
    enqueue(items)
  }

  const retryUpload = (item: UploadItem) => {
    updateUpload(item.key, { status: 'pending', progress: 0, error: undefined })
    enqueue([item])
  }

  const discardUpload = (key: string) => {
    setUploads((items) => {
      const item = items.find((candidate) => candidate.key === key)
      if (item) {
        URL.revokeObjectURL(item.previewUrl)
        previewUrls.current.delete(item.previewUrl)
      }
      return items.filter((candidate) => candidate.key !== key)
    })
  }

  const runAction = async (action: () => Promise<unknown>, success: string, fallback: string) => {
    setActionError(null)
    setRejected([])
    pruneReflected()
    setBusy(true)
    try {
      await action()
      setAnnouncement(success)
      onChange()
    } catch (error) {
      setOrder(null)
      setActionError(resolveImageError(error, fallback))
    } finally {
      setBusy(false)
    }
  }

  const moveImage = (image: ProductImage, toIndex: number) => {
    const fromIndex = ordered.findIndex((candidate) => candidate.id === image.id)
    if (fromIndex === toIndex || toIndex < 0 || toIndex >= ordered.length) return
    const ids = ordered.map((candidate) => candidate.id).filter((id) => id !== image.id)
    ids.splice(toIndex, 0, image.id)
    setOrder({ base: images, ids })
    void runAction(
      () => productImagesService.update(productId, image.id, { sortOrder: toIndex }, token),
      `Imagen movida a la posición ${toIndex + 1} de ${ordered.length}.`,
      'No fue posible cambiar el orden. Intenta de nuevo.',
    )
  }

  const markPrimary = (image: ProductImage, position: number) =>
    void runAction(
      () => productImagesService.update(productId, image.id, { isPrimary: true }, token),
      `La imagen ${position} ahora es la principal.`,
      'No fue posible marcar la imagen como principal. Intenta de nuevo.',
    )

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleteError(null)
    pruneReflected()
    setBusy(true)
    try {
      await productImagesService.remove(productId, deleteTarget.id, token)
      setDeleteTarget(null)
      setAnnouncement('La imagen se eliminó.')
      onChange()
    } catch (error) {
      setDeleteError(
        resolveImageError(error, 'No fue posible eliminar la imagen. Intenta de nuevo.'),
      )
    } finally {
      setBusy(false)
    }
  }

  const handleDragStart = (event: DragEvent<HTMLLIElement>, image: ProductImage) => {
    if (locked) {
      event.preventDefault()
      return
    }
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData(IMAGE_DRAG_TYPE, image.id)
    setDraggedId(image.id)
  }

  const handleDragOver = (event: DragEvent<HTMLLIElement>, index: number) => {
    if (!draggedId) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDropIndex(index)
  }

  const handleDrop = (event: DragEvent<HTMLLIElement>, index: number) => {
    if (!draggedId) return
    event.preventDefault()
    const image = ordered.find((candidate) => candidate.id === draggedId)
    setDraggedId(null)
    setDropIndex(null)
    if (image) moveImage(image, index)
  }

  const deletingPrimary = deleteTarget?.isPrimary && images.length > 1

  return (
    <section className="image-manager" aria-labelledby={titleId}>
      <div className="image-manager__header">
        <h3 id={titleId} className="image-manager__title">
          Imágenes
        </h3>
        <span className="image-manager__count">
          {images.length} de {MAX_PRODUCT_IMAGES}
        </span>
      </div>
      <p className="image-manager__hint">
        La imagen principal es la que se ve en el listado. Arrastra las imágenes o usa las flechas
        para cambiar el orden.
      </p>

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      {actionError && <Alert tone="error">{actionError}</Alert>}
      {rejected.length > 0 && (
        <Alert tone="info">
          {rejected.length === 1 ? 'Un archivo no se agregó:' : 'Algunos archivos no se agregaron:'}
          <ul className="image-manager__rejected">
            {rejected.map((item) => (
              <li key={`${item.fileName}-${item.reason}`}>
                <strong>{item.fileName}</strong> {item.reason}.
              </li>
            ))}
          </ul>
        </Alert>
      )}

      <ol className="image-manager__grid" aria-label={`Imágenes de ${productName}`}>
        {ordered.map((image, index) => {
          const position = index + 1
          return (
            <li
              key={image.id}
              className={[
                'image-manager__card',
                draggedId === image.id ? 'image-manager__card--dragging' : '',
                dropIndex === index && draggedId !== image.id ? 'image-manager__card--target' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              draggable={!locked}
              onDragStart={(event) => handleDragStart(event, image)}
              onDragOver={(event) => handleDragOver(event, index)}
              onDragLeave={() => setDropIndex(null)}
              onDrop={(event) => handleDrop(event, index)}
              onDragEnd={() => {
                setDraggedId(null)
                setDropIndex(null)
              }}
            >
              <div className="image-manager__media">
                <img src={image.url} alt={`Imagen ${position}: ${image.fileName}`} loading="lazy" />
                <span className="image-manager__position" aria-hidden="true">
                  {position}
                </span>
                {image.isPrimary && <span className="image-manager__badge">Principal</span>}
              </div>
              <div className="image-manager__meta">
                <span className="image-manager__file" title={image.fileName}>
                  {image.fileName}
                </span>
                <span className="image-manager__size">{formatFileSize(image.sizeBytes)}</span>
              </div>
              <div className="image-manager__tools">
                <button
                  type="button"
                  className="image-manager__tool"
                  aria-label={`Mover la imagen ${position} a la izquierda`}
                  disabled={locked || index === 0}
                  onClick={() => moveImage(image, index - 1)}
                >
                  <Icon path={ICONS.left} />
                </button>
                <button
                  type="button"
                  className="image-manager__tool"
                  aria-label={`Mover la imagen ${position} a la derecha`}
                  disabled={locked || index === ordered.length - 1}
                  onClick={() => moveImage(image, index + 1)}
                >
                  <Icon path={ICONS.right} />
                </button>
                <button
                  type="button"
                  className={`image-manager__tool${image.isPrimary ? ' image-manager__tool--active' : ''}`}
                  aria-label={
                    image.isPrimary
                      ? `La imagen ${position} es la principal`
                      : `Marcar la imagen ${position} como principal`
                  }
                  aria-pressed={image.isPrimary}
                  disabled={locked || image.isPrimary}
                  onClick={() => markPrimary(image, position)}
                >
                  <Icon path={ICONS.star} />
                </button>
                <button
                  type="button"
                  className="image-manager__tool image-manager__tool--danger"
                  aria-label={`Eliminar la imagen ${position}`}
                  disabled={locked}
                  onClick={() => {
                    setDeleteError(null)
                    setDeleteTarget(image)
                  }}
                >
                  <Icon path={ICONS.trash} />
                </button>
              </div>
            </li>
          )
        })}

        {visibleUploads.map((item) => (
          <li
            key={item.key}
            className={`image-manager__card image-manager__card--upload${item.status === 'error' ? ' image-manager__card--error' : ''}`}
          >
            <div className="image-manager__media">
              {item.previewFailed ? (
                <span className="image-manager__no-preview">Sin vista previa</span>
              ) : (
                <img
                  src={item.previewUrl}
                  alt={`Vista previa de ${item.file.name}`}
                  onError={() => updateUpload(item.key, { previewFailed: true })}
                />
              )}
              {item.status !== 'error' && (
                <div className="image-manager__progress">
                  <div
                    className="image-manager__progress-bar"
                    role="progressbar"
                    aria-label={`Subiendo ${item.file.name}`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={item.progress}
                  >
                    <span style={{ width: `${item.progress}%` }} />
                  </div>
                  <span className="image-manager__progress-text">
                    {item.status === 'pending'
                      ? 'En espera'
                      : item.status === 'done'
                        ? 'Lista'
                        : `Subiendo ${item.progress} %`}
                  </span>
                </div>
              )}
            </div>
            <div className="image-manager__meta">
              <span className="image-manager__file" title={item.file.name}>
                {item.file.name}
              </span>
              <span className="image-manager__size">{formatFileSize(item.file.size)}</span>
            </div>
            {item.status === 'error' && (
              <div className="image-manager__upload-error">
                <p role="alert">{item.error}</p>
                <div className="image-manager__upload-actions">
                  <button
                    type="button"
                    className="image-manager__link"
                    onClick={() => retryUpload(item)}
                  >
                    Reintentar
                  </button>
                  <button
                    type="button"
                    className="image-manager__link"
                    onClick={() => discardUpload(item.key)}
                  >
                    Quitar
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}

        {remaining > 0 && (
          <li className="image-manager__drop">
            <ImageDropzone remaining={remaining} disabled={busy} onFiles={handleFiles} />
          </li>
        )}
      </ol>

      <Modal
        open={deleteTarget !== null}
        title="¿Eliminar esta imagen?"
        description={
          deletingPrimary
            ? 'Es la imagen principal: la primera que quede en el orden pasará a ser la principal. La imagen se borra definitivamente.'
            : 'La imagen se borra definitivamente del producto.'
        }
        onClose={() => setDeleteTarget(null)}
      >
        {deleteTarget && (
          <div className="image-manager__confirm">
            <img
              className="image-manager__confirm-preview"
              src={deleteTarget.url}
              alt={`Imagen a eliminar: ${deleteTarget.fileName}`}
            />
            {deleteError && <Alert tone="error">{deleteError}</Alert>}
            <div className="image-manager__confirm-actions">
              <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={busy}>
                Cancelar
              </Button>
              <Button variant="danger" onClick={() => void confirmDelete()} disabled={busy}>
                {busy ? 'Eliminando...' : 'Sí, eliminar'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  )
}
