import { state } from './state.js';
import { dom, showToast, renderTocList, saveSettingsAndProgress, selectParagraph } from './ui.js';
import { stopSpeech, startSpeechFromCurrent } from './tts-engine.js';
import { ensureParagraphTranslated, translateCurrentChapterInBackground } from './translator.js';

export function resolveRelativePath(baseDir, relativeHref) {
  if (!relativeHref) return '';
  const cleanHref = decodeURIComponent(relativeHref.split('#')[0].split('?')[0]);
  if (cleanHref.startsWith('/')) return cleanHref.slice(1);

  const stack = baseDir ? baseDir.split('/').filter(Boolean) : [];
  const parts = cleanHref.split('/');
  for (const part of parts) {
    if (part === '.' || part === '') continue;
    if (part === '..') stack.pop();
    else stack.push(part);
  }
  return stack.join('/');
}

export function getDirectory(filePath) {
  const idx = filePath.lastIndexOf('/');
  return idx === -1 ? '' : filePath.substring(0, idx);
}

export function findZipEntry(zip, targetPath) {
  if (!targetPath) return null;
  let file = zip.file(targetPath);
  if (file) return file;
  const decoded = decodeURIComponent(targetPath);
  file = zip.file(decoded);
  if (file) return file;
  const lower = decoded.toLowerCase();
  const match = Object.keys(zip.files).find(k => k.toLowerCase() === lower);
  return match ? zip.file(match) : null;
}

export async function extractTocMap(zip, navPath, ncxPath) {
  const map = {};
  const parser = new DOMParser();
  try {
    if (navPath) {
      const entry = findZipEntry(zip, navPath);
      if (entry) {
        const navDir = getDirectory(navPath);
        const text = await entry.async('text');
        const doc = parser.parseFromString(text, 'text/html');
        doc.querySelectorAll('nav a[href], a[href]').forEach(a => {
          const rawHref = a.getAttribute('href');
          const label = a.textContent.replace(/\s+/g, ' ').trim();
          if (rawHref && label) {
            const resolved = resolveRelativePath(navDir, rawHref);
            if (!map[resolved]) map[resolved] = label;
          }
        });
      }
    }
    if (ncxPath && Object.keys(map).length === 0) {
      const entry = findZipEntry(zip, ncxPath);
      if (entry) {
        const ncxDir = getDirectory(ncxPath);
        const text = await entry.async('text');
        const doc = parser.parseFromString(text, 'application/xml');
        Array.from(doc.getElementsByTagNameNS('*', 'navPoint')).forEach(np => {
          const textEl = np.getElementsByTagNameNS('*', 'text')[0];
          const contentEl = np.getElementsByTagNameNS('*', 'content')[0];
          if (textEl && contentEl) {
            const label = textEl.textContent.replace(/\s+/g, ' ').trim();
            const src = contentEl.getAttribute('src');
            if (label && src) {
              const resolved = resolveRelativePath(ncxDir, src);
              if (!map[resolved]) map[resolved] = label;
            }
          }
        });
      }
    }
  } catch (e) {}
  return map;
}

export function revokeActiveBlobs() {
  state.blobUrls.forEach(url => URL.revokeObjectURL(url));
  state.blobUrls = [];
}

export async function parseEpubBuffer(arrayBuffer, savedProgress = null) {
  stopSpeech();
  dom.welcomeScreen.classList.add('hidden');
  dom.readerView.classList.add('hidden');
  dom.loadingIndicator.classList.remove('hidden');
  dom.loadingText.textContent = 'Abriendo archivo ePUB...';

  try {
    // JSZip se carga desde CDN en el HTML
    const zip = await window.JSZip.loadAsync(arrayBuffer);
    state.zip = zip;

    const containerEntry = findZipEntry(zip, 'META-INF/container.xml');
    if (!containerEntry) throw new Error('Archivo META-INF/container.xml no encontrado.');

    const containerXmlText = await containerEntry.async('text');
    const parser = new DOMParser();
    const containerDoc = parser.parseFromString(containerXmlText, 'application/xml');
    const rootfileEl = containerDoc.querySelector('rootfile');
    if (!rootfileEl) throw new Error('No se encontró el archivo raíz (.opf) del ePUB.');

    state.opfPath = rootfileEl.getAttribute('full-path');
    state.opfDir = getDirectory(state.opfPath);

    const opfEntry = findZipEntry(zip, state.opfPath);
    if (!opfEntry) throw new Error('No se pudo abrir el archivo OPF del libro.');

    const opfXmlText = await opfEntry.async('text');
    const opfDoc = parser.parseFromString(opfXmlText, 'application/xml');

    const titleNode = opfDoc.getElementsByTagNameNS('*', 'title')[0] || opfDoc.querySelector('title');
    const creatorNode = opfDoc.getElementsByTagNameNS('*', 'creator')[0] || opfDoc.querySelector('creator');
    const langNode = opfDoc.getElementsByTagNameNS('*', 'language')[0] || opfDoc.querySelector('language');

    state.bookTitle = titleNode && titleNode.textContent.trim() ? titleNode.textContent.trim() : 'Libro ePUB';
    state.bookAuthor = creatorNode && creatorNode.textContent.trim() ? creatorNode.textContent.trim() : 'Autor';
    state.bookLang = langNode && langNode.textContent.trim() ? langNode.textContent.trim().toLowerCase() : 'en';

    state.manifest = {};
    const manifestItems = Array.from(opfDoc.getElementsByTagNameNS('*', 'item'));
    let navPath = null;
    let ncxPath = null;

    manifestItems.forEach(item => {
      const id = item.getAttribute('id');
      const href = item.getAttribute('href');
      const mediaType = item.getAttribute('media-type') || '';
      const properties = item.getAttribute('properties') || '';
      if (id && href) {
        const fullPath = resolveRelativePath(state.opfDir, href);
        state.manifest[id] = { id, href, mediaType, fullPath, properties };
        if (properties.includes('nav')) navPath = fullPath;
        if (mediaType === 'application/x-dtbncx+xml') ncxPath = fullPath;
      }
    });

    const tocTitlesByPath = await extractTocMap(zip, navPath, ncxPath);

    const spineItems = Array.from(opfDoc.getElementsByTagNameNS('*', 'itemref'));
    state.spine = [];
    spineItems.forEach((itemRef, idx) => {
      const idref = itemRef.getAttribute('idref');
      const manifestEntry = state.manifest[idref];
      if (manifestEntry) {
        const mappedTitle = tocTitlesByPath[manifestEntry.fullPath] || `Capítulo ${idx + 1}`;
        state.spine.push({
          index: idx,
          idref,
          href: manifestEntry.href,
          fullPath: manifestEntry.fullPath,
          title: mappedTitle
        });
      }
    });

    if (state.spine.length === 0) throw new Error('No se encontraron capítulos en este ePUB.');

    dom.headerBookTitle.textContent = state.bookTitle;
    dom.tocBookMeta.textContent = `${state.bookTitle} • ${state.bookAuthor}`;
    dom.btnOpenToc.disabled = false;

    let startChap = 0;
    let startPara = 0;
    if (savedProgress && savedProgress.bookTitle === state.bookTitle) {
      startChap = Math.min(Math.max(0, savedProgress.chapterIndex || 0), state.spine.length - 1);
      startPara = Math.max(0, savedProgress.paragraphIndex || 0);
    }

    await loadChapter(startChap, startPara, false);

    dom.loadingIndicator.classList.add('hidden');
    dom.readerView.classList.remove('hidden');
    renderTocList();

  } catch (err) {
    console.error(err);
    dom.loadingIndicator.classList.add('hidden');
    dom.welcomeScreen.classList.remove('hidden');
    showToast('Error: ' + (err.message || 'Archivo ePUB inválido'));
  }
}

export async function loadChapter(chapterIndex, targetParagraphIndex = 0, autoPlayAfterLoad = false) {
  if (chapterIndex < 0 || chapterIndex >= state.spine.length) return;

  const wasSpeaking = state.isSpeaking && !state.isPaused;
  stopSpeech();
  state.translationJobId++;
  revokeActiveBlobs();

  state.currentChapterIndex = chapterIndex;
  const spineItem = state.spine[chapterIndex];
  const chapterEntry = findZipEntry(state.zip, spineItem.fullPath);

  if (!chapterEntry) {
    showToast('No se encontró el capítulo');
    return;
  }

  const rawHtml = await chapterEntry.async('text');
  const chapterDir = getDirectory(spineItem.fullPath);

  const parser = new DOMParser();
  let doc = parser.parseFromString(rawHtml, 'application/xhtml+xml');
  if (doc.querySelector('parsererror')) {
    doc = parser.parseFromString(rawHtml, 'text/html');
  }

  const imgElements = Array.from(doc.querySelectorAll('img, image'));
  for (const img of imgElements) {
    const srcAttr = img.getAttribute('src') || img.getAttribute('xlink:href') || img.getAttribute('href');
    if (srcAttr && !srcAttr.startsWith('http') && !srcAttr.startsWith('data:')) {
      const imgFullPath = resolveRelativePath(chapterDir, srcAttr);
      const imgEntry = findZipEntry(state.zip, imgFullPath);
      if (imgEntry) {
        const blob = await imgEntry.async('blob');
        const blobUrl = URL.createObjectURL(blob);
        state.blobUrls.push(blobUrl);
        img.setAttribute('data-epub-blob', blobUrl);
      }
    }
  }

  if (spineItem.title.startsWith('Capítulo ')) {
    const headingEl = doc.querySelector('h1, h2, h3, title');
    if (headingEl && headingEl.textContent.trim().length > 1 && headingEl.textContent.trim().length < 110) {
      spineItem.title = headingEl.textContent.replace(/\s+/g, ' ').trim();
    }
  }

  dom.chapterContent.innerHTML = '';
  state.paragraphs = [];
  state.paragraphTags = [];
  state.translatedParagraphs = [];
  state.individualTransShown = {};

  const bodyEl = doc.body || doc.documentElement;
  extractReadableBlocks(bodyEl);

  if (state.paragraphs.length === 0) {
    const plain = (bodyEl.textContent || '').replace(/\s+/g, ' ').trim();
    appendParagraphBlock(plain || '(Capítulo visual sin texto)', 'p');
  }

  state.paragraphs.forEach((origText, idx) => {
    const key = `${state.bookTitle}::c${chapterIndex}::p${idx}::${origText.length}::${origText.slice(0, 32).replace(/\s+/g, '_')}`;
    if (state.translationCache[key]) {
      state.translatedParagraphs[idx] = state.translationCache[key];
    }
  });

  // La actualización del DOM se gestiona en app.js/ui.js
  dom.currentChapterTitle.textContent = spineItem.title;
  dom.currentBookAuthor.textContent = `${state.bookTitle} — ${state.bookAuthor}`;
  dom.chapterCounterBadge.textContent = `Capítulo ${chapterIndex + 1} de ${state.spine.length}`;

  dom.btnPrevChapter.disabled = chapterIndex === 0;
  dom.btnPlayerPrevChap.disabled = chapterIndex === 0;
  dom.btnNextChapter.disabled = chapterIndex >= state.spine.length - 1;

  const safeParaIdx = Math.min(Math.max(0, targetParagraphIndex), state.paragraphs.length - 1);
  selectParagraph(safeParaIdx, true);

  renderTocList();
  saveSettingsAndProgress();

  if (state.settings.translationMode === 'translated' || state.settings.translationMode === 'bilingual') {
    translateCurrentChapterInBackground();
  } else {
    dom.translationStatusBar.classList.add('hidden');
    dom.translationStatusBar.classList.remove('flex');
  }

  if (autoPlayAfterLoad || wasSpeaking) {
    startSpeechFromCurrent();
  }
}

export function extractReadableBlocks(rootNode) {
  const BLOCK_TAGS = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'P', 'BLOCKQUOTE', 'LI', 'PRE']);
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'HEAD', 'NOSCRIPT', 'SVG']);

  function walk(node) {
    if (!node) return;
    if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = node.tagName.toUpperCase();
      if (SKIP_TAGS.has(tag)) return;

      if (tag === 'IMG' || tag === 'IMAGE') {
        const blobSrc = node.getAttribute('data-epub-blob');
        if (blobSrc) {
          const wrapper = document.createElement('div');
          wrapper.className = 'epub-image-container';
          const newImg = document.createElement('img');
          newImg.src = blobSrc;
          newImg.alt = 'Ilustración';
          newImg.loading = 'lazy';
          wrapper.appendChild(newImg);
          dom.chapterContent.appendChild(wrapper);
        }
        return;
      }

      if (BLOCK_TAGS.has(tag)) {
        node.querySelectorAll('[data-epub-blob]').forEach(img => {
          const wrapper = document.createElement('div');
          wrapper.className = 'epub-image-container';
          const newImg = document.createElement('img');
          newImg.src = img.getAttribute('data-epub-blob');
          newImg.alt = 'Ilustración';
          wrapper.appendChild(newImg);
          dom.chapterContent.appendChild(wrapper);
        });

        const cleanText = node.textContent.replace(/\s+/g, ' ').trim();
        if (cleanText.length > 0) {
          appendParagraphBlock(cleanText, tag.toLowerCase());
        }
        return;
      }

      const hasBlockChild = Array.from(node.children).some(c =>
        BLOCK_TAGS.has(c.tagName.toUpperCase()) || c.tagName.toUpperCase() === 'DIV' || c.tagName.toUpperCase() === 'SECTION'
      );

      if ((tag === 'DIV' || tag === 'SECTION') && !hasBlockChild) {
        const text = node.textContent.replace(/\s+/g, ' ').trim();
        if (text.length > 0) {
          appendParagraphBlock(text, 'p');
          return;
        }
      }

      Array.from(node.childNodes).forEach(child => walk(child));
    }
  }

  walk(rootNode);
}

export function appendParagraphBlock(text, tagType) {
  const paraIndex = state.paragraphs.length;
  state.paragraphs.push(text);
  state.paragraphTags.push(tagType || 'p');
  state.translatedParagraphs.push('');

  const block = document.createElement('div');
  block.className = 'reader-block group';
  if (tagType.startsWith('h')) block.classList.add('heading-block');
  if (tagType === 'blockquote') block.classList.add('quote-block');
  block.dataset.index = paraIndex;

  const textWrap = document.createElement('div');
  textWrap.className = 'para-text-wrap pr-6';
  block.appendChild(textWrap);

  const quickTransBtn = document.createElement('button');
  quickTransBtn.type = 'button';
  quickTransBtn.className = 'para-trans-btn absolute top-2 right-2 p-1.5 rounded-lg text-[10px] font-bold opacity-60 hover:opacity-100 transition flex items-center gap-0.5';
  quickTransBtn.style.backgroundColor = 'var(--bg-primary)';
  quickTransBtn.style.color = 'var(--accent-color)';
  quickTransBtn.style.border = '1px solid var(--border-color)';
  quickTransBtn.title = 'Traducir este párrafo EN ➔ ES';
  quickTransBtn.innerHTML = '<span>ES</span>';

  quickTransBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (state.individualTransShown[paraIndex]) {
      delete state.individualTransShown[paraIndex];
      // Importado desde ui.js más adelante
      const evt = new CustomEvent('updateParagraphDOM', { detail: paraIndex });
      document.dispatchEvent(evt);
    } else {
      quickTransBtn.textContent = '...';
      await ensureParagraphTranslated(paraIndex);
      state.individualTransShown[paraIndex] = true;
      const evt = new CustomEvent('updateParagraphDOM', { detail: paraIndex });
      document.dispatchEvent(evt);
    }
  });

  block.appendChild(quickTransBtn);

  let lastTapTime = 0;
  block.addEventListener('click', (e) => {
    if (e.target.closest('.para-trans-btn')) return;

    if (state.settings.tapMode === 'single') {
      selectParagraph(paraIndex, false);
      startSpeechFromCurrent();
      return;
    }

    const now = Date.now();
    const delta = now - lastTapTime;
    lastTapTime = now;

    if (delta > 0 && delta < 360) {
      selectParagraph(paraIndex, false);
      startSpeechFromCurrent();
    } else {
      selectParagraph(paraIndex, false, false);
    }
  });

  dom.chapterContent.appendChild(block);
  
  // Disparamos evento para que UI.js se encargue del pintado final
  const evt = new CustomEvent('updateParagraphDOM', { detail: paraIndex });
  document.dispatchEvent(evt);
}