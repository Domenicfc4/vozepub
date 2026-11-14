import { state, APP_STORAGE_KEY, TRANS_CACHE_KEY } from './state.js';
import { isNetworkVoice } from './tts-engine.js';

export const dom = {
  welcomeScreen: document.getElementById('welcomeScreen'),
  loadingIndicator: document.getElementById('loadingIndicator'),
  loadingText: document.getElementById('loadingText'),
  readerView: document.getElementById('readerView'),
  chapterContent: document.getElementById('chapterContent'),
  headerBookTitle: document.getElementById('headerBookTitle'),
  currentChapterTitle: document.getElementById('currentChapterTitle'),
  currentBookAuthor: document.getElementById('currentBookAuthor'),
  touchModeHint: document.getElementById('touchModeHint'),
  chapterCounterBadge: document.getElementById('chapterCounterBadge'),
  paragraphCounterBadge: document.getElementById('paragraphCounterBadge'),
  chapterProgressBar: document.getElementById('chapterProgressBar'),
  translationStatusBar: document.getElementById('translationStatusBar'),
  translationSpinner: document.getElementById('translationSpinner'),
  translationStatusText: document.getElementById('translationStatusText'),
  translationCountBadge: document.getElementById('translationCountBadge'),
  fileInputMain: document.getElementById('fileInputMain'),
  fileInputHeader: document.getElementById('fileInputHeader'),
  btnLoadEnglishDemo: document.getElementById('btnLoadEnglishDemo'),
  btnLoadSpanishDemo: document.getElementById('btnLoadSpanishDemo'),
  btnDownloadSelf: document.getElementById('btnDownloadSelf'),
  btnPrevChapter: document.getElementById('btnPrevChapter'),
  btnNextChapter: document.getElementById('btnNextChapter'),
  btnPlayerPrevChap: document.getElementById('btnPlayerPrevChap'),
  btnPlayPause: document.getElementById('btnPlayPause'),
  iconPlayPause: document.getElementById('iconPlayPause'),
  btnPrevParagraph: document.getElementById('btnPrevParagraph'),
  btnNextParagraph: document.getElementById('btnNextParagraph'),
  btnStopSpeech: document.getElementById('btnStopSpeech'),
  btnCycleSpeed: document.getElementById('btnCycleSpeed'),
  btnJumpToActive: document.getElementById('btnJumpToActive'),
  miniWaveIndicator: document.getElementById('miniWaveIndicator'),
  crosshairIcon: document.getElementById('crosshairIcon'),
  playerSnippetText: document.getElementById('playerSnippetText'),
  btnVoiceQualityBadge: document.getElementById('btnVoiceQualityBadge'),
  voiceQualityText: document.getElementById('voiceQualityText'),
  btnOpenSleepTimer: document.getElementById('btnOpenSleepTimer'),
  sleepTimerBadge: document.getElementById('sleepTimerBadge'),
  sleepModal: document.getElementById('sleepModal'),
  sleepBackdrop: document.getElementById('sleepBackdrop'),
  btnCloseSleepModal: document.getElementById('btnCloseSleepModal'),
  btnOpenToc: document.getElementById('btnOpenToc'),
  btnCloseToc: document.getElementById('btnCloseToc'),
  tocModal: document.getElementById('tocModal'),
  tocBackdrop: document.getElementById('tocBackdrop'),
  tocList: document.getElementById('tocList'),
  tocBookMeta: document.getElementById('tocBookMeta'),
  btnClearSavedBook: document.getElementById('btnClearSavedBook'),
  btnOpenSettings: document.getElementById('btnOpenSettings'),
  btnCloseSettings: document.getElementById('btnCloseSettings'),
  settingsModal: document.getElementById('settingsModal'),
  settingsBackdrop: document.getElementById('settingsBackdrop'),
  voiceSelectEs: document.getElementById('voiceSelectEs'),
  voiceSelectEn: document.getElementById('voiceSelectEn'),
  btnRefreshVoices: document.getElementById('btnRefreshVoices'),
  btnTestVoiceProsody: document.getElementById('btnTestVoiceProsody'),
  togglePreferNetworkVoice: document.getElementById('togglePreferNetworkVoice'),
  toggleTextClean: document.getElementById('toggleTextClean'),
  sliderPitch: document.getElementById('sliderPitch'),
  pitchValueLabel: document.getElementById('pitchValueLabel'),
  sliderPauseScale: document.getElementById('sliderPauseScale'),
  pauseScaleLabel: document.getElementById('pauseScaleLabel'),
  speedValueLabel: document.getElementById('speedValueLabel'),
  btnFontDecrease: document.getElementById('btnFontDecrease'),
  btnFontIncrease: document.getElementById('btnFontIncrease'),
  fontSizeLabel: document.getElementById('fontSizeLabel'),
  btnFontSerif: document.getElementById('btnFontSerif'),
  btnFontSans: document.getElementById('btnFontSans'),
  toggleAutoScroll: document.getElementById('toggleAutoScroll'),
  toastContainer: document.getElementById('toastContainer'),
  toastMessage: document.getElementById('toastMessage')
};

export function showToast(msg, duration = 2600) {
  dom.toastMessage.textContent = msg;
  dom.toastContainer.classList.remove('opacity-0', '-translate-y-2');
  dom.toastContainer.classList.add('opacity-100', 'translate-y-0');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    dom.toastContainer.classList.add('opacity-0', '-translate-y-2');
    dom.toastContainer.classList.remove('opacity-100', 'translate-y-0');
  }, duration);
}

export function saveSettingsAndProgress() {
  try {
    const payload = {
      settings: state.settings,
      progress: {
        bookTitle: state.bookTitle,
        chapterIndex: state.currentChapterIndex,
        paragraphIndex: state.currentParagraphIndex
      }
    };
    localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn('Error guardando preferencias:', e);
  }
}

export function loadSettingsAndProgress() {
  try {
    const rawTrans = localStorage.getItem(TRANS_CACHE_KEY);
    if (rawTrans) state.translationCache = JSON.parse(rawTrans) || {};
  } catch (e) {}

  try {
    const raw = localStorage.getItem(APP_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.settings) state.settings = { ...state.settings, ...parsed.settings };
    return parsed.progress || null;
  } catch (e) {
    return null;
  }
}

// Escucha el evento lanzado por epub-core.js al requerir una traducción individual
document.addEventListener('updateParagraphDOM', (e) => updateParagraphDOM(e.detail));

export function updateParagraphDOM(paraIndex) {
  const block = dom.chapterContent.querySelector(`.reader-block[data-index="${paraIndex}"]`);
  if (!block) return;

  const textWrap = block.querySelector('.para-text-wrap');
  const quickBtn = block.querySelector('.para-trans-btn');
  const original = state.paragraphs[paraIndex] || '';
  const translated = state.translatedParagraphs[paraIndex] || '';
  const mode = state.settings.translationMode;

  textWrap.innerHTML = '';

  if (mode === 'original') {
    if (quickBtn) {
      quickBtn.classList.remove('hidden');
      quickBtn.textContent = state.individualTransShown[paraIndex] ? 'EN' : 'ES';
    }
    const origDiv = document.createElement('div');
    origDiv.textContent = original;
    textWrap.appendChild(origDiv);

    if (state.individualTransShown[paraIndex] && translated) {
      const transDiv = document.createElement('div');
      transDiv.className = 'mt-2 pt-2 border-t text-sm font-medium';
      transDiv.style.borderColor = 'var(--border-color)';
      transDiv.style.color = 'var(--accent-color)';
      transDiv.textContent = translated;
      textWrap.appendChild(transDiv);
    }
  } else if (mode === 'translated') {
    if (quickBtn) quickBtn.classList.add('hidden');
    const transDiv = document.createElement('div');
    if (translated) {
      transDiv.textContent = translated;
    } else {
      transDiv.className = 'translating-shimmer';
      transDiv.textContent = original;
    }
    textWrap.appendChild(transDiv);
  } else if (mode === 'bilingual') {
    if (quickBtn) quickBtn.classList.add('hidden');
    const origDiv = document.createElement('div');
    origDiv.className = 'bilingual-original';
    origDiv.textContent = original;

    const transDiv = document.createElement('div');
    if (translated) {
      transDiv.textContent = translated;
    } else {
      transDiv.className = 'translating-shimmer opacity-75';
      transDiv.textContent = 'Traduciendo al español...';
    }
    textWrap.appendChild(origDiv);
    textWrap.appendChild(transDiv);
  }
}

export function refreshAllParagraphsDOM() {
  for (let i = 0; i < state.paragraphs.length; i++) {
    updateParagraphDOM(i);
  }
}

export function getActiveParagraphTextForSpeech(paraIndex) {
  const mode = state.settings.translationMode;
  if (mode === 'translated' || mode === 'bilingual' || state.individualTransShown[paraIndex]) {
    return state.translatedParagraphs[paraIndex] || state.paragraphs[paraIndex] || '';
  }
  return state.paragraphs[paraIndex] || '';
}

export function updatePlayerSnippet() {
  const text = getActiveParagraphTextForSpeech(state.currentParagraphIndex);
  dom.playerSnippetText.textContent = text || 'Selecciona un párrafo...';
}

export function selectParagraph(index, scrollInstant = false, allowAutoScroll = true) {
  if (state.paragraphs.length === 0) return;
  const clamped = Math.min(Math.max(0, index), state.paragraphs.length - 1);
  state.currentParagraphIndex = clamped;

  const prevActive = dom.chapterContent.querySelector('.reader-block.active-paragraph');
  if (prevActive) prevActive.classList.remove('active-paragraph');

  const currentEl = dom.chapterContent.querySelector(`.reader-block[data-index="${clamped}"]`);
  if (currentEl) {
    currentEl.classList.add('active-paragraph');
    if (state.settings.autoScroll && allowAutoScroll) {
      currentEl.scrollIntoView({ behavior: scrollInstant ? 'auto' : 'smooth', block: 'center' });
    }
  }

  const total = state.paragraphs.length;
  dom.paragraphCounterBadge.textContent = `Párrafo ${clamped + 1} / ${total}`;
  const progressPct = total > 1 ? ((clamped + 1) / total) * 100 : 100;
  dom.chapterProgressBar.style.width = `${progressPct}%`;

  updatePlayerSnippet();
  dom.btnPrevParagraph.disabled = clamped === 0 && state.currentChapterIndex === 0;
  dom.btnNextParagraph.disabled = clamped >= total - 1 && state.currentChapterIndex >= state.spine.length - 1;

  saveSettingsAndProgress();
}

export function updateActiveVoiceBadge() {
  if (!dom.voiceQualityText) return;
  const shouldReadSpanish =
    state.settings.translationMode === 'translated' ||
    state.settings.translationMode === 'bilingual' ||
    state.individualTransShown[state.currentParagraphIndex] ||
    state.bookLang.startsWith('es');

  const targetURI = shouldReadSpanish ? state.settings.voiceURIEs : state.settings.voiceURIEn;
  const activeVoice = state.voices.find(v => v.voiceURI === targetURI);

  if (activeVoice) {
    const net = isNetworkVoice(activeVoice);
    dom.voiceQualityText.textContent = net ? '☁️ HD Red' : '📱 Local';
    dom.btnVoiceQualityBadge.style.borderColor = net ? 'var(--accent-color)' : 'var(--border-color)';
    dom.btnVoiceQualityBadge.style.color = net ? 'var(--accent-color)' : 'var(--text-secondary)';
  } else {
    dom.voiceQualityText.textContent = '☁️ Voz';
  }
}

export function renderTocList() {
  dom.tocList.innerHTML = '';
  state.spine.forEach((item, index) => {
    const isCurrent = index === state.currentChapterIndex;
    const btn = document.createElement('button');
    btn.className = `w-full text-left px-3.5 py-3 rounded-xl text-sm font-medium flex items-center justify-between gap-2 transition ${isCurrent ? 'font-bold shadow-xs' : 'hover:opacity-80'}`;
    btn.style.backgroundColor = isCurrent ? 'var(--accent-color)' : 'rgba(244, 201, 205, 0.08)';
    btn.style.color = isCurrent ? 'var(--text-on-accent, #4A2417)' : 'var(--text-primary)';

    btn.innerHTML = `
      <span class="truncate">${index + 1}. ${item.title}</span>
      ${isCurrent ? '<i data-lucide="volume-2" class="w-4 h-4 shrink-0"></i>' : ''}
    `;

    btn.addEventListener('click', () => {
      dom.tocModal.classList.add('hidden');
      // Despachamos evento al cargar desde el índice
      const evt = new CustomEvent('loadChapterRequest', { detail: index });
      document.dispatchEvent(evt);
    });
    dom.tocList.appendChild(btn);
  });
  if (window.lucide) window.lucide.createIcons();
}

export function applyVisualSettings() {
  document.body.classList.remove('theme-dark', 'theme-sepia', 'theme-light');
  document.body.classList.add(`theme-${state.settings.theme}`);

  document.querySelectorAll('.theme-btn').forEach(btn => {
    const active = btn.dataset.theme === state.settings.theme;
    btn.style.outline = active ? '2px solid var(--accent-color)' : 'none';
  });

  document.querySelectorAll('.trans-mode-btn').forEach(btn => {
    const active = btn.dataset.transMode === state.settings.translationMode;
    btn.style.backgroundColor = active ? 'var(--accent-color)' : 'transparent';
    btn.style.color = active ? 'var(--text-on-accent, #4A2417)' : 'var(--text-primary)';
    btn.style.borderColor = active ? 'var(--accent-color)' : 'var(--border-color)';
  });

  document.querySelectorAll('.tap-mode-btn').forEach(btn => {
    const active = btn.dataset.tapMode === state.settings.tapMode;
    btn.style.backgroundColor = active ? 'var(--accent-color)' : 'rgba(244, 201, 205, 0.12)';
    btn.style.color = active ? 'var(--text-on-accent, #4A2417)' : 'var(--text-primary)';
    btn.style.borderColor = active ? 'var(--accent-color)' : 'var(--border-color)';
  });
  dom.touchModeHint.textContent = state.settings.tapMode === 'double'
    ? 'Doble toque en un párrafo para hablar'
    : 'Un toque en un párrafo para hablar';

  document.documentElement.style.setProperty('--reader-font-size', `${state.settings.fontSize}px`);
  dom.fontSizeLabel.textContent = `${state.settings.fontSize}px`;

  const fontStack = state.settings.fontFamily === 'sans'
    ? "'Inter', system-ui, -apple-system, sans-serif"
    : "'Literata', Georgia, serif";
  document.documentElement.style.setProperty('--reader-font', fontStack);

  dom.btnFontSerif.style.backgroundColor = state.settings.fontFamily === 'serif' ? 'var(--highlight-bg)' : 'transparent';
  dom.btnFontSerif.style.color = state.settings.fontFamily === 'serif' ? 'var(--accent-color)' : 'var(--text-primary)';
  dom.btnFontSans.style.backgroundColor = state.settings.fontFamily === 'sans' ? 'var(--highlight-bg)' : 'transparent';
  dom.btnFontSans.style.color = state.settings.fontFamily === 'sans' ? 'var(--accent-color)' : 'var(--text-primary)';

  dom.btnCycleSpeed.textContent = `${state.settings.rate}x`;
  dom.speedValueLabel.textContent = `${state.settings.rate}x`;
  document.querySelectorAll('.speed-preset-btn').forEach(btn => {
    const isSelected = parseFloat(btn.dataset.speed) === state.settings.rate;
    btn.style.backgroundColor = isSelected ? 'var(--accent-color)' : 'rgba(244, 201, 205, 0.12)';
    btn.style.color = isSelected ? 'var(--text-on-accent, #4A2417)' : 'var(--text-primary)';
    btn.style.borderColor = isSelected ? 'var(--accent-color)' : 'var(--border-color)';
  });

  if (dom.togglePreferNetworkVoice) dom.togglePreferNetworkVoice.checked = state.settings.preferNetworkVoices !== false;
  if (dom.toggleTextClean) dom.toggleTextClean.checked = state.settings.cleanTextForTTS !== false;
  if (dom.sliderPitch && dom.pitchValueLabel) {
    const pitchVal = +(state.settings.pitch || 0.94).toFixed(2);
    dom.sliderPitch.value = pitchVal;
    dom.pitchValueLabel.textContent = pitchVal.toFixed(2);
  }
  if (dom.sliderPauseScale && dom.pauseScaleLabel) {
    const pauseVal = +(state.settings.pauseScale || 1.0).toFixed(1);
    dom.sliderPauseScale.value = pauseVal;
    dom.pauseScaleLabel.textContent = `${pauseVal}x`;
  }

  document.querySelectorAll('.prosody-profile-btn').forEach(btn => {
    const active = btn.dataset.prosody === state.settings.prosodyProfile;
    btn.style.backgroundColor = active ? 'var(--accent-color)' : 'rgba(244, 201, 205, 0.12)';
    btn.style.color = active ? 'var(--text-on-accent, #4A2417)' : 'var(--text-primary)';
    btn.style.borderColor = active ? 'var(--accent-color)' : 'var(--border-color)';
  });

  dom.toggleAutoScroll.checked = !!state.settings.autoScroll;
  updateActiveVoiceBadge();
  saveSettingsAndProgress();
}