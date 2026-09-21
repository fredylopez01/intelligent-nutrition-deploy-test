import { EmptyState } from '../components/ui/EmptyState'
import { AppLayout } from '../layouts/AppLayout'

import './ComingSoonPage.css'

interface ComingSoonPageProps {
  title: string
  description: string
}

export function ComingSoonPage({ title, description }: ComingSoonPageProps) {
  return (
    <AppLayout title={title}>
      <div className="coming-soon">
        <EmptyState eyebrow="Coming next" title={`${title} llega en un próximo sprint`}>
          <p className="coming-soon__description">{description}</p>
        </EmptyState>
      </div>
    </AppLayout>
  )
}
