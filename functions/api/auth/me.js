import { jsonResponse, errorResponse, getAuthUser } from '../_utils.js';

export async function onRequestGet({ request, env }) {
  try {
    const user = await getAuthUser(request, env);
    if (!user) {
      return errorResponse('No autorizado o sesión caducada.', 401);
    }

    let activeBook = null;
    if (env.DB) {
      activeBook = await env.DB.prepare(
        'SELECT id, title, author, file_size, progress_percent, current_chapter, current_paragraph, updated_at FROM user_books WHERE user_id = ?'
      ).bind(user.id).first();
    }

    return jsonResponse({
      authenticated: true,
      user,
      activeBook: activeBook ? {
        id: activeBook.id,
        title: activeBook.title,
        author: activeBook.author,
        progressPercent: activeBook.progress_percent,
        currentChapter: activeBook.current_chapter,
        currentParagraph: activeBook.current_paragraph,
        updatedAt: activeBook.updated_at
      } : null
    });
  } catch (err) {
    return errorResponse('Error al consultar perfil: ' + err.message, 500);
  }
}
