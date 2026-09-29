export interface PasswordResetEmailProps {
  fullName: string;
  resetUrl: string;
  expirationMinutes: number;
  logoUrl?: string;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

export function renderPasswordResetEmailTemplate({
  fullName,
  resetUrl,
  expirationMinutes,
  logoUrl = "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT-YCt7EYTNBdULEoTP2SoK5d9F4-0P1bHmjLAnWSfN8Q&s",
}: PasswordResetEmailProps): string {
  const expirationText =
    expirationMinutes >= 60 && expirationMinutes % 60 === 0
      ? `${expirationMinutes / 60} hora(s)`
      : `${expirationMinutes} minuto(s)`;

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Restablecer contraseña</title>
  <style>
    body { margin: 0; padding: 0; background: #F2EFEF; color: #120E0F; font-family: Arial, sans-serif; }
    .container { max-width: 600px; margin: 40px auto; background: #fff; border-radius: 12px; overflow: hidden; }
    .header { background: #120E0F; padding: 28px 40px; text-align: center; border-bottom: 3px solid #D61A1A; }
    .header img { max-height: 48px; width: auto; }
    .content { padding: 40px; }
    .title { margin: 0 0 16px; font-size: 24px; line-height: 1.3; }
    .text { margin: 0 0 20px; font-size: 16px; line-height: 1.6; }
    .button-row { margin: 32px 0; text-align: center; }
    .button { display: inline-block; padding: 14px 30px; border-radius: 8px; background: #C7F04A; color: #120E0F; font-weight: 700; text-decoration: none; }
    .notice { margin: 0 0 24px; padding: 14px 16px; border-left: 4px solid #8E1418; background: #F2EFEF; font-size: 14px; line-height: 1.5; }
    .footer { padding: 22px 40px; background: #1B1516; color: #F2EFEF; text-align: center; font-size: 13px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><img src="${escapeHtml(logoUrl)}" alt="Intelligent Nutrition"></div>
    <div class="content">
      <h1 class="title">Restablece tu contraseña</h1>
      <p class="text">Hola <strong>${escapeHtml(fullName)}</strong>,</p>
      <p class="text">Recibimos una solicitud para cambiar la contraseña de tu cuenta. Usa el siguiente botón para elegir una nueva:</p>
      <div class="button-row"><a class="button" href="${escapeHtml(resetUrl)}">Cambiar contraseña</a></div>
      <p class="notice">Este enlace vence en <strong>${expirationText}</strong> y solo puede utilizarse una vez.</p>
      <p class="text">Si no solicitaste este cambio, puedes ignorar este correo. Tu contraseña actual seguirá vigente.</p>
    </div>
    <div class="footer">© ${new Date().getFullYear()} Intelligent Nutrition. Todos los derechos reservados.</div>
  </div>
</body>
</html>`;
}
