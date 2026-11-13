import { state, SPEED_STEPS, PROSODY_PROFILES } from './state.js';
import { dom, showToast, loadSettingsAndProgress, applyVisualSettings, updateActiveVoiceBadge, saveSettingsAndProgress } from './ui.js';
import { saveEpubToIDB, loadEpubFromIDB, clearEpubFromIDB } from './storage.js';
import { parseEpubBuffer, loadChapter, revokeActiveBlobs } from './epub-core.js';
import { setTranslationMode } from './translator.js';
import { stopSpeech, togglePlayPause, startSpeechFromCurrent, setSleepTimer, testVoiceAndProsodySample, normalizeLangTag } from './tts-engine.js';

// --- FUNCIONES AUXILIARES Y DESCARGA ---
function downloadSelfHtml() {
  try {
    const fullHtml = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;
    const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lector_epub_traductor.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    showToast('Descargando lector_epub_traductor.html...');
  } catch (err) {
    showToast('No se pudo generar la descarga directa');
  }
}

async function handleFileUpload(file) {
  if (!file) return;
  try {
    const buffer = await file.arrayBuffer();
    await saveEpubToIDB(buffer, file.name);
    await parseEpubBuffer(buffer, null);
    showToast('Libro ePUB cargado y guardado en Chrome');
  } catch (err) {
    showToast('No se pudo abrir el archivo seleccionado');
  }
}

function setSpeechSpeed(newSpeed) {
  state.settings.rate = newSpeed;
  applyVisualSettings();
  showToast(`Velocidad: ${newSpeed}x`);
  if (state.isSpeaking && !state.isPaused) {
    state.speechSessionId++; // Forzamos nueva sesión
    window.speechSynthesis.cancel();
    startSpeechFromCurrent();
  }
}

function loadBrowserVoices(forceAutoSelectBest = false) {
  if (!('speechSynthesis' in window)) return;
  const rawVoices = window.speechSynthesis.getVoices() || [];
  if (rawVoices.length === 0) return;

  state.voices = rawVoices;

  const spanishVoices = rawVoices.filter(v => normalizeLangTag(v.lang).startsWith('es'));
  const englishVoices = rawVoices.filter(v => normalizeLangTag(v.lang).startsWith('en'));
  const otherVoices = rawVoices.filter(v => !normalizeLangTag(v.lang).startsWith('es') && !normalizeLangTag(v.lang).startsWith('en'));

  dom.voiceSelectEs.innerHTML = '';
  [...spanishVoices, ...otherVoices].forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.voiceURI;
    const isEs = normalizeLangTag(v.lang).startsWith('es');
    opt.textContent = `${isEs ? '🇪🇸 ' : '🌐 '}${v.name} (${v.lang.replace('_', '-')})`;
    dom.voiceSelectEs.appendChild(opt);
  });

  if (spanishVoices.some(v => v.voiceURI === state.settings.voiceURIEs)) {
    dom.voiceSelectEs.value = state.settings.voiceURIEs;
  } else if (spanishVoices.length > 0) {
    state.settings.voiceURIEs = spanishVoices[0].voiceURI;
    dom.voiceSelectEs.value = spanishVoices[0].voiceURI;
  }

  dom.voiceSelectEn.innerHTML = '';
  [...englishVoices, ...spanishVoices].forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.voiceURI;
    const isEn = normalizeLangTag(v.lang).startsWith('en');
    opt.textContent = `${isEn ? '🇬🇧 ' : '🇪🇸 '}${v.name} (${v.lang.replace('_', '-')})`;
    dom.voiceSelectEn.appendChild(opt);
  });

  if (englishVoices.some(v => v.voiceURI === state.settings.voiceURIEn)) {
    dom.voiceSelectEn.value = state.settings.voiceURIEn;
  } else if (englishVoices.length > 0) {
    state.settings.voiceURIEn = englishVoices[0].voiceURI;
    dom.voiceSelectEn.value = englishVoices[0].voiceURI;
  }
}

// --- LIBROS DE DEMOSTRACIÓN ---
async function generateAndLoadEnglishDemoEpub() {
  dom.loadingIndicator.classList.remove('hidden');
  dom.welcomeScreen.classList.add('hidden');
  dom.loadingText.textContent = 'Preparando libro en Inglés...';

  const zip = new window.JSZip();
  zip.file('mimetype', 'application/epub+zip');
  zip.folder('META-INF').file('container.xml', `<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);
  const oebps = zip.folder('OEBPS');
  
  oebps.file('content.opf', `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>The Glass Horizon (English Demo)</dc:title><dc:creator>Arthur Vance</dc:creator><dc:language>en</dc:language></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/><item id="ch2" href="ch2.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="ch1"/><itemref idref="ch2"/></spine></package>`);
  oebps.file('nav.xhtml', `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><ol><li><a href="ch1.xhtml">Chapter 1</a></li><li><a href="ch2.xhtml">Chapter 2</a></li></ol></nav></body></html>`);
  oebps.file('ch1.xhtml', `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter 1</title></head><body><h1>Chapter 1: The Signal</h1><p>Welcome to the English to Spanish ePUB reader! Right now you can switch between Original English, Translated Spanish, or Bilingual mode.</p><p>For three hundred years, the orbital observatory circled the silent planet.</p></body></html>`);
  oebps.file('ch2.xhtml', `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter 2</title></head><body><h1>Chapter 2: Footsteps</h1><p>Elena descended into the lower vault. The air smelled of ozone.</p></body></html>`);

  state.settings.translationMode = 'bilingual';
  applyVisualSettings();
  const buffer = await zip.generateAsync({ type: 'arraybuffer' });
  await saveEpubToIDB(buffer, 'english_demo.epub');
  await parseEpubBuffer(buffer, null);
  showToast('Libro en Inglés cargado (Bilingüe)');
}

async function generateAndLoadSpanishDemoEpub() {
  dom.loadingIndicator.classList.remove('hidden');
  dom.welcomeScreen.classList.add('hidden');
  dom.loadingText.textContent = 'Cargando relato en Español...';

  const zip = new window.JSZip();
  zip.file('mimetype', 'application/epub+zip');
  zip.folder('META-INF').file('container.xml', `<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);
  const oebps = zip.folder('OEBPS');
  
  oebps.file('content.opf', `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>El Observatorio</dc:title><dc:creator>VozEPUB</dc:creator><dc:language>es</dc:language></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="cap1" href="cap1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="cap1"/></spine></package>`);
  oebps.file('nav.xhtml', `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Índice</title></head><body><nav epub:type="toc"><ol><li><a href="cap1.xhtml">Capítulo 1</a></li></ol></nav></body></html>`);
  oebps.file('cap1.xhtml', `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Capítulo 1</title></head><body><h1>Capítulo 1: La señal</h1><p>¡Bienvenido a VozEPUB Pro en Chrome! Haz doble toque sobre cualquier párrafo para que la lectura en voz alta comience desde esa línea exacta.</p></body></html>`);

  state.settings.translationMode = 'original';
  applyVisualSettings();
  const buffer = await zip.generateAsync({ type: 'arraybuffer' });
  await saveEpubToIDB(buffer, 'demo_es.epub');
  await parseEpubBuffer(buffer, null);
  showToast('Relato en español listo para escuchar');
}

// --- EVENTOS PRINCIPALES ---
function initEvents() {
  dom.fileInputMain.addEventListener('change', (e) => e.target.files[0] && handleFileUpload(e.target.files[0]));
  dom.fileInputHeader.addEventListener('change', (e) => e.target.files[0] && handleFileUpload(e.target.files[0]));
  dom.btnLoadEnglishDemo.addEventListener('click', generateAndLoadEnglishDemoEpub);
  dom.btnLoadSpanishDemo.addEventListener('click', generateAndLoadSpanishDemoEpub);
  dom.btnDownloadSelf.addEventListener('click', downloadSelfHtml);

  document.querySelectorAll('.trans-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => setTranslationMode(btn.dataset.transMode));
  });

  dom.btnPlayPause.addEventListener('click', togglePlayPause);
  dom.btnStopSpeech.addEventListener('click', () => { stopSpeech(); showToast('Lectura detenida'); });

  // Evento Custom emitido desde epub-core (renderTocList)
  document.addEventListener('loadChapterRequest', (e) => loadChapter(e.detail, 0, state.isSpeaking && !state.isPaused));

  dom.btnPrevParagraph.addEventListener('click', () => {
    const wasPlaying = state.isSpeaking &&