import { useEffect, useMemo } from 'react'
import { Link, NavLink } from 'react-router-dom'

import { useActiveSection } from '../../hooks/useActiveSection'
import { useBrandAssets } from '../../hooks/useBrandAssets'
import type { LegalDocument } from '../../types/legal'
import { formatLongDate } from '../../utils/format'

import { LEGAL_EMAIL } from './legalContact'

import './LegalPage.css'

interface LegalPageProps {
  content: LegalDocument
  related: { to: string; label: string }
}

function sectionNumber(index: number) {
  return String(index + 1).padStart(2, '0')
}

export function LegalPage({ content, related }: LegalPageProps) {
  const { logo } = useBrandAssets()
  const sectionIds = useMemo(() => content.sections.map((section) => section.id), [content])
  const activeId = useActiveSection(sectionIds)

  useEffect(() => {
    const previousTitle = document.title
    document.title = `${content.title} | Intelligent Nutrition`
    window.scrollTo({ top: 0, behavior: 'instant' })
    return () => {
      document.title = previousTitle
    }
  }, [content.title])

  return (
    <div className="legal">
      <header className="legal__header">
        <Link to="/" className="legal__home" aria-label="Intelligent Nutrition, ir al inicio">
          <img className="legal__logo" src={logo} alt="" />
        </Link>
        <nav className="legal__nav" aria-label="Documentos legales">
          <NavLink to="/terminos">Términos</NavLink>
          <NavLink to="/privacidad">Privacidad</NavLink>
          <Link className="legal__login" to="/login">
            Ingreso
          </Link>
        </nav>
      </header>

      <main className="legal__main">
        <div className="legal__intro">
          <Link to="/" className="legal__back">
            ← Volver al inicio
          </Link>
          <p className="legal__eyebrow">Documento legal</p>
          <h1 className="legal__title">{content.title}</h1>
          <p className="legal__summary">{content.summary}</p>
          <p className="legal__updated">
            Última actualización:{' '}
            <time dateTime={content.updatedAt}>{formatLongDate(content.updatedAt)}</time>
          </p>
        </div>

        <div className="legal__body">
          <nav className="legal__toc" aria-labelledby="legal-toc-title">
            <p className="legal__eyebrow" id="legal-toc-title">
              En esta página
            </p>
            <ol className="legal__toc-list">
              {content.sections.map((section, index) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="legal__toc-link"
                    aria-current={activeId === section.id ? 'location' : undefined}
                  >
                    <span className="legal__toc-number" aria-hidden="true">
                      {sectionNumber(index)}
                    </span>
                    {section.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <article className="legal__article">
            {content.sections.map((section, index) => (
              <section
                key={section.id}
                id={section.id}
                className="legal__section"
                aria-labelledby={`${section.id}-title`}
              >
                <h2 className="legal__section-title" id={`${section.id}-title`}>
                  <span className="legal__section-number" aria-hidden="true">
                    {sectionNumber(index)}
                  </span>
                  {section.title}
                </h2>
                {section.blocks.map((block, blockIndex) =>
                  typeof block === 'string' ? (
                    <p key={blockIndex} className="legal__paragraph">
                      {block}
                    </p>
                  ) : (
                    <ul key={blockIndex} className="legal__list">
                      {block.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ),
                )}
              </section>
            ))}

            <aside className="legal__contact" aria-label="Contacto">
              <div>
                <p className="legal__contact-title">¿Tienes preguntas sobre este documento?</p>
                <p className="legal__contact-copy">
                  Escríbenos a{' '}
                  <a className="legal__contact-email" href={`mailto:${LEGAL_EMAIL}`}>
                    {LEGAL_EMAIL}
                  </a>
                </p>
              </div>
              <Link className="legal__related" to={related.to}>
                {related.label} →
              </Link>
            </aside>
          </article>
        </div>
      </main>

      <footer className="legal__footer">
        <p>Intelligent Nutrition 2026</p>
        <div className="legal__footer-links">
          <Link to="/terminos">Términos</Link>
          <Link to="/privacidad">Privacidad</Link>
        </div>
      </footer>
    </div>
  )
}
