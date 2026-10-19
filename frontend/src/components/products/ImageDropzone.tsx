import { useId, useRef, useState } from 'react'
import type { DragEvent } from 'react'

import { IMAGE_ACCEPT, IMAGE_RULES_TEXT } from '../../utils/productImages'

import './ImageDropzone.css'

interface ImageDropzoneProps {
  remaining: number
  disabled?: boolean
  compact?: boolean
  onFiles: (files: File[]) => void
}

function hasFiles(event: DragEvent) {
  return Array.from(event.dataTransfer.types).includes('Files')
}

export function ImageDropzone({
  remaining,
  disabled = false,
  compact = false,
  onFiles,
}: ImageDropzoneProps) {
  const inputId = useId()
  const hintId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [isOver, setIsOver] = useState(false)
  const isDisabled = disabled || remaining <= 0

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!hasFiles(event)) return
    event.preventDefault()
    setIsOver(false)
    if (isDisabled) return
    onFiles(Array.from(event.dataTransfer.files))
  }

  return (
    <div
      className={[
        'image-dropzone',
        compact ? 'image-dropzone--compact' : '',
        isOver ? 'image-dropzone--over' : '',
        isDisabled ? 'image-dropzone--disabled' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onDragOver={(event) => {
        if (!hasFiles(event)) return
        event.preventDefault()
        event.dataTransfer.dropEffect = isDisabled ? 'none' : 'copy'
        if (!isDisabled) setIsOver(true)
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={handleDrop}
    >
      <svg
        className="image-dropzone__icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 16V4" />
        <path d="m7 9 5-5 5 5" />
        <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
      </svg>
      <p className="image-dropzone__title">
        {isOver ? 'Suelta las imágenes aquí' : 'Arrastra imágenes o selecciónalas'}
      </p>
      <p id={hintId} className="image-dropzone__hint">
        {remaining > 0
          ? `${IMAGE_RULES_TEXT}. Puedes agregar ${remaining === 1 ? '1 más' : `${remaining} más`}.`
          : 'Ya tiene el máximo de 5 imágenes.'}
      </p>
      <label htmlFor={inputId} className="sr-only">
        Seleccionar imágenes del producto
      </label>
      <input
        ref={inputRef}
        id={inputId}
        className="sr-only"
        type="file"
        accept={IMAGE_ACCEPT}
        multiple
        disabled={isDisabled}
        aria-describedby={hintId}
        tabIndex={-1}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? [])
          event.target.value = ''
          if (files.length > 0) onFiles(files)
        }}
      />
      <button
        type="button"
        className="image-dropzone__button"
        disabled={isDisabled}
        aria-describedby={hintId}
        onClick={() => inputRef.current?.click()}
      >
        Seleccionar archivos
      </button>
    </div>
  )
}
