import type { LegalDocument } from '../../types/legal'

import { LEGAL_ADDRESS, LEGAL_EMAIL, LEGAL_UPDATED_AT } from './legalContact'

export const TERMS_OF_SERVICE: LegalDocument = {
  title: 'Términos del servicio',
  summary:
    'Las condiciones para usar el sitio de Intelligent Nutrition y el sistema de gestión de nuestras sedes. Al navegar el sitio o ingresar con tu cuenta, aceptas estos términos.',
  updatedAt: LEGAL_UPDATED_AT,
  sections: [
    {
      id: 'generalidades',
      title: 'Generalidades',
      blocks: [
        'Intelligent Nutrition gestiona este sitio web. En estos términos, "nosotros", "nos" y "nuestro" se refieren a Intelligent Nutrition, y "Servicio" se refiere al sitio público y al sistema de gestión que usa el personal de nuestras sedes.',
        'Ponemos el Servicio a tu disposición siempre que aceptes la totalidad de estos términos, condiciones, políticas y avisos. Aplican a todas las personas que lo usan: visitantes, clientes, proveedores y personal de las sedes.',
        'Lee estos términos con atención antes de usar el Servicio. Si no aceptas alguno de ellos, no podrás acceder al sitio ni usar el sistema. Las funciones o herramientas nuevas que agreguemos también quedan sujetas a estos términos.',
      ],
    },
    {
      id: 'uso-y-cuentas',
      title: 'Uso del sitio y de las cuentas',
      blocks: [
        'Al aceptar estos términos declaras que eres mayor de edad en tu lugar de residencia, o que eres mayor de edad y autorizas a las personas menores a tu cargo a usar el sitio.',
        'Las cuentas del sistema de gestión las crea el Superadmin para el personal de las sedes. Sobre tu cuenta:',
        [
          'Es personal e intransferible, y su acceso depende del rol y de las sedes que tengas asignadas.',
          'Eres responsable de mantener tu contraseña en reserva y de la actividad que se realice con tu cuenta.',
          'Debes avisarnos de inmediato si sospechas que alguien más la está usando.',
          'Podemos desactivarla cuando termine tu vínculo con la empresa o si incumples estos términos.',
        ],
        'No puedes usar el Servicio para fines ilegales o no autorizados, ni infringir las leyes de tu jurisdicción, incluidas las de derechos de autor. Tampoco puedes transmitir gusanos, virus ni código de naturaleza destructiva. Incumplir cualquiera de estos términos dará lugar a la terminación inmediata del Servicio.',
      ],
    },
    {
      id: 'condiciones-generales',
      title: 'Condiciones generales',
      blocks: [
        'Nos reservamos el derecho de negar el Servicio a cualquier persona, por cualquier motivo y en cualquier momento.',
        'Aceptas no reproducir, duplicar, copiar, vender, revender ni explotar ninguna parte del Servicio, su uso o el acceso a él sin nuestro permiso expreso y por escrito.',
        'Los títulos de este documento se incluyen solo para facilitar la lectura y no limitan ni afectan estos términos.',
      ],
    },
    {
      id: 'productos-y-precios',
      title: 'Información, productos y precios',
      blocks: [
        'La información del sitio se ofrece como referencia general. No respondemos si no es precisa, completa o actual, y no debes usarla como única base para tus decisiones sin consultar fuentes más completas. Si confías en ella, lo haces bajo tu propio riesgo.',
        'Por ahora el sitio no procesa pagos en línea: las compras se realizan en nuestras sedes. La disponibilidad que mostramos por sede es una referencia y se confirma al momento de la compra.',
        'Los precios están en pesos colombianos y pueden cambiar sin previo aviso. Podemos modificar o suspender el Servicio, o cualquier parte de él, en cualquier momento.',
        'Hacemos lo posible por mostrar con precisión los colores y las imágenes de los productos, pero no garantizamos que tu pantalla los reproduzca con exactitud. Podemos limitar las cantidades de un producto por persona y descontinuar productos en cualquier momento.',
      ],
    },
    {
      id: 'terceros',
      title: 'Herramientas y enlaces de terceros',
      blocks: [
        'El Servicio puede incluir herramientas o enlaces de terceros que no controlamos, como el inicio de sesión con Google o nuestras redes sociales. Los ofrecemos "tal como están" y "según disponibilidad", sin garantías de ningún tipo.',
        'No respondemos por el contenido, la exactitud ni las prácticas de esos terceros. Revisa sus términos y políticas antes de usarlos; las quejas o preguntas sobre ellos deben dirigirse a cada tercero.',
      ],
    },
    {
      id: 'comentarios',
      title: 'Comentarios y comunicaciones',
      blocks: [
        'Si nos envías ideas, sugerencias, propuestas u otros materiales, aceptas que podemos editarlos, copiarlos, publicarlos, distribuirlos y usarlos sin restricción. No estamos obligados a mantenerlos en reserva, a pagar compensación por ellos ni a responderlos.',
        'Tus comentarios no deben infringir derechos de terceros ni contener material difamatorio, abusivo u obsceno, ni código dañino. No puedes usar un correo falso ni hacerte pasar por otra persona. Eres el único responsable de lo que envíes.',
      ],
    },
    {
      id: 'informacion-personal',
      title: 'Información personal',
      blocks: [
        'El tratamiento de los datos personales que nos entregas se rige por nuestra Política de privacidad, que forma parte de estos términos.',
      ],
    },
    {
      id: 'errores',
      title: 'Errores, inexactitudes y omisiones',
      blocks: [
        'El sitio puede contener errores tipográficos, inexactitudes u omisiones en descripciones, precios, promociones o disponibilidad. Nos reservamos el derecho de corregirlos y de cambiar o actualizar la información en cualquier momento y sin previo aviso.',
        'No estamos obligados a actualizar, modificar o aclarar la información del Servicio, salvo cuando la ley lo exija.',
      ],
    },
    {
      id: 'usos-prohibidos',
      title: 'Usos prohibidos',
      blocks: [
        'Además de lo establecido en estos términos, se prohíbe usar el Servicio o su contenido para:',
        [
          'Cualquier propósito ilegal, o para pedir a otros que participen en actos ilegales.',
          'Infringir reglamentos, normas o leyes locales, nacionales o internacionales.',
          'Infringir nuestros derechos de propiedad intelectual o los de terceros.',
          'Acosar, insultar, difamar, intimidar o discriminar por género, orientación sexual, religión, etnia, edad, nacionalidad o discapacidad.',
          'Enviar información falsa o engañosa.',
          'Cargar o transmitir virus o cualquier código que afecte el funcionamiento del Servicio o de otros sitios.',
          'Recopilar o rastrear la información personal de otras personas.',
          'Enviar spam, hacer phishing, suplantar identidades o extraer datos de forma automatizada.',
          'Interferir o eludir las funciones de seguridad del Servicio.',
        ],
        'Podemos terminar tu uso del Servicio si incurres en cualquiera de estos usos.',
      ],
    },
    {
      id: 'responsabilidad',
      title: 'Garantías y limitación de responsabilidad',
      blocks: [
        'No garantizamos que el Servicio funcione sin interrupciones, a tiempo, de forma segura o sin errores, ni que los resultados que obtengas de él sean exactos o confiables. Podemos suspenderlo por periodos indefinidos o cancelarlo sin aviso.',
        'En la medida que lo permita la ley, Intelligent Nutrition, sus directivos, empleados, contratistas y proveedores no serán responsables por daños directos, indirectos, incidentales o consecuentes, incluidas pérdidas de ingresos o de datos, que surjan del uso del Servicio.',
        'Nada de lo anterior limita los derechos que te reconoce el Estatuto del Consumidor (Ley 1480 de 2011) sobre los productos que compras en nuestras sedes.',
      ],
    },
    {
      id: 'indemnizacion',
      title: 'Indemnización',
      blocks: [
        'Aceptas indemnizar y mantener indemne a Intelligent Nutrition, a sus directivos, empleados, contratistas y proveedores frente a cualquier reclamo o demanda de un tercero, incluidos honorarios razonables de abogados, que surja de tu incumplimiento de estos términos o de la violación de una ley o de derechos de terceros.',
      ],
    },
    {
      id: 'terminacion',
      title: 'Terminación',
      blocks: [
        'Estos términos están vigentes hasta que tú o nosotros los terminemos. Puedes terminarlos cuando quieras avisándonos que ya no deseas usar el Servicio o dejando de usarlo.',
        'Si consideramos que incumpliste estos términos, podemos terminarlos sin previo aviso y negarte el acceso al Servicio. Las obligaciones adquiridas antes de la terminación siguen vigentes después de ella.',
      ],
    },
    {
      id: 'disposiciones-generales',
      title: 'Disposiciones generales',
      blocks: [
        'Si alguna disposición de estos términos se declara ilegal, nula o inaplicable, se aplicará en la medida que lo permita la ley y no afectará la validez de las demás.',
        'Que no ejerzamos un derecho o una disposición de estos términos no significa que renunciemos a él. Estos términos y las políticas publicadas en el sitio constituyen el acuerdo completo entre tú y nosotros, y reemplazan cualquier acuerdo anterior.',
      ],
    },
    {
      id: 'ley-aplicable',
      title: 'Ley aplicable',
      blocks: [
        `Estos términos se rigen por las leyes de la República de Colombia. Nuestro domicilio es ${LEGAL_ADDRESS}.`,
      ],
    },
    {
      id: 'cambios',
      title: 'Cambios en los términos',
      blocks: [
        'Puedes consultar la versión vigente de estos términos en esta página. Podemos actualizarlos, cambiarlos o reemplazarlos publicando la nueva versión aquí, con su fecha de actualización. Si sigues usando el Servicio después de un cambio, aceptas la nueva versión.',
      ],
    },
    {
      id: 'contacto',
      title: 'Contacto',
      blocks: [`Envía tus preguntas sobre estos términos a ${LEGAL_EMAIL}.`],
    },
  ],
}
