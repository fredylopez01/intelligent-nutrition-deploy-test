import type { LegalDocument } from '../../types/legal'

import { LEGAL_ADDRESS, LEGAL_EMAIL, LEGAL_UPDATED_AT } from './legalContact'

export const PRIVACY_POLICY: LegalDocument = {
  title: 'Política de privacidad',
  summary:
    'Qué datos personales recogemos, para qué los usamos, con quién los compartimos y cómo puedes conocerlos, corregirlos o pedir que los eliminemos.',
  updatedAt: LEGAL_UPDATED_AT,
  sections: [
    {
      id: 'responsable',
      title: 'Responsable del tratamiento',
      blocks: [
        `Intelligent Nutrition es responsable del tratamiento de los datos personales que se recogen en este sitio, en el sistema de gestión y en nuestras sedes de Tunja y Sogamoso. Domicilio: ${LEGAL_ADDRESS}. Correo de contacto: ${LEGAL_EMAIL}.`,
        'Esta política cumple la Ley 1581 de 2012 de protección de datos personales, el Decreto 1377 de 2013 (compilado en el Decreto 1074 de 2015) y el artículo 15 de la Constitución Política de Colombia.',
      ],
    },
    {
      id: 'datos',
      title: 'Datos que recogemos',
      blocks: [
        'Recogemos solo los datos necesarios para cada relación con la empresa:',
        [
          'Personal de las sedes: tipo y número de documento, nombres y apellidos, correo, teléfono, dirección, rol, sedes asignadas y fecha del último ingreso. La contraseña se guarda cifrada y nadie puede leerla.',
          'Clientes: tipo y número de documento, nombre o razón social, correo, teléfono, dirección y las compras que se registren a su nombre.',
          'Proveedores: tipo y número de documento, nombre o razón social, nombre comercial y datos de contacto.',
          'Actividad en el sistema: qué acción se realizó, sobre qué registro, cuándo y desde qué dirección IP.',
        ],
        'El sistema no solicita datos sensibles, como información de salud o datos biométricos.',
      ],
    },
    {
      id: 'finalidades',
      title: 'Para qué los usamos',
      blocks: [
        [
          'Crear y administrar las cuentas del personal y dar a cada persona acceso solo a lo que autoriza su rol.',
          'Enviar los correos de activación de cuenta y de recuperación de contraseña.',
          'Registrar clientes y proveedores para gestionar ventas, compras e inventario.',
          'Mantener un registro de auditoría que permita revisar quién hizo cada cambio.',
          'Atender tus consultas, solicitudes y reclamos.',
          'Cumplir obligaciones legales, contables y tributarias.',
        ],
        'No usamos tus datos para fines distintos a estos sin pedirte una nueva autorización.',
      ],
    },
    {
      id: 'google',
      title: 'Inicio de sesión con Google',
      blocks: [
        'Si eliges continuar con Google, Google nos comparte tu correo y tu perfil básico. Usamos solo el correo para encontrar la cuenta que el Superadmin creó para ti; si no existe, no creamos ninguna. No guardamos otros datos de tu cuenta de Google ni accedemos a tu correo, tus contactos o tus archivos.',
      ],
    },
    {
      id: 'navegador',
      title: 'Información guardada en tu navegador',
      blocks: [
        'Guardamos en el almacenamiento local de tu navegador la sesión activa, para que no tengas que ingresar en cada visita, y tu preferencia de tema claro u oscuro. Al cerrar sesión borramos los datos de la sesión.',
        'No usamos cookies de publicidad ni herramientas de analítica de terceros.',
      ],
    },
    {
      id: 'compartir',
      title: 'Con quién los compartimos',
      blocks: [
        'No vendemos ni alquilamos tus datos personales. Solo los compartimos con:',
        [
          'Proveedores tecnológicos que actúan como encargados del tratamiento: el alojamiento del sistema, el servicio de envío de correos (Resend) y el inicio de sesión con Google. Solo reciben lo necesario para prestar su servicio.',
          'Autoridades que los soliciten en ejercicio de sus funciones legales.',
        ],
      ],
    },
    {
      id: 'seguridad',
      title: 'Cómo los protegemos',
      blocks: [
        [
          'Las contraseñas se guardan cifradas y nunca en texto plano.',
          'Cada persona accede solo a los módulos de su rol y a la información de sus sedes asignadas.',
          'Los enlaces de activación y de recuperación de contraseña vencen.',
          'Las operaciones importantes quedan en un registro de auditoría.',
        ],
        'Ningún sistema es completamente infalible. Si detectamos un incidente que afecte tus datos, lo informaremos a la Superintendencia de Industria y Comercio, como lo exige la ley, y a las personas afectadas.',
      ],
    },
    {
      id: 'derechos',
      title: 'Tus derechos',
      blocks: [
        'Como titular de tus datos personales tienes derecho a:',
        [
          'Conocer, actualizar y rectificar tus datos.',
          'Pedir prueba de la autorización que nos diste.',
          'Saber, si lo solicitas, qué uso le hemos dado a tus datos.',
          'Presentar quejas ante la Superintendencia de Industria y Comercio (SIC).',
          'Revocar la autorización o pedir que eliminemos tus datos, cuando no exista un deber legal o contractual de conservarlos.',
          'Consultar tus datos de forma gratuita.',
        ],
      ],
    },
    {
      id: 'ejercer-derechos',
      title: 'Cómo ejercer tus derechos',
      blocks: [
        `Escríbenos a ${LEGAL_EMAIL} con tu nombre, tu número de documento, lo que solicitas y un medio para responderte.`,
        [
          'Consultas: respondemos en máximo 10 días hábiles. Si necesitamos más tiempo, te lo informamos y respondemos en máximo 5 días hábiles adicionales.',
          'Reclamos (corrección, actualización, supresión o revocatoria): respondemos en máximo 15 días hábiles, prorrogables hasta 8 días hábiles más.',
          'Si a tu reclamo le falta información, te pediremos completarla dentro de los 5 días siguientes. Si pasan 2 meses sin respuesta, entenderemos que desististe.',
        ],
        'Antes de acudir a la Superintendencia de Industria y Comercio, debes haber presentado tu consulta o reclamo ante nosotros.',
      ],
    },
    {
      id: 'conservacion',
      title: 'Cuánto tiempo los conservamos',
      blocks: [
        'Conservamos los datos mientras dure tu relación con la empresa y el tiempo adicional que exijan las normas contables, tributarias y comerciales.',
        'Para conservar la trazabilidad, el sistema desactiva las cuentas y los registros en lugar de borrarlos. Si pides la supresión de tus datos, la evaluamos según esos deberes legales y te informamos el resultado.',
      ],
    },
    {
      id: 'autorizacion',
      title: 'Autorización',
      blocks: [
        'Te pedimos autorización al momento de recoger tus datos, en la sede o al crear tu cuenta. Al ingresar al sistema aceptas esta política. Puedes revocar la autorización en cualquier momento siguiendo el procedimiento de esta página.',
      ],
    },
    {
      id: 'vigencia',
      title: 'Cambios y vigencia',
      blocks: [
        'Esta política rige desde la fecha de actualización que aparece al inicio. Si hacemos cambios importantes, publicaremos la nueva versión en esta página con su fecha y, cuando corresponda, te pediremos una nueva autorización.',
      ],
    },
  ],
}
