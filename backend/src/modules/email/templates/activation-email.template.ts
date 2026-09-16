export interface ActivationEmailProps {
  fullName: string;
  activationUrl: string;
  logoUrl?: string;
  expirationDays?: number;
}

export const renderActivationEmailTemplate = ({
  fullName,
  activationUrl,
  logoUrl = "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT-YCt7EYTNBdULEoTP2SoK5d9F4-0P1bHmjLAnWSfN8Q&s",
  expirationDays = 3,
}: ActivationEmailProps): string => {
  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Activa tu cuenta</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Figtree:wght@400;600&family=Space+Grotesk:wght@700&display=swap');
    body {
      margin: 0;
      padding: 0;
      background-color: #F2EFEF;
      font-family: 'Figtree', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #120E0F;
      -webkit-font-smoothing: antialiased;
    }
    .container {
      max-width: 600px;
      margin: 40px auto;
      background-color: #ffffff;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 20px rgba(18, 14, 15, 0.08);
      border: 1px solid #1B1516/10;
    }
    .header {
      background-color: #120E0F;
      padding: 32px 40px;
      text-align: center;
      border-bottom: 3px solid #D61A1A;
    }
    .header img {
      max-height: 48px;
      width: auto;
    }
    .content {
      padding: 40px;
    }
    .title {
      font-family: 'Space Grotesk', sans-serif;
      font-size: 24px;
      font-weight: 700;
      color: #120E0F;
      margin-top: 0;
      margin-bottom: 16px;
      line-height: 1.3;
    }
    .text {
      font-size: 16px;
      line-height: 1.6;
      color: #1B1516;
      margin-bottom: 24px;
    }
    .btn-container {
      text-align: center;
      margin: 32px 0;
    }
    .btn {
      display: inline-block;
      background-color: #C7F04A;
      color: #120E0F;
      font-family: 'Space Grotesk', sans-serif;
      font-weight: 700;
      font-size: 16px;
      padding: 14px 32px;
      text-decoration: none;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(199, 240, 74, 0.3);
      transition: all 0.2s ease;
    }
    .notice {
      background-color: #F2EFEF;
      border-left: 4px solid #8E1418;
      padding: 16px;
      border-radius: 0 8px 8px 0;
      font-size: 14px;
      color: #1B1516;
      margin-bottom: 24px;
    }
    .footer {
      background-color: #1B1516;
      padding: 24px 40px;
      text-align: center;
      font-size: 13px;
      color: #F2EFEF;
      opacity: 0.8;
    }
    .footer a {
      color: #C7F04A;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="${logoUrl}" alt="Intelligent Nutrition Logo" />
    </div>
    <div class="content">
      <h1 class="title">¡Bienvenido a Intelligent Nutrition!</h1>
      <p class="text">Hola <strong>${fullName}</strong>,</p>
      <p class="text">
        Tu cuenta ha sido creada exitosamente. Para comenzar a utilizar la plataforma, activa tu cuenta y establece tu contraseña haciendo clic en el siguiente botón:
      </p>
      
      <div class="btn-container">
        <a href="${activationUrl}" class="btn" target="_blank">Activar Mi Cuenta</a>
      </div>

      <div class="notice">
        <strong>Importante:</strong> Este enlace de activación expirará en <strong>${expirationDays} días</strong>.
      </div>

      <p class="text" style="font-size: 14px; color: #666;">
        Si no esperabas este correo o crees que fue un error, puedes ignorarlo con seguridad.
      </p>
    </div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} Intelligent Nutrition. Todos los derechos reservados.</p>
    </div>
  </div>
</body>
</html>
  `;
};
