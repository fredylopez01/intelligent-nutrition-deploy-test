import type { RejectedImage } from '../../utils/productImages'
import { MAX_PRODUCT_IMAGES, formatFileSize } from '../../utils/productImages'

import { ImageDropzone } from './ImageDropzone'

import './PendingImagesPicker.css'

export interface PendingImage {
  key: string
  file: File
  previewUrl: string
}

interface PendingImagesPickerProps {
  items: PendingImage[]
  primaryKey: string | null
  rejected: RejectedImage[]
  disabled?: boolean
  onAdd: (files: File[]) => void
  onRemove: (key: string) => void
  onSetPrimary: (key: string) => void
}

export function PendingImagesPicker({
  items,
  primaryKey,
  rejected,
  disabled = false,
  onAdd,
  onRemove,
  onSetPrimary,
}: PendingImagesPickerProps) {
  return (
    <fieldset className="pending-images" disabled={disabled}>
      <legend className="pending-images__legend">
        Imágenes <span className="pending-images__optional">(opcional)</span>
      </legend>

      {items.length > 0 && (
        <ul className="pending-images__list">
          {items.map((item, index) => {
            const isPrimary = item.key === primaryKey
            return (
              <li key={item.key} className="pending-images__item">
                <img
                  className="pending-images__preview"
                  src={item.previewUrl}
                  alt={`Vista previa ${index + 1}: ${item.file.name}`}
                />
                <div className="pending-images__info">
                  <span className="pending-images__name" title={item.file.name}>
                    {item.file.name}
                  </span>
                  <span className="pending-images__size">{formatFileSize(item.file.size)}</span>
                </div>
                <div className="pending-images__actions">
                  {isPrimary ? (
                    <span className="pending-images__primary">Principal</span>
                  ) : (
                    <button
                      type="button"
                      className="pending-images__link"
                      aria-label={`Usar ${item.file.name} como imagen principal`}
                      onClick={() => onSetPrimary(item.key)}
                    >
                      Hacer principal
                    </button>
                  )}
                  <button
                    type="button"
                    className="pending-images__link pending-images__link--danger"
                    aria-label={`Quitar ${item.file.name}`}
                    onClick={() => onRemove(item.key)}
                  >
                    Quitar
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {rejected.length > 0 && (
        <ul className="pending-images__rejected" role="alert">
          {rejected.map((item) => (
            <li key={`${item.fileName}-${item.reason}`}>
              <strong>{item.fileName}</strong> {item.reason}.
            </li>
          ))}
        </ul>
      )}

      {items.length < MAX_PRODUCT_IMAGES && (
        <ImageDropzone
          compact
          remaining={MAX_PRODUCT_IMAGES - items.length}
          disabled={disabled}
          onFiles={onAdd}
        />
      )}
    </fieldset>
  )
}
