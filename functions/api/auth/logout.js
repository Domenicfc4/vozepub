import { jsonResponse } from '../_utils.js';

export async function onRequestPost() {
  return jsonResponse({ success: true, message: 'Sesión cerrada exitosamente.' }, 200, {
    'Set-Cookie': 'vozepub_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'
  });
}
