import { useState } from 'react'

import { CreateSupplierForm } from '../../components/suppliers/CreateSupplierForm'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { AppLayout } from '../../layouts/AppLayout'

import './SuppliersPage.css'

export function SuppliersPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [createdMessage, setCreatedMessage] = useState<string | null>(null)

  const handleOpenCreate = () => {
    setCreatedMessage(null)
    setIsCreateOpen(true)
  }

  const handleSupplierCreated = () => {
    setIsCreateOpen(false)
    setCreatedMessage('Proveedor creado exitosamente.')
  }

  return (
    <AppLayout title="Proveedores">
      <div className="suppliers-page__toolbar">
        <Button onClick={handleOpenCreate}>Registrar proveedor</Button>
      </div>
      {createdMessage && (
        <div className="suppliers-page__feedback">
          <Alert tone="success">{createdMessage}</Alert>
        </div>
      )}
      <Modal open={isCreateOpen} title="Registrar proveedor" onClose={() => setIsCreateOpen(false)}>
        <CreateSupplierForm
          onCreated={handleSupplierCreated}
          onCancel={() => setIsCreateOpen(false)}
        />
      </Modal>
    </AppLayout>
  )
}
