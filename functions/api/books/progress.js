import { jsonResponse, errorResponse, getAuthUser } from '../_utils.js';

// PUT: Actualiza el progreso de lectura del libro en Cloudflare D1
export async function onRequestPut({ request, env }) {
  try {
    const user = await getAuthUser(request, env);
    if (!user) {
      return errorResponse('No autorizado.', 401);
    }

    if (!env.DB) {
      return errorResponse('Base de datos D1 no vinculada.', 500);
    }

    const body = await request.json().catch(() => ({}));
    const { progressPercent, currentChapter, currentParagraph } = body;

    const pct = typeof progressPercent === 'number' ? Math.min(100, Math.max(0, progressPercent)) : 0;
    const chap = typeof currentChapter === 'number' ? Math.max(0, currentChapter) : 0;
    const para = typeof currentParagraph === 'number' ? Math.max(0, currentParagraph) : 0;

    await env.DB.prepare(`
      UPDATE user_books
      SET progress_percent = ?, current_chapter = ?, current_paragraph = ?, updated_at = datetime('now')
      WHERE user_id = ?
    `).bind(pct, chap, para, user.id).run();

    return jsonResponse({
      success: true,
      message: 'Progreso sincronizado en la nube.',
      progress: {
        progressPercent: pct,
        currentChapter: chap,
        currentParagraph: para
      }
    });
  } catch (err) {
    return errorResponse('Error al sincronizar progreso: ' + err.message, 500);
  }
}
