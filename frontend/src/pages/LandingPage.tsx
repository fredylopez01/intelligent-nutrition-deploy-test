import { Link } from 'react-router-dom'

import isotipo from '../assets/isotipo-watermark.png'
import logo from '../assets/logo-intelligent-nutrition.png'
import { MediaPlaceholder } from '../components/ui/MediaPlaceholder'

import './LandingPage.css'

const HIGHLIGHTS = [
  { title: '100% original', description: 'Producto con importador verificable' },
  { title: '3 sedes', description: 'Tunja Makro, Tunja Viva y Sogamoso' },
  { title: 'Asesoría incluida', description: 'Acompañamiento al elegir y al dosificar' },
]
const FEATURED_PRODUCTS = [
  {
    category: 'Proteína',
    name: 'Proscience Best Whey Vainilla 5lb',
    price: '$339.900',
    availability: '3 sedes',
  },
  {
    category: 'Proteína',
    name: 'Dymatize Elite Whey 5lb',
    price: '$467.900',
    availability: '2 sedes',
  },
  {
    category: 'Creatina',
    name: 'Iron Creatina Ultra Pure 500g',
    price: '$109.990',
    availability: 'Última unidad',
    scarce: true,
  },
  {
    category: 'Pre-entreno',
    name: 'Insane Labz Psychotic Gold',
    price: '$151.199',
    availability: '3 sedes',
  },
]
const ADVISORY_STEPS = [
  'Revisamos objetivo, peso y frecuencia de entrenamiento',
  'Comparamos etiquetas, gramaje real y precio por servicio',
  'Dejamos la dosificación por escrito al entregar el producto',
]
const STORES = [
  { city: 'Tunja', name: 'Sede Makro' },
  { city: 'Tunja', name: 'Sede Viva' },
  { city: 'Sogamoso', name: 'Sede Sogamoso' },
]
export function LandingPage() {
  return (
    <div className="landing">
      <header className="landing__header">
        <img className="landing__logo" src={logo} alt="Intelligent Nutrition" />
        <nav className="landing__nav" aria-label="Navegación del sitio">
          <a href="#productos">Productos</a>
          <a href="#asesoria">Asesoría</a>
          <a href="#sedes">Sedes</a>
          <a href="#contacto">Contacto</a>
          <Link className="landing__login" to="/login">
            Ingreso
          </Link>
        </nav>
      </header>
      <section className="landing__hero">
        <div className="landing__hero-glow" aria-hidden="true" />
        <img className="landing__hero-mark" src={isotipo} alt="" aria-hidden="true" />
        <div className="landing__hero-copy">
          <h1 className="landing__title">
            Suplementación
            <br />
            con criterio, no
            <br />
            con promesas.
          </h1>
          <p className="landing__subtitle">
            Marcas originales, stock verificado y asesoría en sede para elegir lo que tu
            entrenamiento necesita.
          </p>
          <div className="landing__hero-actions">
            <a className="landing__cta" href="#productos">
              Ver catálogo
            </a>
            <a className="landing__cta landing__cta--ghost" href="#sedes">
              Visitar una sede
            </a>
          </div>
        </div>
        <div className="landing__hero-media">
          <div className="landing__hero-image">
            <MediaPlaceholder label="Foto principal: producto o sede" />
          </div>
          <div className="landing__hero-card">
            <p className="landing__eyebrow">Inventario en vivo</p>
            <p className="landing__hero-card-value">3 sedes, un solo stock</p>
          </div>
        </div>
      </section>
      <section className="landing__highlights" aria-label="Por qué comprar aquí">
        {HIGHLIGHTS.map((item) => (
          <div className="landing__highlight" key={item.title}>
            <p className="landing__highlight-title">{item.title}</p>
            <p className="landing__highlight-description">{item.description}</p>
          </div>
        ))}
      </section>
      <section className="landing__section" id="productos" aria-labelledby="productos-title">
        <div className="landing__section-head">
          <div>
            <p className="landing__eyebrow">Catálogo</p>
            <h2 className="landing__section-title" id="productos-title">
              Nuestros productos
            </h2>
          </div>
          <span className="landing__section-note">Catálogo completo, próximamente</span>
        </div>
        <ul className="landing__products">
          {FEATURED_PRODUCTS.map((product) => (
            <li className="landing__product" key={product.name}>
              <div className="landing__product-media">
                <MediaPlaceholder label="Foto producto" />
              </div>
              <div className="landing__product-body">
                <p className="landing__eyebrow">{product.category}</p>
                <p className="landing__product-name">{product.name}</p>
                <div className="landing__product-footer">
                  <span className="landing__product-price">{product.price}</span>
                  <span
                    className={`landing__product-stock${
                      product.scarce ? ' landing__product-stock--scarce' : ''
                    }`}
                  >
                    {product.availability}
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section className="landing__advisory" id="asesoria" aria-labelledby="asesoria-title">
        <div className="landing__advisory-media">
          <MediaPlaceholder label="Foto de asesoría en sede" />
        </div>
        <div>
          <h2 className="landing__section-title" id="asesoria-title">
            Alguien que sabe, del otro lado del mostrador
          </h2>
          <p className="landing__advisory-copy">
            Cada sede tiene personal formado para revisar tu objetivo, tu rutina y lo que ya estás
            tomando antes de recomendarte algo. Si no lo necesitas, te lo decimos.
          </p>
          <ol className="landing__steps">
            {ADVISORY_STEPS.map((step, index) => (
              <li className="landing__step" key={step}>
                <span className="landing__step-number">{String(index + 1).padStart(2, '0')}</span>
                <p>{step}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
      <section
        className="landing__section landing__section--tight"
        id="sedes"
        aria-labelledby="sedes-title"
      >
        <h2 className="landing__section-title" id="sedes-title">
          Dónde estamos
        </h2>
        <ul className="landing__stores">
          {STORES.map((store) => (
            <li className="landing__store" key={store.name}>
              <p className="landing__eyebrow">{store.city}</p>
              <p className="landing__store-name">{store.name}</p>
              <p className="landing__store-detail">Dirección y horario por confirmar</p>
              <span className="landing__store-status">
                <span className="landing__dot" aria-hidden="true" />
                Abierta
              </span>
            </li>
          ))}
        </ul>
      </section>
      <footer className="landing__footer" id="contacto">
        <div className="landing__footer-grid">
          <div>
            <img className="landing__footer-logo" src={logo} alt="Intelligent Nutrition" />
            <p className="landing__footer-copy">
              Suplementación deportiva con asesoría, en Tunja y Sogamoso.
            </p>
          </div>
          <div>
            <p className="landing__eyebrow">Contáctanos</p>
            <p className="landing__footer-item">WhatsApp por confirmar</p>
            <p className="landing__footer-item">Correo por confirmar</p>
          </div>
          <div>
            <p className="landing__eyebrow">Redes sociales</p>
            <p className="landing__footer-item">Instagram</p>
            <p className="landing__footer-item">Facebook</p>
          </div>
        </div>
        <div className="landing__footer-bottom">
          <p>Intelligent Nutrition 2026</p>
          <div className="landing__footer-links">
            <Link to="/terminos">Términos</Link>
            <Link to="/privacidad">Privacidad</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
