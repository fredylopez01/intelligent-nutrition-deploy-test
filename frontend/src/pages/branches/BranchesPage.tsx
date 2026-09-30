import { useState } from 'react'

import { CreateBranchForm } from '../../components/branches/CreateBranchForm'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { AppLayout } from '../../layouts/AppLayout'

import './BranchesPage.css'

export function BranchesPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [createdMessage, setCreatedMessage] = useState<string | null>(null)

  const handleOpenCreate = () => {
    setCreatedMessage(null)
    setIsCreateOpen(true)
  }

  const handleBranchCreated = () => {
    setIsCreateOpen(false)
    setCreatedMessage('Sede creada exitosamente.')
  }

  return (
    <AppLayout title="Sedes">
      <div className="branches-page__toolbar">
        <Button onClick={handleOpenCreate}>Registrar sede</Button>
      </div>
      {createdMessage && (
        <div className="branches-page__feedback">
          <Alert tone="success">{createdMessage}</Alert>
        </div>
      )}
      <Modal open={isCreateOpen} title="Registrar sede" onClose={() => setIsCreateOpen(false)}>
        <CreateBranchForm onCreated={handleBranchCreated} onCancel={() => setIsCreateOpen(false)} />
      </Modal>
    </AppLayout>
  )
}
