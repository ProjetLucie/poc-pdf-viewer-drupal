/**
 * @file
 * Secure PDF Viewer — no file URL in DOM or network tab after initial load.
 *
 * Security properties:
 *  - Trigger buttons carry only data-viewer-id, never data-pdf.
 *  - The real file path is unknown to the browser; the JS fetches
 *    /pdf-viewer/serve/{token} where the token is a server-signed,
 *    user-scoped, time-limited payload injected via drupalSettings.
 *  - The PDF byte stream is passed to PDF.js as an ArrayBuffer, so no
 *    object/blob URL for the document is ever created or left in memory.
 *  - The fetch uses credentials:'same-origin' and cache:'no-store'.
 */
(function (Drupal, once) {
  'use strict';

  const WORKER_SRC  = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const TOKEN_PATH  = '/pdf-viewer/token/';
  const PROXY_PATH  = '/pdf-viewer/serve/';
  const SCALE_MIN   = 0.5;
  const SCALE_MAX   = 5.0;
  const SCALE_STEP  = 0.25;

  const state = {
    /** @type {import('pdfjs-dist').PDFDocumentProxy|null} */
    pdfDoc:      null,
    currentPage: 1,
    totalPages:  0,
    scale:       1.5,
    rotation:    0,
    rendering:   false,
    /** @type {{overlay,canvas,indicator,prev,next}|null} */
    els: null,
  };

  Drupal.behaviors.pdfViewerSecure = {
    attach(context) {
      if (typeof pdfjsLib !== 'undefined') {
        pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER_SRC;
      }

      once('pvs-hoist', '.pvs-modal-overlay', context).forEach((overlay) => {
        if (overlay.parentElement !== document.body) {
          document.body.appendChild(overlay);
        }
      });

      // Mode 1 — built-in trigger button (.open-viewer-secure).
      once('pvs-open', '.open-viewer-secure', context).forEach((button) => {
        button.addEventListener('click', () => {
          const viewerId = button.dataset.viewerId;
          if (viewerId) openModal(viewerId);
        });
      });

      // Mode 2 — any element with data-open-pdf-viewer-secure="<viewer-id>".
      once('pvs-external', '[data-open-pdf-viewer-secure]', context).forEach((trigger) => {
        trigger.addEventListener('click', (e) => {
          e.preventDefault();
          const viewerId = trigger.dataset.openPdfViewerSecure;
          if (viewerId) openModal(viewerId);
        });
      });

      once('pvs-close', '.pvs-modal-close', document).forEach((btn) => {
        btn.addEventListener('click', closeModal);
      });

      once('pvs-overlay-click', '.pvs-modal-overlay', document).forEach((overlay) => {
        overlay.addEventListener('click', (e) => {
          if (e.target === overlay) closeModal();
        });
      });

      once('pvs-keyboard', document).forEach(() => {
        document.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') closeModal();
        });
      });

      once('pvs-prev', '.pvs-prev', document).forEach((btn) => {
        btn.addEventListener('click', () => goToPage(state.currentPage - 1));
      });

      once('pvs-next', '.pvs-next', document).forEach((btn) => {
        btn.addEventListener('click', () => goToPage(state.currentPage + 1));
      });

      once('pvs-zoom-in', '.pvs-zoom-in', document).forEach((btn) => {
        btn.addEventListener('click', () => zoom(SCALE_STEP));
      });

      once('pvs-zoom-out', '.pvs-zoom-out', document).forEach((btn) => {
        btn.addEventListener('click', () => zoom(-SCALE_STEP));
      });

      once('pvs-rotate-cw', '.pvs-rotate-cw', document).forEach((btn) => {
        btn.addEventListener('click', () => rotate(90));
      });

      once('pvs-rotate-ccw', '.pvs-rotate-ccw', document).forEach((btn) => {
        btn.addEventListener('click', () => rotate(-90));
      });
    },
  };

  function openModal(viewerId) {
    const overlay = document.querySelector(`.pvs-modal-overlay[data-viewer-id="${viewerId}"]`);
    if (!overlay) return;

    state.els = {
      overlay,
      canvas:    overlay.querySelector(`.pvs-canvas[data-viewer-id="${viewerId}"]`),
      indicator: overlay.querySelector('.pvs-page-indicator'),
      title:     overlay.querySelector('.pvs-doc-title'),
      prev:      overlay.querySelector('.pvs-prev'),
      next:      overlay.querySelector('.pvs-next'),
    };

    state.pdfDoc      = null;
    state.currentPage = 1;
    state.totalPages  = 0;
    state.scale       = 1.5;
    state.rotation    = 0;
    state.rendering   = false;

    overlay.classList.add('is-active');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('pvs-modal-open');

    const fid = overlay.dataset.fid;
    loadPdf(fid);
  }

  function closeModal() {
    if (!state.els) return;
    const { overlay, canvas } = state.els;
    if (!overlay.classList.contains('is-active')) return;

    overlay.classList.remove('is-active');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('pvs-modal-open');

    if (canvas) {
      canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    }

    state.pdfDoc     = null;
    state.totalPages = 0;
    state.els        = null;
  }

  /**
   * Fetches a fresh token for the given fid, then streams the PDF as ArrayBuffer.
   *
   * Token is requested at click time — never cached — so page cache TTL is
   * irrelevant. The real file URL never leaves the server.
   *
   * @param {string} fid  Drupal managed file ID stored in data-fid on the overlay.
   */
  async function loadPdf(fid) {
    if (typeof pdfjsLib === 'undefined') {
      console.error('[pdf-viewer-secure] PDF.js not loaded.');
      return;
    }

    if (!fid) {
      console.error('[pdf-viewer-secure] No fid on overlay.');
      updatePageIndicator('Erreur');
      return;
    }

    updatePageIndicator('…');

    try {
      // Step 1 — get a fresh signed token (always called at click time).
      const tokenRes = await fetch(TOKEN_PATH + fid, {
        credentials: 'same-origin',
        headers: { 'X-PDF-Viewer': '1' },
      });

      if (!tokenRes.ok) {
        throw new Error(`Token request failed: HTTP ${tokenRes.status}`);
      }

      const { token, filename } = await tokenRes.json();
      if (state.els?.title && filename) {
        state.els.title.textContent = filename;
      }

      // Step 2 — fetch PDF bytes via the proxy (token valid for 1h but used immediately).
      const pdfRes = await fetch(PROXY_PATH + token, {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'X-PDF-Viewer': '1' },
      });

      if (!pdfRes.ok) {
        throw new Error(`PDF request failed: HTTP ${pdfRes.status}`);
      }

      const arrayBuffer = await pdfRes.arrayBuffer();

      // Pass raw bytes — no URL, no blob, nothing to extract from the network tab.
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

      state.pdfDoc     = pdf;
      state.totalPages = pdf.numPages;
      renderPage(state.currentPage);
    }
    catch (err) {
      console.error('[pdf-viewer-secure] Failed to load PDF:', err);
      updatePageIndicator('Erreur de chargement');
    }
  }

  function renderPage(pageNum) {
    if (!state.pdfDoc || state.rendering || !state.els) return;

    state.rendering = true;

    state.pdfDoc
      .getPage(pageNum)
      .then((page) => {
        const { canvas } = state.els;
        if (!canvas) {
          state.rendering = false;
          return;
        }

        const ctx      = canvas.getContext('2d');
        const viewport = page.getViewport({ scale: state.scale, rotation: state.rotation });

        canvas.width  = viewport.width;
        canvas.height = viewport.height;

        return page.render({ canvasContext: ctx, viewport }).promise;
      })
      .then(() => {
        state.rendering   = false;
        state.currentPage = pageNum;
        updatePageIndicator(`${state.currentPage} / ${state.totalPages}`);
        updateNavButtons();
      })
      .catch((err) => {
        state.rendering = false;
        console.error('[pdf-viewer-secure] Render error:', err);
      });
  }

  function goToPage(pageNum) {
    const target = Math.max(1, Math.min(pageNum, state.totalPages));
    if (target !== state.currentPage) renderPage(target);
  }

  function zoom(delta) {
    const newScale = parseFloat((state.scale + delta).toFixed(2));
    if (newScale < SCALE_MIN || newScale > SCALE_MAX) return;
    state.scale = newScale;
    renderPage(state.currentPage);
  }

  function rotate(deg) {
    state.rotation = ((state.rotation + deg) % 360 + 360) % 360;
    renderPage(state.currentPage);
  }

  function updatePageIndicator(text) {
    if (state.els?.indicator) {
      state.els.indicator.textContent = text;
    }
  }

  function updateNavButtons() {
    if (!state.els) return;
    if (state.els.prev) state.els.prev.disabled = state.currentPage <= 1;
    if (state.els.next) state.els.next.disabled = state.currentPage >= state.totalPages;
  }

})(Drupal, once);
