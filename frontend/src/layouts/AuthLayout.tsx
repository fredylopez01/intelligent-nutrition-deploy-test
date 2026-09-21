import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import isotipo from '../assets/isotipo-watermark.png'
import logo from '../assets/logo-intelligent-nutrition.png'

import './AuthLayout.css'

const DEFAULT_TAGLINE =
  'Un solo inventario para tres sedes. Lo que ves en pantalla es lo que hay en el estante.'

interface AuthLayoutProps {
  children: ReactNode
  /** Enlace opcional en la esquina superior izquierda del panel del formulario. */
  back?: { to: string; label: string }
  /** Frase del panel de marca. Por defecto, el claim general del producto. */
  tagline?: string
}

export function AuthLayout({ children, back, tagline = DEFAULT_TAGLINE }: AuthLayoutProps) {
  return (
    <div className="auth-layout">
      <aside className="auth-layout__brand">
        <div className="auth-layout__brand-glow" aria-hidden="true" />
        <img
          className="auth-layout__mark auth-layout__mark--top"
          src={isotipo}
          alt=""
          aria-hidden="true"
        />
        <img
          className="auth-layout__mark auth-layout__mark--bottom"
          src={isotipo}
          alt=""
          aria-hidden="true"
        />

        <img className="auth-layout__logo" src={logo} alt="Intelligent Nutrition" />

        <div className="auth-layout__brand-copy">
          <p className="auth-layout__tagline">{tagline}</p>
          <p className="auth-layout__sedes">Tunja Makro, Tunja Viva, Sogamoso</p>
        </div>
      </aside>

      <main className="auth-layout__form">
        {back && (
          <Link to={back.to} className="auth-layout__back">
            {back.label}
          </Link>
        )}
        <div className="auth-layout__form-inner">{children}</div>
      </main>
    </div>
  )
}
