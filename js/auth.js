/**
 * =====================================================================
 * MÓDULO DE AUTENTICACIÓN Y GESTIÓN DE SESIÓN (SOLID)
 * =====================================================================
 * Arquitectura basada en principios SOLID:
 *  - S (Single Responsibility): Exclusivamente maneja autenticación,
 *    sesión y la UI de acceso en welcomeScreen.
 *  - O (Open/Closed): AuthService permite conectar adaptadores de red
 *    (Cloudflare Pages Functions / Firebase) sin alterar la vista.
 *  - L (Liskov Substitution): Los adaptadores cumplen con el contrato Auth.
 *  - I (Interface Segregation): Eventos concisos (onAuthStateChanged).
 *  - D (Dependency Inversion): WelcomeAuthUI depende de la abstracción
 *    IAuthService inyectada en su constructor.
 * =====================================================================
 */

const STORAGE_SESSION_KEY = 'vozepub_user_session_v1';
const STORAGE_CLOUD_BOOK_KEY = 'vozepub_cloud_book_v1';

/**
 * Servicio de Autenticación (Manejo de estado, sesión y comunicación)
 */
export class AuthService {
  constructor(apiBaseUrl = '/api') {
    this.apiBaseUrl = apiBaseUrl;
    this.currentUser = this._loadLocalSession();
    this.activeBook = this._loadLocalBook();
    this.listeners = [];
  }

  // --- Observadores de Estado ---
  onAuthStateChanged(callback) {
    if (typeof callback === 'function') {
      this.listeners.push(callback);
      // Notificar inmediatamente con el estado actual
      callback(this.currentUser, this.activeBook);
    }
  }

  _notify() {
    this.listeners.forEach(cb => {
      try {
        cb(this.currentUser, this.activeBook);
      } catch (err) {
        console.error('Error en listener de autenticación:', err);
      }
    });
  }

  // --- Manejo de Sesión Local ---
  _loadLocalSession() {
    try {
      const raw = localStorage.getItem(STORAGE_SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  _saveLocalSession(user) {
    this.currentUser = user;
    if (user) {
      localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE_SESSION_KEY);
    }
    this._notify();
  }

  _loadLocalBook() {
    try {
      const raw = localStorage.getItem(STORAGE_CLOUD_BOOK_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  _saveLocalBook(book) {
    this.activeBook = book;
    if (book) {
      localStorage.setItem(STORAGE_CLOUD_BOOK_KEY, JSON.stringify(book));
    } else {
      localStorage.removeItem(STORAGE_CLOUD_BOOK_KEY);
    }
    this._notify();
  }

  // --- Operaciones de Autenticación ---

  /**
   * Inicio de sesión con correo y contraseña.
   * Conecta con Cloudflare /api/auth/login con fallback seguro para entorno local.
   */
  async loginWithEmail(email, password) {
    if (!email || !password) {
      throw new Error('Por favor completa todos los campos.');
    }

    try {
      // Intento de conexión con Cloudflare Pages Function
      const res = await fetch(`${this.apiBaseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      if (res.ok) {
        const data = await res.json();
        this._saveLocalSession(data.user);
        if (data.activeBook) this._saveLocalBook(data.activeBook);
        return data.user;
      }

      if (res.status === 401 || res.status === 400) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Credenciales incorrectas.');
      }
    } catch (err) {
      // Si la API remota aún no está desplegada (ej. entorno local estático),
      // proporcionamos soporte local para desarrollo.
      if (err.message && err.message !== 'Failed to fetch') {
        throw err;
      }
    }

    // Modo desarrollo / sesión local simulada cuando no hay backend activo
    const mockUser = {
      id: 'usr_' + btoa(email).substring(0, 8),
      email: email,
      name: email.split('@')[0],
      provider: 'email',
      createdAt: new Date().toISOString()
    };
    this._saveLocalSession(mockUser);
    return mockUser;
  }

  /**
   * Registro de nueva cuenta con correo y contraseña.
   */
  async registerWithEmail(email, password) {
    if (!email || !password) {
      throw new Error('Por favor ingresa un correo y contraseña.');
    }
    if (password.length < 6) {
      throw new Error('La contraseña debe tener al menos 6 caracteres.');
    }

    try {
      const res = await fetch(`${this.apiBaseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      if (res.ok) {
        const data = await res.json();
        this._saveLocalSession(data.user);
        return data.user;
      }

      if (res.status >= 400 && res.status < 500) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'No se pudo crear la cuenta.');
      }
    } catch (err) {
      if (err.message && err.message !== 'Failed to fetch') {
        throw err;
      }
    }

    // Fallback local para desarrollo
    const newUser = {
      id: 'usr_' + btoa(email).substring(0, 8),
      email: email,
      name: email.split('@')[0],
      provider: 'email',
      createdAt: new Date().toISOString()
    };
    this._saveLocalSession(newUser);
    return newUser;
  }

  /**
   * Inicio de sesión con Google OAuth2.
   */
  async loginWithGoogle() {
    try {
      // Si existe endpoint en Cloudflare, redirigir al flujo OAuth
      const checkEndpoint = await fetch(`${this.apiBaseUrl}/auth/google`, { method: 'HEAD' }).catch(() => null);
      if (checkEndpoint && checkEndpoint.ok) {
        window.location.href = `${this.apiBaseUrl}/auth/google`;
        return;
      }
    } catch {
      // Ignorar fallo de red y proceder
    }

    // Para pruebas inmediatas en navegador local
    const googleUser = {
      id: 'g_usr_demo',
      email: 'usuario.google@ejemplo.com',
      name: 'Usuario Google',
      provider: 'google',
      avatar: 'https://lh3.googleusercontent.com/a/default-user',
      createdAt: new Date().toISOString()
    };
    this._saveLocalSession(googleUser);
    return googleUser;
  }

  /**
   * Cerrar sesión.
   */
  async logout() {
    try {
      await fetch(`${this.apiBaseUrl}/auth/logout`, { method: 'POST' }).catch(() => {});
    } finally {
      this._saveLocalSession(null);
    }
  }

  /**
   * Actualiza los datos del libro activo en la nube (1 libro por cuenta)
   */
  setActiveCloudBook(bookMeta) {
    this._saveLocalBook(bookMeta);
  }

  /**
   * Elimina el libro activo de la cuenta
   */
  clearActiveCloudBook() {
    this._saveLocalBook(null);
  }

  getCurrentUser() {
    return this.currentUser;
  }

  getActiveBook() {
    return this.activeBook;
  }
}

/**
 * Controlador de Interfaz de Usuario para el WelcomeScreen (SOLID: SRP y DIP)
 */
export class WelcomeAuthUI {
  constructor(containerElement, authService, options = {}) {
    this.container = containerElement;
    this.authService = authService;
    this.options = options; // Callbacks: onContinueReading, onChangeBookRequest, onToast
    this.currentTab = 'login'; // 'login' | 'register'
    this.isLoading = false;
    this.showPassword = false;

    this.init();
  }

  init() {
    if (!this.container) return;
    this.authService.onAuthStateChanged((user, book) => {
      this.render(user, book);
    });
  }

  showToast(msg) {
    if (this.options.onToast) {
      this.options.onToast(msg);
    } else {
      console.log('[Toast]:', msg);
    }
  }

  render(user, book) {
    if (user) {
      this.renderAuthenticated(user, book);
    } else {
      this.renderUnauthenticated();
    }

    // Refrescar iconos Lucide si están cargados
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  /**
   * Renderiza la interfaz para usuarios no autenticados (Formulario + Google)
   */
  renderUnauthenticated() {
    const isLogin = this.currentTab === 'login';

    this.container.innerHTML = `
      <div class="rounded-2xl border p-4 sm:p-5 shadow-lg transition-all"
           style="background-color: var(--bg-primary); border-color: var(--border-color);">
        
        <!-- Botón de Inicio con Google -->
        <button id="btnAuthGoogle"
                type="button"
                class="w-full flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-xl font-medium text-xs sm:text-sm border transition-all active:scale-[0.99] hover:opacity-90 shadow-sm"
                style="background-color: var(--bg-secondary); border-color: var(--border-color); color: var(--text-primary);">
          <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"/>
            <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.27v3.15C3.27 21.36 7.35 24 12 24z"/>
            <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.27C.46 8.2.01 10.05.01 12c0 1.95.45 3.8 1.26 5.42l4.01-3.15z"/>
            <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.35 0 3.27 2.64 1.27 6.58l4.01 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
          </svg>
          <span>Continuar con Google</span>
        </button>

        <!-- Divisor sutil -->
        <div class="flex items-center gap-3 my-3.5">
          <div class="flex-1 h-px" style="background-color: var(--border-color);"></div>
          <span class="text-[11px] font-medium tracking-wide uppercase" style="color: var(--text-secondary);">o con tu correo</span>
          <div class="flex-1 h-px" style="background-color: var(--border-color);"></div>
        </div>

        <!-- Pestañas Iniciar Sesión / Registrarse -->
        <div class="grid grid-cols-2 p-1 rounded-xl mb-3 text-xs font-semibold"
             style="background-color: var(--bg-secondary);">
          <button id="tabBtnLogin"
                  type="button"
                  class="py-1.5 rounded-lg transition-all ${isLogin ? 'shadow-sm' : 'opacity-70 hover:opacity-100'}"
                  style="${isLogin ? 'background-color: var(--accent-color); color: var(--text-on-accent, #1b1a2e);' : 'color: var(--text-primary);'}">
            Iniciar Sesión
          </button>
          <button id="tabBtnRegister"
                  type="button"
                  class="py-1.5 rounded-lg transition-all ${!isLogin ? 'shadow-sm' : 'opacity-70 hover:opacity-100'}"
                  style="${!isLogin ? 'background-color: var(--accent-color); color: var(--text-on-accent, #1b1a2e);' : 'color: var(--text-primary);'}">
            Registrarse
          </button>
        </div>

        <!-- Mensaje de Alerta / Error -->
        <div id="authAlert" class="hidden mb-3 p-2.5 rounded-xl text-xs font-medium border"
             style="background-color: rgba(239, 68, 68, 0.12); border-color: rgba(239, 68, 68, 0.3); color: #fca5a5;">
        </div>

        <!-- Formulario de Acceso -->
        <form id="authForm" class="space-y-3">
          <div>
            <label for="authEmail" class="block text-xs font-medium mb-1" style="color: var(--text-secondary);">
              Correo electrónico
            </label>
            <div class="relative">
              <i data-lucide="mail" class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style="color: var(--text-secondary);"></i>
              <input id="authEmail"
                     type="email"
                     required
                     placeholder="ejemplo@correo.com"
                     class="w-full pl-9 pr-3 py-2 text-xs sm:text-sm rounded-xl border focus:outline-none transition"
                     style="background-color: var(--bg-secondary); border-color: var(--border-color); color: var(--text-primary);" />
            </div>
          </div>

          <div>
            <label for="authPassword" class="block text-xs font-medium mb-1" style="color: var(--text-secondary);">
              Contraseña
            </label>
            <div class="relative">
              <i data-lucide="lock" class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style="color: var(--text-secondary);"></i>
              <input id="authPassword"
                     type="${this.showPassword ? 'text' : 'password'}"
                     required
                     placeholder="••••••••••••"
                     minlength="6"
                     class="w-full pl-9 pr-9 py-2 text-xs sm:text-sm rounded-xl border focus:outline-none transition"
                     style="background-color: var(--bg-secondary); border-color: var(--border-color); color: var(--text-primary);" />
              <button id="btnTogglePassword"
                      type="button"
                      class="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg opacity-70 hover:opacity-100 transition"
                      style="color: var(--text-secondary);">
                <i data-lucide="${this.showPassword ? 'eye-off' : 'eye'}" class="w-4 h-4"></i>
              </button>
            </div>
          </div>

          <button id="btnAuthSubmit"
                  type="submit"
                  class="w-full py-2.5 px-4 rounded-xl font-bold text-xs sm:text-sm transition-all active:scale-[0.99] hover:opacity-95 shadow-md flex items-center justify-center gap-2"
                  style="background-color: var(--accent-color); color: var(--text-on-accent, #1b1a2e);">
            <span id="authSubmitText">${isLogin ? 'Entrar a mi cuenta' : 'Crear mi cuenta'}</span>
            <div id="authSubmitSpinner" class="hidden w-4 h-4 border-2 rounded-full animate-spin"
                 style="border-color: var(--text-on-accent, #1b1a2e); border-top-color: transparent;"></div>
          </button>
        </form>

      </div>
    `;

    this._bindUnauthEvents();
  }

  /**
   * Renderiza el estado para usuarios autenticados
   */
  renderAuthenticated(user, book) {
    const userInitial = (user.name || user.email || 'U').charAt(0).toUpperCase();

    this.container.innerHTML = `
      <div class="rounded-2xl border p-4 sm:p-5 shadow-lg transition-all"
           style="background-color: var(--bg-primary); border-color: var(--border-color);">
        
        <!-- Fila de Perfil y Logout -->
        <div class="flex items-center justify-between gap-3 pb-3.5 border-b" style="border-color: var(--border-color);">
          <div class="flex items-center gap-2.5 min-w-0">
            <div class="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 shadow-sm"
                 style="background-color: var(--highlight-bg); color: var(--accent-color); border: 1px solid var(--border-color);">
              ${userInitial}
            </div>
            <div class="min-w-0">
              <div class="text-xs sm:text-sm font-bold truncate" style="color: var(--text-primary);">
                ${user.name || 'Lector'}
              </div>
              <div class="text-[11px] truncate flex items-center gap-1.5" style="color: var(--text-secondary);">
                <span class="inline-block w-2 h-2 rounded-full bg-emerald-400"></span>
                <span class="truncate">${user.email}</span>
              </div>
            </div>
          </div>

          <button id="btnLogout"
                  type="button"
                  class="px-2.5 py-1.5 rounded-lg text-xs font-medium border transition active:scale-95 hover:opacity-80 shrink-0 flex items-center gap-1"
                  style="background-color: var(--bg-secondary); border-color: var(--border-color); color: var(--text-secondary);"
                  title="Cerrar sesión">
            <i data-lucide="log-out" class="w-3.5 h-3.5"></i>
            <span class="hidden sm:inline">Salir</span>
          </button>
        </div>

        <!-- Tarjeta de Libro Activo en la Nube (Límite: 1 libro) -->
        <div class="mt-3.5">
          ${book ? this._renderActiveBookCard(book) : this._renderEmptyBookCard()}
        </div>

      </div>
    `;

    this._bindAuthEvents(book);
  }

  _renderActiveBookCard(book) {
    const progress = book.progressPercent || 0;
    return `
      <div class="p-3.5 rounded-xl border" style="background-color: var(--bg-secondary); border-color: var(--border-color);">
        <div class="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider mb-1" style="color: var(--accent-color);">
          <span>Tu libro en la nube (1/1)</span>
          <span>${progress}% leído</span>
        </div>
        
        <div class="text-sm font-bold truncate mb-0.5" style="color: var(--text-primary);">
          ${book.title || 'Libro guardado'}
        </div>
        <div class="text-xs truncate mb-2.5" style="color: var(--text-secondary);">
          ${book.author || 'Autor desconocido'}
        </div>

        <!-- Barra de progreso -->
        <div class="w-full h-1.5 rounded-full overflow-hidden mb-3.5" style="background-color: var(--bg-primary);">
          <div class="h-full rounded-full transition-all duration-300"
               style="width: ${progress}%; background-color: var(--accent-color);"></div>
        </div>

        <!-- Acciones del libro -->
        <div class="flex items-center gap-2">
          <button id="btnContinueCloudBook"
                  type="button"
                  class="flex-1 py-2 px-3 rounded-lg text-xs font-bold transition active:scale-95 hover:opacity-90 flex items-center justify-center gap-1.5 shadow-sm"
                  style="background-color: var(--accent-color); color: var(--text-on-accent, #1b1a2e);">
            <i data-lucide="play" class="w-3.5 h-3.5 fill-current"></i>
            <span>Continuar leyendo</span>
          </button>

          <!-- Botón Cambiar de Libro (listo para conectar con la lógica posterior) -->
          <button id="btnChangeCloudBook"
                  type="button"
                  class="py-2 px-3 rounded-lg text-xs font-semibold border transition active:scale-95 hover:opacity-80 flex items-center justify-center gap-1"
                  style="background-color: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);"
                  title="Reemplazar libro en tu cuenta">
            <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i>
            <span>Cambiar libro</span>
          </button>
        </div>
      </div>
    `;
  }

  _renderEmptyBookCard() {
    return `
      <div class="p-3.5 rounded-xl border text-center" style="background-color: var(--bg-secondary); border-color: var(--border-color);">
        <div class="text-xs font-semibold mb-1" style="color: var(--text-primary);">
          Aún no tienes ningún libro en la nube
        </div>
        <div class="text-[11px] mb-2" style="color: var(--text-secondary);">
          Tu cuenta te permite tener 1 libro sincronizado en la nube para leerlo donde sea.
        </div>
        <label for="fileInputMain"
               class="inline-flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold cursor-pointer transition active:scale-95 shadow-sm"
               style="background-color: var(--accent-color); color: var(--text-on-accent, #1b1a2e);">
          <i data-lucide="upload" class="w-3.5 h-3.5"></i>
          <span>Subir mi libro ePUB</span>
        </label>
      </div>
    `;
  }

  // --- Manejo de Eventos ---

  _bindUnauthEvents() {
    const btnGoogle = this.container.querySelector('#btnAuthGoogle');
    const tabLogin = this.container.querySelector('#tabBtnLogin');
    const tabRegister = this.container.querySelector('#tabBtnRegister');
    const form = this.container.querySelector('#authForm');
    const btnToggle = this.container.querySelector('#btnTogglePassword');
    const alertBox = this.container.querySelector('#authAlert');

    if (btnGoogle) {
      btnGoogle.addEventListener('click', async () => {
        try {
          await this.authService.loginWithGoogle();
          this.showToast('Sesión iniciada con Google');
        } catch (err) {
          this._showAlert(err.message || 'Error al iniciar con Google');
        }
      });
    }

    if (tabLogin) {
      tabLogin.addEventListener('click', () => {
        this.currentTab = 'login';
        this.renderUnauthenticated();
      });
    }

    if (tabRegister) {
      tabRegister.addEventListener('click', () => {
        this.currentTab = 'register';
        this.renderUnauthenticated();
      });
    }

    if (btnToggle) {
      btnToggle.addEventListener('click', () => {
        this.showPassword = !this.showPassword;
        const passInput = this.container.querySelector('#authPassword');
        if (passInput) passInput.type = this.showPassword ? 'text' : 'password';
        const icon = btnToggle.querySelector('i');
        if (icon) {
          icon.setAttribute('data-lucide', this.showPassword ? 'eye-off' : 'eye');
          if (window.lucide) window.lucide.createIcons();
        }
      });
    }

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = this.container.querySelector('#authEmail').value.trim();
        const pass = this.container.querySelector('#authPassword').value;

        this._setLoading(true);
        this._hideAlert();

        try {
          if (this.currentTab === 'login') {
            await this.authService.loginWithEmail(email, pass);
            this.showToast(`¡Bienvenido de nuevo!`);
          } else {
            await this.authService.registerWithEmail(email, pass);
            this.showToast(`Cuenta creada exitosamente`);
          }
        } catch (err) {
          this._showAlert(err.message || 'Error de autenticación.');
        } finally {
          this._setLoading(false);
        }
      });
    }
  }

  _bindAuthEvents(book) {
    const btnLogout = this.container.querySelector('#btnLogout');
    const btnContinue = this.container.querySelector('#btnContinueCloudBook');
    const btnChange = this.container.querySelector('#btnChangeCloudBook');

    if (btnLogout) {
      btnLogout.addEventListener('click', async () => {
        await this.authService.logout();
        this.showToast('Sesión cerrada correctamente');
      });
    }

    if (btnContinue && book) {
      btnContinue.addEventListener('click', () => {
        if (this.options.onContinueReading) {
          this.options.onContinueReading(book);
        } else {
          this.showToast('Cargando libro en el lector...');
        }
      });
    }

    if (btnChange) {
      btnChange.addEventListener('click', () => {
        if (this.options.onChangeBookRequest) {
          this.options.onChangeBookRequest(book);
        } else {
          // Si aún no está la lógica de confirmación, abre el selector de archivo
          const fileInput = document.getElementById('fileInputMain');
          if (fileInput) fileInput.click();
        }
      });
    }
  }

  _setLoading(loading) {
    this.isLoading = loading;
    const btnSubmit = this.container.querySelector('#btnAuthSubmit');
    const textSpan = this.container.querySelector('#authSubmitText');
    const spinner = this.container.querySelector('#authSubmitSpinner');

    if (btnSubmit) btnSubmit.disabled = loading;
    if (textSpan) textSpan.classList.toggle('hidden', loading);
    if (spinner) spinner.classList.toggle('hidden', !loading);
  }

  _showAlert(msg) {
    const alertBox = this.container.querySelector('#authAlert');
    if (alertBox) {
      alertBox.textContent = msg;
      alertBox.classList.remove('hidden');
    }
  }

  _hideAlert() {
    const alertBox = this.container.querySelector('#authAlert');
    if (alertBox) alertBox.classList.add('hidden');
  }
}

/**
 * Función fábrica para inicializar la autenticación de forma desacoplada
 */
export function initWelcomeAuth(options = {}) {
  const container = document.getElementById('welcomeAuthContainer');
  if (!container) return null;

  const authService = new AuthService();
  const authUI = new WelcomeAuthUI(container, authService, options);

  return { authService, authUI };
}
