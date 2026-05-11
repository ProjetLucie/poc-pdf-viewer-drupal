/**
 * @file
 * PDF Viewer behavior using PDF.js.
 *
 * Attaches a modal PDF viewer to any element with the class `open-viewer`
 * and a `data-pdf` attribute pointing to the PDF URL.
 */
(function (Drupal, once) {
  'use strict';

  // PDF.js CDN base — must match the version loaded in the library definition.
  const PDFJS_WORKER_SRC =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  // Minimum / maximum zoom levels.
  const SCALE_MIN = 0.5;
  const SCALE_MAX = 3.0;
  const SCALE_STEP = 0.25;

  // ─── Internal state ──────────────────────────────────────────────────────────

  const state = {
    /** @type {import('pdfjs-dist').PDFDocumentProxy|null} */
    pdfDoc: null,
    currentPage: 1,
    totalPages: 0,
    scale: 1.5,
    rendering: false,
  };

  // ─── Drupal behavior ─────────────────────────────────────────────────────────

  Drupal.behaviors.pdfViewer = {
    attach(context) {
      // Configure the PDF.js worker once, regardless of how many times
      // `attach` is called (Drupal may call it multiple times on ajax).
      if (typeof pdfjsLib !== 'undefined') {
        pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
      }

      // Move the overlay to <body> so it is never trapped inside a
      // stacking context created by a parent element (e.g. Drupal toolbar).
      once('pdf-viewer-hoist', '.pdf-modal-overlay', context).forEach((overlay) => {
        if (overlay.parentElement !== document.body) {
          document.body.appendChild(overlay);
        }
      });

      // "Voir le document" buttons.
      once('pdf-viewer-open', '.open-viewer', context).forEach((button) => {
        button.addEventListener('click', () => {
          const pdfUrl = button.getAttribute('data-pdf');
          if (pdfUrl) {
            openModal(pdfUrl);
          }
        });
      });

      // The overlay has been hoisted to <body>, so all modal-internal
      // listeners must look in `document` to survive AJAX re-attaches.

      // Close button inside the modal.
      once('pdf-viewer-close', '.pdf-modal-close', document).forEach((btn) => {
        btn.addEventListener('click', closeModal);
      });

      // Click on the dark overlay (outside the modal box) also closes it.
      once('pdf-viewer-overlay', '.pdf-modal-overlay', document).forEach(
        (overlay) => {
          overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
              closeModal();
            }
          });
        }
      );

      // Keyboard: Escape closes the modal.
      once('pdf-viewer-keyboard', document).forEach(() => {
        document.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') {
            closeModal();
          }
        });
      });

      // Navigation buttons.
      once('pdf-viewer-prev', '.pdf-prev', document).forEach((btn) => {
        btn.addEventListener('click', () => goToPage(state.currentPage - 1));
      });

      once('pdf-viewer-next', '.pdf-next', document).forEach((btn) => {
        btn.addEventListener('click', () => goToPage(state.currentPage + 1));
      });

      // Zoom buttons.
      once('pdf-viewer-zoom-in', '.pdf-zoom-in', document).forEach((btn) => {
        btn.addEventListener('click', () => zoom(SCALE_STEP));
      });

      once('pdf-viewer-zoom-out', '.pdf-zoom-out', document).forEach((btn) => {
        btn.addEventListener('click', () => zoom(-SCALE_STEP));
      });
    },
  };

  // ─── Modal helpers ────────────────────────────────────────────────────────────

  /**
   * Opens the modal and starts loading the PDF at `url`.
   *
   * @param {string} url
   */
  function openModal(url) {
    const overlay = document.querySelector('.pdf-modal-overlay');
    if (!overlay) return;

    // Reset state for the new document.
    state.currentPage = 1;
    state.scale = 1.5;
    state.rendering = false;

    overlay.classList.add('is-active');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('pdf-modal-open');

    loadPdf(url);
  }

  /**
   * Closes the modal and clears the canvas.
   */
  function closeModal() {
    const overlay = document.querySelector('.pdf-modal-overlay');
    if (!overlay || !overlay.classList.contains('is-active')) return;

    overlay.classList.remove('is-active');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('pdf-modal-open');

    // Clear canvas so the previous PDF doesn't flash on the next open.
    const canvas = document.getElementById('pdf-canvas');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    state.pdfDoc = null;
    state.totalPages = 0;
  }

  // ─── PDF loading & rendering ──────────────────────────────────────────────────

  /**
   * Loads a PDF document from `url` using PDF.js.
   *
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
        state.pdfDoc = pdf;
        state.totalPages = pdf.numPages;
        renderPage(state.currentPage);
      })
      .catch((err) => {
        console.error('[pdf-viewer] Failed to load PDF:', err);
      });
  }

  /**
   * Renders `pageNum` into the `<canvas>` element.
   *
   * @param {number} pageNum
   */
  function renderPage(pageNum) {
    if (!state.pdfDoc || state.rendering) return;

    state.rendering = true;

    state.pdfDoc
      .getPage(pageNum)
      .then((page) => {
        const canvas = document.getElementById('pdf-canvas');
        if (!canvas) {
          state.rendering = false;
          return;
        }

        const ctx = canvas.getContext('2d');
        const viewport = page.getViewport({ scale: state.scale });

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        return page.render({ canvasContext: ctx, viewport }).promise;
      })
      .then(() => {
        state.rendering = false;
        state.currentPage = pageNum;
        updatePageIndicator(`${state.currentPage} / ${state.totalPages}`);
        updateNavButtons();
      })
      .catch((err) => {
        state.rendering = false;
        console.error('[pdf-viewer] Failed to render page:', err);
      });
  }

  // ─── Pagination & zoom ────────────────────────────────────────────────────────

  /**
   * Navigates to a given page number (clamped to valid range).
   *
   * @param {number} pageNum
   */
  function goToPage(pageNum) {
    const target = Math.max(1, Math.min(pageNum, state.totalPages));
    if (target !== state.currentPage) {
      renderPage(target);
    }
  }

  /**
   * Adjusts the zoom scale by `delta` and re-renders the current page.
   *
   * @param {number} delta  Positive to zoom in, negative to zoom out.
   */
  function zoom(delta) {
    const newScale = parseFloat((state.scale + delta).toFixed(2));
    if (newScale < SCALE_MIN || newScale > SCALE_MAX) return;
    state.scale = newScale;
    renderPage(state.currentPage);
  }

  // ─── UI updates ───────────────────────────────────────────────────────────────

  /**
   * Updates the page indicator text.
   *
   * @param {string} text
   */
  function updatePageIndicator(text) {
    const indicator = document.querySelector('.pdf-page-indicator');
    if (indicator) {
      indicator.textContent = text;
    }
  }

  /**
   * Disables the Prev/Next buttons when the user is at the first/last page.
   */
  function updateNavButtons() {
    const prevBtn = document.querySelector('.pdf-prev');
    const nextBtn = document.querySelector('.pdf-next');

    if (prevBtn) prevBtn.disabled = state.currentPage <= 1;
    if (nextBtn) nextBtn.disabled = state.currentPage >= state.totalPages;
  }
})(Drupal, once);
