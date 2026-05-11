<?php

namespace Drupal\hello_world\Controller;

use Drupal\Core\Controller\ControllerBase;

/**
 * Returns a simple Hello World page.
 */
class HelloWorldController extends ControllerBase {

  /**
   * Demo page — pdf_viewer (insecure) and pdf_viewer_secure side by side.
   */
  public function hello(): array {
    $fidTracemonkey = $this->fidByUri('public://TraceMonkey-PLDI-09.pdf');
    $fidDevis       = $this->fidByUri('public://DI-260402-0003.pdf');

    $build = [];

    // ── pdf_viewer (original) ─────────────────────────────────────────────────
    $build['original_heading'] = [
      '#markup' => '<h2>pdf_viewer — original (URL exposée)</h2>',
    ];

    $build['mode1_heading'] = [
      '#markup' => '<h3>Mode 1 — bouton intégré</h3>',
    ];
    $build['tracemonkey'] = [
      '#theme'        => 'pdf_viewer',
      '#pdf_url'      => '/sites/default/files/TraceMonkey-PLDI-09.pdf',
      '#button_label' => '📄 TraceMonkey — PLDI 09',
    ];

    $build['mode2_heading'] = [
      '#markup' => '<h3 style="margin-top:2rem">Mode 2 — déclencheurs externes</h3>',
    ];
    $build['devis_modal'] = [
      '#theme'     => 'pdf_viewer_modal',
      '#viewer_id' => 'devis-viewer',
    ];
    $build['devis_triggers'] = [
      '#markup' => '
        <p>Ces deux éléments partagent la même modal :</p>
        <a href="#"
           data-open-pdf-viewer="devis-viewer"
           data-pdf="/sites/default/files/DI-260402-0003.pdf"
           style="margin-right:1rem">
          🔗 Lien texte → DI-260402-0003
        </a>
        <button type="button"
                data-open-pdf-viewer="devis-viewer"
                data-pdf="/sites/default/files/TraceMonkey-PLDI-09.pdf"
                style="padding:8px 16px;cursor:pointer">
          🖱️ Bouton custom → TraceMonkey
        </button>
      ',
    ];

    // ── pdf_viewer_secure ─────────────────────────────────────────────────────
    $build['secure_heading'] = [
      '#markup' => '<h2 style="margin-top:3rem">pdf_viewer_secure — URL jamais exposée</h2>',
    ];

    if ($fidTracemonkey) {
      $build['secure_mode1_heading'] = [
        '#markup' => '<h3>Mode 1 — bouton intégré (secure)</h3>',
      ];
      $build['secure_tracemonkey'] = [
        '#theme'        => 'pdf_viewer_secure',
        '#fid'          => $fidTracemonkey,
        '#button_label' => '🔒 TraceMonkey — PLDI 09 (secure)',
      ];
    }

    if ($fidDevis) {
      $build['secure_mode2_heading'] = [
        '#markup' => '<h3 style="margin-top:2rem">Mode 2 — déclencheurs externes (secure)</h3>',
      ];
      $build['secure_devis_modal'] = [
        '#theme'     => 'pdf_viewer_secure_modal',
        '#fid'       => $fidDevis,
        '#viewer_id' => 'devis-viewer-secure',
      ];
      $build['secure_devis_triggers'] = [
        '#markup' => '
          <p>Pas de <code>data-pdf</code> sur le déclencheur — le path fichier n\'est pas dans le DOM :</p>
          <a href="#"
             data-open-pdf-viewer-secure="devis-viewer-secure"
             style="margin-right:1rem">
            🔗 Lien texte → DI-260402-0003 (secure)
          </a>
        ',
      ];
    }

    if (!$fidTracemonkey && !$fidDevis) {
      $build['secure_no_files'] = [
        '#markup' => '<p><em>Aucun fichier trouvé en base. Importer les PDFs via le gestionnaire de fichiers Drupal.</em></p>',
      ];
    }

    return $build;
  }

  /**
   * Returns the fid of the first managed file matching the given stream URI,
   * or NULL if not found.
   */
  private function fidByUri(string $uri): ?int {
    $files = $this->entityTypeManager()
      ->getStorage('file')
      ->loadByProperties(['uri' => $uri]);

    if (empty($files)) {
      return NULL;
    }

    return (int) reset($files)->id();
  }

}
