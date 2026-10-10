import { LegalPage } from './LegalPage'
import { TERMS_OF_SERVICE } from './termsOfService'

export function TermsOfServicePage() {
  return (
    <LegalPage
      content={TERMS_OF_SERVICE}
      related={{ to: '/privacidad', label: 'Lee la Política de privacidad' }}
    />
  )
}
