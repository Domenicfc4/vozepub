import { state, TRANS_CACHE_KEY } from './state.js';
import { dom, updateParagraphDOM, refreshAllParagraphsDOM, updatePlayerSnippet, showToast, applyVisualSettings } from './ui.js';
import { startSpeechFromCurrent } from './tts-engine.js';

export function persistTranslationCache() {
  try {
    const keys = Object.keys(state.translationCache);
    if (keys.length > 1500) {
      const keysToRemove = keys.slice(0, 400);
      keysToRemove.forEach(k => delete state.translationCache[k]);
    }
    localStorage.setItem(TRANS_CACHE_KEY, JSON.stringify(state.translationCache));
  } catch (e) {}
}

export function getTranslationCacheKey(chapterIdx, paraIdx, text) {
  const prefix = text.slice(0, 32).replace(/\s+/g, '_');
  return `${state.bookTitle}::c${chapterIdx}::p${paraIdx}::${text.length}::${prefix}`;
}

export async function fetchTranslationEnToEs(text) {
  const clean = text.trim();
  if (!clean) return '';

  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=es&dt=t&q=${encodeURIComponent(clean)}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && Array.isArray(data[0])) {
        const translated = data[0].map(segment => segment[0] || '').join('').trim();
        if (translated) return translated;
      }
    }
  } catch (err) {
    console.warn('Fallback traducción secundaria:', err);
  }

  try {
    const mmUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(clean.slice(0, 490))}&langpair=en|es`;
    const res = await fetch(mmUrl);
    if (res.ok) {
      const data = await res.json();
      if (data && data.responseData && data.responseData.translatedText) {
        return data.responseData.translatedText.trim();
      }
    }
  } catch (err2) {
    console.warn('Error en traducción MyMemory:', err2);
  }

  return clean;
}

export async function ensureParagraphTranslated(paraIdx) {
  if (paraIdx < 0 || paraIdx >= state.paragraphs.length) return '';
  if (state.translatedParagraphs[paraIdx]) {
    return state.translatedParagraphs[paraIdx];
  }

  const original = state.paragraphs[paraIdx];
  const cacheKey = getTranslationCacheKey(state.currentChapterIndex, paraIdx, original);

  if (state.translationCache[cacheKey]) {
    state.translatedParagraphs[paraIdx] = state.translationCache[cacheKey];
    updateParagraphDOM(paraIdx);
    return state.translatedParagraphs[paraIdx];
  }

  const translated = await fetchTranslationEnToEs(original);
  state.translatedParagraphs[paraIdx] = translated;
  state.translationCache[cacheKey] = translated;
  persistTranslationCache();
  updateParagraphDOM(paraIdx);
  return translated;
}

export async function translateCurrentChapterInBackground() {
  const jobId = ++state.translationJobId;
  const total = state.paragraphs.length;
  if (total === 0) return;

  let completed = 0;
  for (let i = 0; i < total; i++) {
    const key = getTranslationCacheKey(state.currentChapterIndex, i, state.paragraphs[i]);
    if (state.translationCache[key]) {
      state.translatedParagraphs[i] = state.translationCache[key];
      completed++;
    }
  }

  refreshAllParagraphsDOM();

  if (completed === total) {
    dom.translationStatusBar.classList.add('hidden');
    dom.translationStatusBar.classList.remove('flex');
    return;
  }

  dom.translationStatusBar.classList.remove('hidden');
  dom.translationStatusBar.classList.add('flex');
  dom.translationSpinner.classList.remove('hidden');
  dom.translationStatusText.textContent = 'Traduciendo capítulo al español...';
  dom.translationCountBadge.textContent = `${completed}/${total}`;

  const order = [];
  for (let i = state.currentParagraphIndex; i < total; i++) order.push(i);
  for (let i = 0; i < state.currentParagraphIndex; i++) order.push(i);

  const BATCH_SIZE = 2;
  for (let idx = 0; idx < order.length; idx += BATCH_SIZE) {
    if (jobId !== state.translationJobId) return;

    const batchIndices = order.slice(idx, idx + BATCH_SIZE).filter(pIdx => !state.translatedParagraphs[pIdx]);
    if (batchIndices.length === 0) continue;

    await Promise.all(batchIndices.map(async (pIdx) => {
      await ensureParagraphTranslated(pIdx);
      completed++;
    }));

    if (jobId !== state.translationJobId) return;
    dom.translationCountBadge.textContent = `${Math.min(completed, total)}/${total}`;

    if (batchIndices.includes(state.currentParagraphIndex)) {
      updatePlayerSnippet();
    }
  }

  if (jobId === state.translationJobId) {
    dom.translationSpinner.classList.add('hidden');
    dom.translationStatusText.textContent = 'Capítulo traducido al español';
    setTimeout(() => {
      if (jobId === state.translationJobId) {
        dom.translationStatusBar.classList.add('hidden');
        dom.translationStatusBar.classList.remove('flex');
      }
    }, 1800);
  }
}

export function setTranslationMode(mode) {
  state.settings.translationMode = mode;
  applyVisualSettings();

  if (mode === 'translated' || mode === 'bilingual') {
    translateCurrentChapterInBackground();
  } else {
    state.translationJobId++;
    dom.translationStatusBar.classList.add('hidden');
    dom.translationStatusBar.classList.remove('flex');
    refreshAllParagraphsDOM();
  }

  updatePlayerSnippet();

  if (state.isSpeaking && !state.isPaused) {
    startSpeechFromCurrent();
  }

  const modeNames = {
    original: 'Modo Original activado',
    translated: 'Traducción al Español activada (Voz ES)',
    bilingual: 'Modo Bilingüe (EN + ES) activado'
  };
  showToast(modeNames[mode] || 'Modo actualizado');
}