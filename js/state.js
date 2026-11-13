export const APP_STORAGE_KEY = 'vozepub_pro_settings_v2';
export const TRANS_CACHE_KEY = 'vozepub_pro_trans_cache_v2';
export const IDB_NAME = 'VozEpubProDB';
export const IDB_STORE = 'epubFiles';

export const SPEED_STEPS = [0.75, 1.0, 1.25, 1.5, 2.0];

export const PROSODY_PROFILES = {
  audiobook: { pitch: 0.94, pauseScale: 1.15, label: 'Narrador Cálido (Audiolibro)' },
  studio:    { pitch: 0.98, pauseScale: 1.0,  label: 'Estudio Claro' },
  standard:  { pitch: 1.00, pauseScale: 0.75, label: 'Natural Estándar' }
};

export const state = {
  zip: null,
  bookTitle: 'Sin libro cargado',
  bookAuthor: '',
  bookLang: 'en',
  opfPath: '',
  opfDir: '',
  manifest: {},
  spine: [],
  blobUrls: [],
  currentChapterIndex: 0,
  paragraphs: [],
  paragraphTags: [],
  translatedParagraphs: [],
  individualTransShown: {},
  currentParagraphIndex: 0,
  translationJobId: 0,
  isTranslatingChapter: false,
  translationCache: {},
  isSpeaking: false,
  isPaused: false,
  speechSessionId: 0,
  speechTimerId: null,
  currentChunks: [],
  currentChunkIndex: 0,
  voices: [],
  wakeLock: null,
  sleepMode: 0,
  sleepRemainingSeconds: 0,
  sleepIntervalId: null,
  sleepStopAfterChunk: false,
  settings: {
    translationMode: 'original',
    rate: 1.0,
    pitch: 0.94,
    pauseScale: 1.0,
    prosodyProfile: 'audiobook',
    preferNetworkVoices: true,
    cleanTextForTTS: true,
    voiceURIEs: '',
    voiceURIEn: '',
    tapMode: 'double',
    theme: 'dark',
    fontSize: 19,
    fontFamily: 'serif',
    autoScroll: true
  }
};