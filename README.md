# Voz Epub

Lector web de libros ePUB con traducción de inglés a español y lectura en voz alta. La aplicación funciona en el navegador y no requiere instalar un servidor de aplicaciones.

**Aplicación:** [epub.domethedev.com](https://epub.domethedev.com)

## Funcionalidades

- Carga libros `.epub`, muestra el índice y permite navegar por capítulos.
- Presenta el texto en modo original, traducido al español o bilingüe (inglés y español).
- Lee el contenido usando las voces disponibles en el navegador, con controles de reproducción, velocidad y temporizador de sueño.
- Guarda el libro abierto, el progreso, las preferencias y la caché de traducciones en el almacenamiento local del navegador.
- Ofrece temas oscuro, claro y sepia, ajustes de tipografía y desplazamiento automático.
- Incluye libros de demostración para probar la lectura y la traducción.

## Requisitos

- Un navegador moderno con soporte para módulos JavaScript, IndexedDB y Web Speech API. Se recomienda Google Chrome o un navegador basado en Chromium.
- Conexión a internet para cargar las dependencias externas y solicitar traducciones. La disponibilidad y calidad de las voces dependen del navegador, el sistema operativo y sus voces instaladas o de red.

La traducción se solicita a servicios externos (Google Translate y MyMemory como alternativa). Al usar los modos traducido o bilingüe, el texto de los párrafos se envía a esos servicios. Los libros y las preferencias se guardan en el almacenamiento del navegador; la aplicación no incluye un servidor propio.

## Uso local

No hay proceso de compilación ni dependencias de Node.js. Sirve los archivos mediante HTTP desde la carpeta raíz del proyecto (no abras `index.html` directamente como archivo):

```powershell
py -m http.server 8000
```

Luego abre [http://localhost:8000](http://localhost:8000) en el navegador.

1. Selecciona **Abrir** para cargar un archivo `.epub`, o inicia uno de los libros de demostración.
2. Elige **EN**, **ES** o **EN+ES** para cambiar la presentación y el idioma de la lectura.
3. Usa el reproductor inferior para reproducir, pausar, avanzar, cambiar la velocidad o activar el temporizador.
4. Abre **Ajustes** para seleccionar voces y cambiar la prosodia, la apariencia y las opciones de lectura.

## Despliegue en GitHub Pages

Voz Epub es una aplicación estática y puede publicarse desde la raíz del repositorio:

1. Sube el contenido del proyecto a `main` en [Domenicfc4/vozepub](https://github.com/Domenicfc4/vozepub).
2. En **Settings > Pages**, configura la publicación desde la rama `main` y la carpeta `/ (root)`.
3. Si se usa GitHub Pages para alojar el dominio personalizado, configura `epub.domethedev.com` en **Settings > Pages** y el registro CNAME `epub` apuntando a `domenicfc4.github.io` en el proveedor DNS. Espera la propagación DNS y activa HTTPS cuando GitHub Pages lo permita.

## Estructura del proyecto

```text
.
├── index.html           # Interfaz y punto de entrada
├── css/
│   └── style.css        # Estilos y temas
└── js/
    ├── app.js           # Inicio de la aplicación y eventos
    ├── epub-core.js     # Lectura y procesamiento de archivos ePUB
    ├── translator.js    # Traducción EN > ES y caché
    ├── tts-engine.js    # Síntesis de voz y controles de reproducción
    ├── storage.js       # Persistencia del libro con IndexedDB
    ├── state.js         # Estado y valores por defecto
    └── ui.js            # Renderizado, interfaz y preferencias
```

La interfaz carga Tailwind CSS, JSZip, Lucide y fuentes web desde CDN. Para usar la aplicación es necesario permitir la carga de estos recursos externos.

## Alcance y limitaciones

- La traducción disponible está orientada a textos en inglés traducidos al español; su calidad y disponibilidad dependen de los servicios externos.
- La lectura en voz alta usa Web Speech API, por lo que las voces, idiomas y funciones disponibles varían entre navegadores y dispositivos.
- El proyecto no incluye actualmente una configuración de compilación ni una suite de pruebas automatizadas.
- No se declara una licencia en este repositorio. Antes de aceptar reutilización o distribución del código, define y agrega una licencia.
#
