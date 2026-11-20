import { jsonResponse, errorResponse, getAuthUser } from '../_utils.js';

// POST: Sube el archivo .epub a Cloudflare R2 y actualiza D1 (Regla: 1 libro por cuenta)
export async function onRequestPost({ request, env }) {
  try {
    const user = await getAuthUser(request, env);
    if (!user) {
      return errorResponse('No autorizado. Inicia sesión primero.', 401);
    }

    if (!env.DB) {
      return errorResponse('Base de datos D1 no vinculada en Cloudflare.', 500);
    }

    if (!env.BUCKET) {
      return errorResponse('Almacenamiento Cloudflare R2 no vinculado.', 500);
    }

    const formData = await request.formData().catch(() => null);
    if (!formData) {
      return errorResponse('Formulario no válido.', 400);
    }

    const file = formData.get('file');
    if (!file || typeof file === 'string') {
      return errorResponse('No se adjuntó ningún archivo .epub válido.', 400);
    }

    const title = (formData.get('title') || file.name.replace(/\.epub$/i, '')).trim();
    const author = (formData.get('author') || 'Autor desconocido').trim();

    // 1. Eliminar archivo anterior en R2 si ya existía (Regla de 1 libro por cuenta)
    const existing = await env.DB.prepare(
      'SELECT id, file_key FROM user_books WHERE user_id = ?'
    ).bind(user.id).first();

    if (existing && existing.file_key) {
      await env.BUCKET.delete(existing.file_key).catch(() => {});
    }

    // 2. Guardar nuevo archivo en Cloudflare R2
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileKey = `users/${user.id}/${Date.now()}_${safeName}`;

    await env.BUCKET.put(fileKey, file.stream(), {
      httpMetadata: { contentType: 'application/epub+zip' }
    });

    // 3. Registrar o actualizar en Cloudflare D1
    const bookId = 'bk_' + crypto.randomUUID().replace(/-/g, '').substring(0, 16);

    await env.DB.prepare(`
      INSERT INTO user_books (id, user_id, title, author, file_key, file_size, progress_percent, current_chapter, current_paragraph, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, datetime('now'))
      ON CONFLICT(user_id) DO UPDATE SET
        id = excluded.id,
        title = excluded.title,
        author = excluded.author,
        file_key = excluded.file_key,
        file_size = excluded.file_size,
        progress_percent = 0,
        current_chapter = 0,
        current_paragraph = 0,
        updated_at = datetime('now')
    `).bind(bookId, user.id, title, author, fileKey, file.size || 0).run();

    return jsonResponse({
      success: true,
      message: 'Libro subido y guardado exitosamente en tu cuenta.',
      book: {
        id: bookId,
        title,
        author,
        fileSize: file.size,
        progressPercent: 0
      }
    });
  } catch (err) {
    return errorResponse('Error al subir el libro: ' + err.message, 500);
  }
}
