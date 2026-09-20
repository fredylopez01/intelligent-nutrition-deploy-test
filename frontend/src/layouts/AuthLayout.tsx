import type { ReactNode } from 'react'

import isotipo from '../assets/isotipo-watermark.png'
import logo from '../assets/logo-intelligent-nutrition.png'

import './AuthLayout.css'

interface AuthLayoutProps {
  children: ReactNode
}

export function AuthLayout({ children }: AuthLayoutProps) {
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
          <p className="auth-layout__tagline">
            Un solo inventario para tres sedes. Lo que ves en pantalla es lo que hay en el estante.
          </p>
          <p className="auth-layout__sedes">Tunja Makro, Tunja Viva, Sogamoso</p>
        </div>
      </aside>

      <main className="auth-layout__form">
        <div className="auth-layout__form-inner">{children}</div>
      </main>
    </div>
  )
}
