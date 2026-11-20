import { jsonResponse, errorResponse, getAuthUser } from '../_utils.js';

// GET: Consulta el libro activo del usuario
export async function onRequestGet({ request, env }) {
  try {
    const user = await getAuthUser(request, env);
    if (!user) {
      return errorResponse('No autorizado.', 401);
    }

    if (!env.DB) {
      return errorResponse('Base de datos D1 no vinculada.', 500);
    }

    const activeBook = await env.DB.prepare(
      'SELECT id, title, author, file_size, progress_percent, current_chapter, current_paragraph, updated_at FROM user_books WHERE user_id = ?'
    ).bind(user.id).first();

    return jsonResponse({
      hasBook: !!activeBook,
      book: activeBook ? {
        id: activeBook.id,
        title: activeBook.title,
        author: activeBook.author,
        fileSize: activeBook.file_size,
        progressPercent: activeBook.progress_percent,
        currentChapter: activeBook.current_chapter,
        currentParagraph: activeBook.current_paragraph,
        updatedAt: activeBook.updated_at
      } : null
    });
  } catch (err) {
    return errorResponse('Error al consultar libro activo: ' + err.message, 500);
  }
}

// DELETE: Elimina el libro activo de la cuenta (R2 y D1)
export async function onRequestDelete({ request, env }) {
  try {
    const user = await getAuthUser(request, env);
    if (!user) {
      return errorResponse('No autorizado.', 401);
    }

    if (!env.DB) {
      return errorResponse('Base de datos D1 no vinculada.', 500);
    }

    // Obtener la clave del archivo en R2
    const currentBook = await env.DB.prepare(
      'SELECT id, file_key FROM user_books WHERE user_id = ?'
    ).bind(user.id).first();

    if (currentBook) {
      // Eliminar el archivo en Cloudflare R2
      if (env.BUCKET && currentBook.file_key) {
        await env.BUCKET.delete(currentBook.file_key).catch(() => {});
      }
      // Eliminar el registro en D1
      await env.DB.prepare('DELETE FROM user_books WHERE user_id = ?').bind(user.id).run();
    }

    return jsonResponse({ success: true, message: 'Libro eliminado de la cuenta.' });
  } catch (err) {
    return errorResponse('Error al eliminar libro: ' + err.message, 500);
  }
}
