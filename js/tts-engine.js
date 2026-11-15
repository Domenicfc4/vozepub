import { state } from './state.js';
import { dom, showToast, saveSettingsAndProgress, updateActiveVoiceBadge, updatePlayerSnippet, selectParagraph } from './ui.js';
import { ensureParagraphTranslated } from './translator.js';
import { loadChapter } from './epub-core.js';

export function normalizeLangTag(lang) {
  return (lang || '').replace('_', '-').toLowerCase();
}

export function isNetworkVoice(voice) {
  if (!voice) return false;
  const nameLower = (voice.name || '').toLowerCase();
  const uriLower = (voice.voiceURI || '').toLowerCase();
  if (voice.localService === false) return true;
  return (
    nameLower.includes('network') || nameLower.includes('natural') ||
    nameLower.includes('online') || nameLower.includes('wavenet') ||
    nameLower.includes('neural') || uriLower.includes('network') ||
    uriLower.includes('_net')
  );
}

export function scoreVoice(voice, targetLangPrefix) {
  if (!voice) return -999;
  const lang = normalizeLangTag(voice.lang);
  const nameLower = (voice.name || '').toLowerCase();
  const uriLower = (voice.voiceURI || '').toLowerCase();
  if (!lang.startsWith(targetLangPrefix)) return -500;

  let score = 100;
  if (isNetworkVoice(voice)) score += 120;
  if (nameLower.includes('natural') || nameLower.includes('neural') || nameLower.includes('wavenet')) score += 60;
  if (nameLower.includes('network') || uriLower.includes('network')) score += 50;
  if (nameLower.includes('google')) score += 30;
  if (nameLower.includes('premium') || nameLower.includes('enhanced')) score += 25;
  if (nameLower.includes('compact') || nameLower.includes('espeak')) score -= 50;

  if (targetLangPrefix === 'es') {
    if (lang === 'es-us' || lang === 'es-419' || lang === 'es-mx' || lang === 'es-pe') score += 18;
    else if (lang === 'es-es') score += 15;
    else score += 10;
  } else if (targetLangPrefix === 'en') {
    if (lang === 'en-us' || lang === 'en-gb') score += 18;
  }
  return score;
}

export function formatVoiceOptionLabel(voice) {
  const net = isNetworkVoice(voice);
  const qualityTag = net ? '☁️ HD Red' : '📱 Local';
  const cleanLang = (voice.lang || '').replace('_', '-');
  return `[${qualityTag}] ${voice.name} (${cleanLang})`;
}

export function cleanTextForTTS(rawText, isSpanish = true) {
  if (!rawText) return '';
  let text = rawText.replace(/[\u00AD\u200B\u200C\u200D\uFEFF]/g, '');
  text = text.replace(/([a-záéíóúñüA-ZÁÉÍÓÚÑÜ])-\s+([a-záéíóúñü])/g, '$1$2');

  if (!state.settings.cleanTextForTTS) return text.replace(/\s+/g, ' ').trim();

  text = text.replace(/\[\s*\d+\s*\]/g, ' ');
  text = text.replace(/\[\s*(?:nota|note|ref)\s*\d*\s*\]/gi, ' ');
  text = text.replace(/(?:\*\s*){2,}\*/g, ' ');
  text = text.replace(/[-_=]{3,}/g, ' ');
  text = text.replace(/https?:\/\/[^\s)]+/gi, isSpanish ? ' enlace web ' : ' web link ');
  text = text.replace(/…/g, '...');
  text = text.replace(/[“”«»„]/g, '"');
  text = text.replace(/[‘’‚]/g, "'");
  
  text = text.replace(/(^|[.!?]\s+)[—–―-]+\s*/g, '$1');
  text = text.replace(/\s*[—–―]+\s*/g, ', ');
  text = text.replace(/\s*--\s*/g, ', ');

  if (isSpanish) {
    const esRules = [
      [/\bCap\.\s*(\d+)/gi, 'Capítulo $1'], [/\bCap\./gi, 'Capítulo'], [/\bCaps\./gi, 'Capítulos'],
      [/\bSr\./g, 'Señor'], [/\bSra\./g, 'Señora'], [/\bSrta\./g, 'Señorita'],
      [/\bDr\./g, 'Doctor'], [/\bDra\./g, 'Doctora'], [/\bProf\./g, 'Profesor'],
      [/\bProfa\./g, 'Profesora'], [/\bSt\./g, 'San'], [/\bSta\./g, 'Santa'],
      [/\bpág\./gi, 'página'], [/\bpágs\./gi, 'páginas'], [/\bvol\./gi, 'volumen'],
      [/\bnúm\./gi, 'número'], [/\bfig\./gi, 'figura'], [/\baprox\./gi, 'aproximadamente'],
      [/\bp\.\s*ej\./gi, 'por ejemplo'], [/\betc\./gi, 'etcétera']
    ];
    esRules.forEach(([r, rep]) => text = text.replace(r, rep));
  } else {
    const enRules = [
      [/\bCh\.\s*(\d+)/gi, 'Chapter $1'], [/\bMr\./g, 'Mister'], [/\bMrs\./g, 'Misses'],
      [/\bMs\./g, 'Miz'], [/\bDr\./g, 'Doctor'], [/\bProf\./g, 'Professor'],
      [/\bSt\./g, 'Saint'], [/\bVol\./gi, 'Volume'], [/\bFig\./gi, 'Figure'],
      [/\be\.g\./gi, 'for example'], [/\bi\.e\./gi, 'that is'], [/\bvs\./gi, 'versus'],
      [/\betc\./gi, 'et cetera']
    ];
    enRules.forEach(([r, rep]) => text = text.replace(r, rep));
  }

  text = text.replace(/,\s*,+/g, ',');
  text = text.replace(/,\s*([.!?])/g, '$1');
  return text.replace(/\s+/g, ' ').trim();
}

export function buildProsodyChunksForParagraph(rawText, isSpanish = true, tagType = 'p') {
  const cleaned = cleanTextForTTS(rawText, isSpanish);
  if (!cleaned) return [];
  const isHeading = tagType && tagType.startsWith('h');
  const maxLen = 168;
  const scale = state.settings.pauseScale || 1.0;
  const ELLIPSIS_TOKEN = '___ELLIPSIS___';
  const safeText = cleaned.replace(/\.\.\./g, ELLIPSIS_TOKEN);
  const sentenceMatches = safeText.match(/[^.!?]+(?:[.!?]+|___ELLIPSIS___|$)/g) || [safeText];
  const rawUnits = [];

  for (let rawSent of sentenceMatches) {
    let sentence = rawSent.replace(new RegExp(ELLIPSIS_TOKEN, 'g'), '...').trim();
    if (!sentence) continue;

    if (sentence.length <= maxLen) {
      rawUnits.push(sentence);
    } else {
      const subClauses = sentence.match(/[^;:]+(?:[;:]+|$)/g) || [sentence];
      let buffer = '';
      for (const clause of subClauses) {
        const trimmedClause = clause.trim();
        if (!trimmedClause) continue;
        if ((buffer + ' ' + trimmedClause).trim().length <= maxLen) {
          buffer = (buffer + ' ' + trimmedClause).trim();
        } else {
          if (buffer) rawUnits.push(buffer);
          if (trimmedClause.length <= maxLen) buffer = trimmedClause;
          else {
            const commaParts = trimmedClause.match(/[^,]+(?:,+|$)/g) || [trimmedClause];
            let commaBuf = '';
            for (const cPart of commaParts) {
              const tc = cPart.trim();
              if ((commaBuf + ' ' + tc).trim().length <= maxLen) commaBuf = (commaBuf + ' ' + tc).trim();
              else {
                if (commaBuf) rawUnits.push(commaBuf);
                if (tc.length <= maxLen) commaBuf = tc;
                else {
                  const words = tc.split(' ');
                  let wBuf = '';
                  for (const w of words) {
                    if ((wBuf + ' ' + w).trim().length <= maxLen) wBuf = (wBuf + ' ' + w).trim();
                    else {
                      if (wBuf) rawUnits.push(wBuf);
                      wBuf = w;
                    }
                  }
                  commaBuf = wBuf;
                }
              }
            }
            buffer = commaBuf;
          }
        }
      }
      if (buffer) rawUnits.push(buffer);
    }
  }

  return rawUnits.map((unitText, idx) => {
    const isLastInParagraph = idx === rawUnits.length - 1;
    let basePauseMs = 180;
    if (isLastInParagraph) basePauseMs = isHeading ? 640 : 480;
    else if (unitText.endsWith('...') || unitText.endsWith('?') || unitText.endsWith('!')) basePauseMs = 360;
    else if (unitText.endsWith('.')) basePauseMs = 260;
    else if (unitText.endsWith(';') || unitText.endsWith(':')) basePauseMs = 190;
    else if (unitText.endsWith(',')) basePauseMs = 120;
    else basePauseMs = 90;

    const speedFactor = Math.max(0.65, 1 / Math.sqrt(state.settings.rate || 1.0));
    return { text: unitText, pauseAfterMs: Math.round(basePauseMs * scale * speedFactor), isHeading };
  });
}

export async function requestWakeLock() {
  if ('wakeLock' in navigator && !state.wakeLock) {
    try {
      state.wakeLock = await navigator.wakeLock.request('screen');
      state.wakeLock.addEventListener('release', () => { state.wakeLock = null; });
    } catch (e) {}
  }
}

export function releaseWakeLock() {
  if (state.wakeLock) {
    state.wakeLock.release().catch(() => {});
    state.wakeLock = null;
  }
}

export function updateMediaSessionMetadata() {
  if (!('mediaSession' in navigator)) return;
  const chapTitle = state.spine[state.currentChapterIndex]?.title || 'Capítulo';
  navigator.mediaSession.metadata = new MediaMetadata({
    title: `${chapTitle} (Pág. ${state.currentParagraphIndex + 1})`,
    artist: state.bookAuthor || 'VozEPUB Pro',
    album: state.bookTitle
  });
  navigator.mediaSession.setActionHandler('play', () => {
    if (!state.isSpeaking || state.isPaused) togglePlayPause();
  });
  navigator.mediaSession.setActionHandler('pause', () => {
    if (state.isSpeaking && !state.isPaused) togglePlayPause();
  });
  navigator.mediaSession.setActionHandler('previoustrack', () => dom.btnPrevParagraph.click());
  navigator.mediaSession.setActionHandler('nexttrack', () => dom.btnNextParagraph.click());
}

export function updateAudioUI() {
  const active = state.isSpeaking && !state.isPaused;
  dom.iconPlayPause = document.getElementById('iconPlayPause');
  dom.iconPlayPause.setAttribute('data-lucide', active ? 'pause' : 'play');
  dom.iconPlayPause.classList.remove('lucide-play', 'lucide-pause');
  if (window.lucide) {
    window.lucide.createIcons();
    dom.iconPlayPause = document.getElementById('iconPlayPause');
  }
  dom.crosshairIcon = document.getElementById('crosshairIcon');

  if (active) {
    dom.miniWaveIndicator.classList.remove('hidden');
    dom.miniWaveIndicator.classList.add('flex');
    dom.crosshairIcon.classList.add('hidden');
  } else {
    dom.miniWaveIndicator.classList.add('hidden');
    dom.miniWaveIndicator.classList.remove('flex');
    dom.crosshairIcon.classList.remove('hidden');
  }
  updateActiveVoiceBadge();
}

export function clearSpeechPauseTimer() {
  if (state.speechTimerId) {
    clearTimeout(state.speechTimerId);
    state.speechTimerId = null;
  }
}

export function stopSpeech() {
  state.speechSessionId++;
  clearSpeechPauseTimer();
  state.isSpeaking = false;
  state.isPaused = false;
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  releaseWakeLock();
  updateAudioUI();
}

export async function startSpeechFromCurrent() {
  if (!('speechSynthesis' in window)) return showToast('Tu navegador no soporta síntesis de voz');
  if (state.paragraphs.length === 0) return showToast('Primero sube un libro ePUB o abre el libro de prueba');

  clearSpeechPauseTimer();
  window.speechSynthesis.cancel();
  const sessionId = ++state.speechSessionId;

  state.isSpeaking = true;
  state.isPaused = false;
  requestWakeLock();
  updateAudioUI();
  updateMediaSessionMetadata();

  const pIdx = state.currentParagraphIndex;
  const shouldReadSpanish = state.settings.translationMode === 'translated' || state.settings.translationMode === 'bilingual' || state.individualTransShown[pIdx];

  if (shouldReadSpanish && !state.translatedParagraphs[pIdx]) {
    dom.playerSnippetText.textContent = 'Traduciendo párrafo al español para leer...';
    await ensureParagraphTranslated(pIdx);
    if (sessionId !== state.speechSessionId) return;
  }

  if (shouldReadSpanish) {
    if (pIdx + 1 < state.paragraphs.length && !state.translatedParagraphs[pIdx + 1]) ensureParagraphTranslated(pIdx + 1);
    if (pIdx + 2 < state.paragraphs.length && !state.translatedParagraphs[pIdx + 2]) ensureParagraphTranslated(pIdx + 2);
  }

  const getActiveText = (idx) => {
    if (shouldReadSpanish) return state.translatedParagraphs[idx] || state.paragraphs[idx] || '';
    return state.paragraphs[idx] || '';
  };

  const textToRead = getActiveText(pIdx);
  const tagType = state.paragraphTags[pIdx] || 'p';
  const useSpanishRules = shouldReadSpanish || state.bookLang.startsWith('es');
  updatePlayerSnippet();

  state.currentChunks = buildProsodyChunksForParagraph(textToRead, useSpanishRules, tagType);
  state.currentChunkIndex = 0;
  speakNextChunk(sessionId, shouldReadSpanish);
}

export function getBestActiveVoice(useSpanishVoice) {
  const targetPrefix = useSpanishVoice ? 'es' : 'en';
  const savedURI = useSpanishVoice ? state.settings.voiceURIEs : state.settings.voiceURIEn;

  if (state.settings.preferNetworkVoices) {
    const savedVoice = state.voices.find(v => v.voiceURI === savedURI);
    if (savedVoice && isNetworkVoice(savedVoice)) return savedVoice;
    const candidates = state.voices.filter(v => normalizeLangTag(v.lang).startsWith(targetPrefix)).sort((a, b) => scoreVoice(b, targetPrefix) - scoreVoice(a, targetPrefix));
    if (candidates.length > 0 && isNetworkVoice(candidates[0])) return candidates[0];
  }
  let chosen = state.voices.find(v => v.voiceURI === savedURI);
  if (!chosen) {
    const candidates = state.voices.filter(v => normalizeLangTag(v.lang).startsWith(targetPrefix)).sort((a, b) => scoreVoice(b, targetPrefix) - scoreVoice(a, targetPrefix));
    chosen = candidates[0] || null;
  }
  return chosen;
}

export function speakNextChunk(sessionId, shouldReadSpanish) {
  if (sessionId !== state.speechSessionId || !state.isSpeaking) return;

  if (state.sleepStopAfterChunk) {
    state.sleepStopAfterChunk = false;
    stopSpeech();
    setSleepTimer(0, false);
    saveSettingsAndProgress();
    showToast('🌙 Temporizador finalizado. Tu progreso quedó guardado.', 4000);
    return;
  }

  if (state.currentChunkIndex >= state.currentChunks.length) {
    advanceToNextParagraph(sessionId);
    return;
  }

  const chunkObj = state.currentChunks[state.currentChunkIndex];
  const chunkText = typeof chunkObj === 'string' ? chunkObj : chunkObj.text;
  const pauseAfterMs = typeof chunkObj === 'object' && chunkObj.pauseAfterMs ? chunkObj.pauseAfterMs : 180;
  const isHeading = typeof chunkObj === 'object' && chunkObj.isHeading;

  const utterance = new SpeechSynthesisUtterance(chunkText);
  const useSpanishVoice = shouldReadSpanish || state.bookLang.startsWith('es');
  const chosenVoice = getBestActiveVoice(useSpanishVoice);

  if (chosenVoice) {
    utterance.voice = chosenVoice;
    utterance.lang = chosenVoice.lang.replace('_', '-');
  } else {
    utterance.lang = useSpanishVoice ? 'es-ES' : 'en-US';
  }

  const baseRate = state.settings.rate || 1.0;
  utterance.rate = isHeading ? Math.max(0.75, +(baseRate * 0.94).toFixed(2)) : baseRate;
  utterance.pitch = state.settings.pitch || 0.94;

  utterance.onend = () => {
    if (sessionId !== state.speechSessionId || state.isPaused || !state.isSpeaking) return;
    state.currentChunkIndex++;
    clearSpeechPauseTimer();
    state.speechTimerId = setTimeout(() => {
      if (sessionId !== state.speechSessionId || state.isPaused || !state.isSpeaking) return;
      speakNextChunk(sessionId, shouldReadSpanish);
    }, pauseAfterMs);
  };

  utterance.onerror = (event) => {
    if (sessionId !== state.speechSessionId || event.error === 'interrupted' || event.error === 'canceled') return;
    state.currentChunkIndex++;
    speakNextChunk(sessionId, shouldReadSpanish);
  };

  window.speechSynthesis.speak(utterance);
}

export function advanceToNextParagraph(sessionId) {
  if (sessionId !== state.speechSessionId) return;

  if (state.currentParagraphIndex < state.paragraphs.length - 1) {
    selectParagraph(state.currentParagraphIndex + 1, false);
    startSpeechFromCurrent();
  } else {
    if (state.sleepMode === 'chapter') {
      stopSpeech();
      setSleepTimer(0, false);
      saveSettingsAndProgress();
      showToast('🌙 Fin del capítulo. Lectura pausada por el temporizador.', 4000);
      return;
    }
    if (state.currentChapterIndex < state.spine.length - 1) {
      showToast('Pasando al siguiente capítulo...');
      loadChapter(state.currentChapterIndex + 1, 0, true);
    } else {
      stopSpeech();
      showToast('¡Has terminado el libro!');
    }
  }
}

export function togglePlayPause() {
  if (state.paragraphs.length === 0) return showToast('Sube un archivo .ePUB o toca un libro de prueba');

  if (!state.isSpeaking) {
    startSpeechFromCurrent();
    return;
  }
  if (state.isPaused) {
    state.isPaused = false;
    const sessionId = ++state.speechSessionId;
    requestWakeLock();
    updateAudioUI();
    const shouldReadSpanish = state.settings.translationMode === 'translated' || state.settings.translationMode === 'bilingual' || state.individualTransShown[state.currentParagraphIndex];
    speakNextChunk(sessionId, shouldReadSpanish);
  } else {
    state.isPaused = true;
    state.speechSessionId++;
    clearSpeechPauseTimer();
    window.speechSynthesis.cancel();
    releaseWakeLock();
    updateAudioUI();
  }
}

export function formatRemainingTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export function setSleepTimer(mode, notify = true) {
  clearInterval(state.sleepIntervalId);
  state.sleepIntervalId = null;
  state.sleepMode = mode;
  state.sleepStopAfterChunk = false;

  if (mode === 0 || mode === '0') {
    state.sleepMode = 0;
    state.sleepRemainingSeconds = 0;
    dom.sleepTimerBadge.textContent = 'Off';
    dom.btnOpenSleepTimer.style.borderColor = 'var(--border-color)';
    dom.btnOpenSleepTimer.style.color = 'var(--text-primary)';
    if (notify) showToast('Temporizador de sueño desactivado');
  } else if (mode === 'chapter') {
    dom.sleepTimerBadge.textContent = 'Fin Cap.';
    dom.btnOpenSleepTimer.style.borderColor = 'var(--accent-color)';
    dom.btnOpenSleepTimer.style.color = 'var(--accent-color)';
    if (notify) showToast('🌙 La voz se detendrá al terminar este capítulo');
  } else {
    const minutes = parseInt(mode, 10);
    state.sleepRemainingSeconds = minutes * 60;
    dom.sleepTimerBadge.textContent = formatRemainingTime(state.sleepRemainingSeconds);
    dom.btnOpenSleepTimer.style.borderColor = 'var(--accent-color)';
    dom.btnOpenSleepTimer.style.color = 'var(--accent-color)';

    state.sleepIntervalId = setInterval(() => {
      if (state.sleepRemainingSeconds > 0) {
        state.sleepRemainingSeconds--;
        dom.sleepTimerBadge.textContent = formatRemainingTime(state.sleepRemainingSeconds);
      }
      if (state.sleepRemainingSeconds <= 0) {
        clearInterval(state.sleepIntervalId);
        state.sleepIntervalId = null;
        if (state.isSpeaking && !state.isPaused) {
          state.sleepStopAfterChunk = true;
          dom.sleepTimerBadge.textContent = 'Pausando...';
        } else {
          setSleepTimer(0, false);
          showToast('🌙 Temporizador de sueño finalizado');
        }
      }
    }, 1000);
    if (notify) showToast(`🌙 Temporizador activado: ${minutes} minutos`);
  }

  document.querySelectorAll('.sleep-opt-btn').forEach(btn => {
    const active = String(btn.dataset.sleep) === String(state.sleepMode);
    btn.style.backgroundColor = active ? 'var(--accent-color)' : 'var(--bg-primary)';
    btn.style.color = active ? 'var(--text-on-accent, #ffffff)' : 'var(--text-primary)';
    btn.style.borderColor = active ? 'var(--accent-color)' : 'var(--border-color)';
  });
}

export function testVoiceAndProsodySample() {
  if (!('speechSynthesis' in window)) return showToast('Síntesis de voz no disponible');
  stopSpeech();
  const useSpanish = state.settings.translationMode !== 'original' || state.bookLang.startsWith('es');
  const sampleRaw = useSpanish
    ? 'Cap. 1. —Bienvenido al modo audiolibro, Dr. Vance —dijo Elena en voz baja—. La voz de red y las micro-pausas hacen que la lectura suene mucho más cálida y natural.'
    : 'Ch. 1. "Welcome to the audiobook mode, Dr. Vance," said Elena softly. Network voices and natural micro-pauses make every sentence flow smoothly.';

  const chunks = buildProsodyChunksForParagraph(sampleRaw, useSpanish, 'p');
  const sessionId = ++state.speechSessionId;
  state.isSpeaking = true;
  state.isPaused = false;
  state.currentChunks = chunks;
  state.currentChunkIndex = 0;

  const voice = getBestActiveVoice(useSpanish);
  const vType = voice && isNetworkVoice(voice) ? '☁️ HD Red' : '📱 Local';
  showToast(`Probando ${vType} (Tono ${state.settings.pitch}, Pausas ${state.settings.pauseScale}x)`);
  speakNextChunk(sessionId, useSpanish);
}