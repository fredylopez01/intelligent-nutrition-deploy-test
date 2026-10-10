import { LegalPage } from './LegalPage'
import { PRIVACY_POLICY } from './privacyPolicy'

export function PrivacyPolicyPage() {
  return (
    <LegalPage
      content={PRIVACY_POLICY}
      related={{ to: '/terminos', label: 'Lee los Términos del servicio' }}
    />
  )
}
