import { errorResponse, getAuthUser } from '../_utils.js';

// GET: Descarga el archivo binario del .epub desde Cloudflare R2 para el lector
export async function onRequestGet({ request, env }) {
  try {
    const user = await getAuthUser(request, env);
    if (!user) {
      return errorResponse('No autorizado.', 401);
    }

    if (!env.DB || !env.BUCKET) {
      return errorResponse('Servicios de Cloudflare D1 o R2 no configurados.', 500);
    }

    const bookRow = await env.DB.prepare(
      'SELECT file_key, title FROM user_books WHERE user_id = ?'
    ).bind(user.id).first();

    if (!bookRow || !bookRow.file_key) {
      return errorResponse('No tienes ningún libro guardado en tu cuenta.', 404);
    }

    const object = await env.BUCKET.get(bookRow.file_key);
    if (!object) {
      return errorResponse('El archivo no se encontró en el almacenamiento.', 404);
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('Content-Type', 'application/epub+zip');
    headers.set('Content-Disposition', `inline; filename="${encodeURIComponent(bookRow.title)}.epub"`);

    return new Response(object.body, { headers });
  } catch (err) {
    return errorResponse('Error al descargar libro: ' + err.message, 500);
  }
}
