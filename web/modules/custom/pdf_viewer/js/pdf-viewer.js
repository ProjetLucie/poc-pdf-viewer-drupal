/**
 * @file
 * PDF Viewer behavior using PDF.js — supports multiple instances per page.
 *
 * Each instance is identified by a unique `data-viewer-id` attribute set on:
 *   - the trigger button  (.open-viewer)
 *   - the modal overlay   (.pdf-modal-overlay)
 *   - the canvas          (canvas[data-viewer-id])
 *
 * Only one viewer can be open at a time; state.els always points to the
 * currently active instance's DOM elements.
 */
(function (Drupal, once) {
  'use strict';

  const PDFJS_WORKER_SRC =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  const SCALE_MIN  = 0.5;
  const SCALE_MAX  = 5.0;
  const SCALE_STEP = 0.25;

  // ─── Singleton state (one viewer open at a time) ──────────────────────────

  const state = {
    /** @type {import('pdfjs-dist').PDFDocumentProxy|null} */
    pdfDoc:      null,
    currentPage: 1,
    totalPages:  0,
    scale:       1.5,
    rotation:    0,
    rendering:   false,
    /**
     * DOM references for the currently active viewer instance.
     * @type {{overlay: Element, canvas: Element, indicator: Element, prev: Element, next: Element}|null}
     */
    els: null,
  };

  // ─── Drupal behavior ──────────────────────────────────────────────────────

  Drupal.behaviors.pdfViewer = {
    attach(context) {
      if (typeof pdfjsLib !== 'undefined') {
        pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
      }

      // Hoist every overlay to <body> so position:fixed is never clipped by a
      // parent stacking context (e.g. Drupal toolbar, transformed wrappers).
      once('pdf-viewer-hoist', '.pdf-modal-overlay', context).forEach((overlay) => {
        if (overlay.parentElement !== document.body) {
          document.body.appendChild(overlay);
        }
      });

      // ── Mode 1 : trigger button with built-in viewer-id (.open-viewer) ──
      // Trigger buttons — scoped to the current context (may appear many times
      // on the same page). Each carries the viewer-id of its own modal.
      once('pdf-viewer-open', '.open-viewer', context).forEach((button) => {
        button.addEventListener('click', () => {
          const pdfUrl   = button.dataset.pdf;
          const viewerId = button.dataset.viewerId;
          if (pdfUrl && viewerId) {
            openModal(pdfUrl, viewerId);
          }
        });
      });

      // ── Mode 2 : external trigger via data-open-pdf-viewer ───────────────
      // Any element on the page with data-open-pdf-viewer="<viewer-id>" and
      // data-pdf="<url>" will open the matching modal. The element itself can
      // be anything: <a>, <button>, <div>, <img>, a card, etc.
      once('pdf-viewer-external', '[data-open-pdf-viewer]', context).forEach((trigger) => {
        trigger.addEventListener('click', (e) => {
          e.preventDefault();
          const viewerId = trigger.dataset.openPdfViewer;
          const pdfUrl   = trigger.dataset.pdf;
          if (viewerId && pdfUrl) {
            openModal(pdfUrl, viewerId);
          }
        });
      });

      // ── Modal-internal buttons ────────────────────────────────────────────
      // The overlays have been hoisted to <body>, so we must use `document`
      // as the scope. Because only one modal is active at a time, all these
      // handlers safely operate on `state.els` (the active instance).

      once('pdf-viewer-close', '.pdf-modal-close', document).forEach((btn) => {
        btn.addEventListener('click', closeModal);
      });

      once('pdf-viewer-overlay-click', '.pdf-modal-overlay', document).forEach(
        (overlay) => {
          overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeModal();
          });
        }
      );

      once('pdf-viewer-keyboard', document).forEach(() => {
        document.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') closeModal();
        });
      });

      once('pdf-viewer-prev', '.pdf-prev', document).forEach((btn) => {
        btn.addEventListener('click', () => goToPage(state.currentPage - 1));
      });

      once('pdf-viewer-next', '.pdf-next', document).forEach((btn) => {
        btn.addEventListener('click', () => goToPage(state.currentPage + 1));
      });

      once('pdf-viewer-zoom-in', '.pdf-zoom-in', document).forEach((btn) => {
        btn.addEventListener('click', () => zoom(SCALE_STEP));
      });

      once('pdf-viewer-zoom-out', '.pdf-zoom-out', document).forEach((btn) => {
        btn.addEventListener('click', () => zoom(-SCALE_STEP));
      });

      once('pdf-viewer-rotate-cw', '.pdf-rotate-cw', document).forEach((btn) => {
        btn.addEventListener('click', () => rotate(90));
      });

      once('pdf-viewer-rotate-ccw', '.pdf-rotate-ccw', document).forEach((btn) => {
        btn.addEventListener('click', () => rotate(-90));
      });
    },
  };

  // ─── Modal helpers ────────────────────────────────────────────────────────

  /**
   * Opens the modal that belongs to `viewerId` and starts loading `url`.
   *
   * @param {string} url
   * @param {string} viewerId
   */
  function openModal(url, viewerId) {
    const overlay = document.querySelector(
      `.pdf-modal-overlay[data-viewer-id="${viewerId}"]`
    );
    if (!overlay) return;

    // Collect DOM references for this instance.
    state.els = {
      overlay,
      canvas:    overlay.querySelector(`canvas[data-viewer-id="${viewerId}"]`),
      indicator: overlay.querySelector('.pdf-page-indicator'),
      prev:      overlay.querySelector('.pdf-prev'),
      next:      overlay.querySelector('.pdf-next'),
    };

    // Reset state for the new document.
    state.pdfDoc      = null;
    state.currentPage = 1;
    state.totalPages  = 0;
    state.scale       = 1.5;
    state.rotation    = 0;
    state.rendering   = false;

    overlay.classList.add('is-active');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('pdf-modal-open');

    loadPdf(url);
  }

  /**
   * Closes the currently active modal and clears its canvas.
   */
  function closeModal() {
    if (!state.els) return;
    const { overlay, canvas } = state.els;
    if (!overlay.classList.contains('is-active')) return;

    overlay.classList.remove('is-active');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('pdf-modal-open');

    if (canvas) {
      canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    }

    state.pdfDoc     = null;
    state.totalPages = 0;
    state.els        = null;
  }

  // ─── PDF loading & rendering ──────────────────────────────────────────────

  /**
   * @param {string} url
   */
  function loadPdf(url) {
    if (typeof pdfjsLib === 'undefined') {
      console.error('[pdf-viewer] PDF.js is not loaded.');
      return;
    }

    updatePageIndicator('…');

    pdfjsLib
      .getDocument(url)
      .promise.then((pdf) => {
        state.pdfDoc     = pdf;
        state.totalPages = pdf.numPages;
        renderPage(state.currentPage);
      })
      .catch((err) => {
        console.error('[pdf-viewer] Failed to load PDF:', err);
      });
  }

  /**
   * @param {number} pageNum
   */
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
        state.rendering  = false;
        state.currentPage = pageNum;
        updatePageIndicator(`${state.currentPage} / ${state.totalPages}`);
        updateNavButtons();
      })
      .catch((err) => {
        state.rendering = false;
        console.error('[pdf-viewer] Failed to render page:', err);
      });
  }

  // ─── Pagination, zoom, rotation ───────────────────────────────────────────

  /** @param {number} pageNum */
  function goToPage(pageNum) {
    const target = Math.max(1, Math.min(pageNum, state.totalPages));
    if (target !== state.currentPage) {
      renderPage(target);
    }
  }

  /** @param {number} delta */
  function zoom(delta) {
    const newScale = parseFloat((state.scale + delta).toFixed(2));
    if (newScale < SCALE_MIN || newScale > SCALE_MAX) return;
    state.scale = newScale;
    renderPage(state.currentPage);
  }

  /** @param {number} deg  +90 = clockwise, -90 = counter-clockwise */
  function rotate(deg) {
    state.rotation = ((state.rotation + deg) % 360 + 360) % 360;
    renderPage(state.currentPage);
  }

  // ─── UI updates ───────────────────────────────────────────────────────────

  /** @param {string} text */
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

