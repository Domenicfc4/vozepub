import { jsonResponse, errorResponse, hashPassword, signJWT } from '../_utils.js';

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json().catch(() => ({}));
    const { email, password, name } = body;

    if (!email || !password) {
      return errorResponse('Por favor ingresa tu correo y contraseña.', 400);
    }

    const cleanEmail = email.trim().toLowerCase();
    if (password.length < 6) {
      return errorResponse('La contraseña debe tener al menos 6 caracteres.', 400);
    }

    if (!env.DB) {
      return errorResponse('Base de datos D1 no vinculada en Cloudflare.', 500);
    }

    // Verificar si el correo ya está registrado
    const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?')
      .bind(cleanEmail)
      .first();

    if (existing) {
      return errorResponse('Ya existe una cuenta registrada con este correo.', 409);
    }

    // Hashear contraseña con PBKDF2
    const { hash, salt } = await hashPassword(password);
    const userId = 'usr_' + crypto.randomUUID().replace(/-/g, '').substring(0, 16);
    const userName = name ? name.trim() : cleanEmail.split('@')[0];

    await env.DB.prepare(
      'INSERT INTO users (id, email, password_hash, salt, name, provider) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(userId, cleanEmail, hash, salt, userName, 'email').run();

    const user = { id: userId, email: cleanEmail, name: userName, provider: 'email' };
    const token = await signJWT({ sub: userId, email: cleanEmail, name: userName }, env.JWT_SECRET);

    return jsonResponse({
      success: true,
      user,
      token
    }, 201, {
      'Set-Cookie': `vozepub_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`
    });
  } catch (err) {
    return errorResponse('Error interno al registrar la cuenta: ' + err.message, 500);
  }
}
