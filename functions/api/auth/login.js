import { jsonResponse, errorResponse, verifyPassword, signJWT } from '../_utils.js';

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json().catch(() => ({}));
    const { email, password } = body;

    if (!email || !password) {
      return errorResponse('Por favor completa todos los campos.', 400);
    }

    const cleanEmail = email.trim().toLowerCase();

    if (!env.DB) {
      return errorResponse('Base de datos D1 no vinculada en Cloudflare.', 500);
    }

    // Buscar usuario por correo
    const userRow = await env.DB.prepare(
      'SELECT id, email, password_hash, salt, name, provider, avatar_url FROM users WHERE email = ?'
    ).bind(cleanEmail).first();

    if (!userRow) {
      return errorResponse('Correo o contraseña incorrectos.', 401);
    }

    // Validar contraseña
    const isValid = await verifyPassword(password, userRow.password_hash, userRow.salt);
    if (!isValid) {
      return errorResponse('Correo o contraseña incorrectos.', 401);
    }

    // Consultar si tiene su libro activo (Regla: 1 libro por cuenta)
    const activeBook = await env.DB.prepare(
      'SELECT id, title, author, file_size, progress_percent, current_chapter, current_paragraph, updated_at FROM user_books WHERE user_id = ?'
    ).bind(userRow.id).first();

    const user = {
      id: userRow.id,
      email: userRow.email,
      name: userRow.name,
      provider: userRow.provider,
      avatar: userRow.avatar_url
    };

    const token = await signJWT({ sub: user.id, email: user.email, name: user.name }, env.JWT_SECRET);

    return jsonResponse({
      success: true,
      user,
      token,
      activeBook: activeBook ? {
        id: activeBook.id,
        title: activeBook.title,
        author: activeBook.author,
        progressPercent: activeBook.progress_percent,
        currentChapter: activeBook.current_chapter,
        currentParagraph: activeBook.current_paragraph,
        updatedAt: activeBook.updated_at
      } : null
    }, 200, {
      'Set-Cookie': `vozepub_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`
    });
  } catch (err) {
    return errorResponse('Error interno al iniciar sesión: ' + err.message, 500);
  }
}
