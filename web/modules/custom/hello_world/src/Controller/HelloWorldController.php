<?php

namespace Drupal\hello_world\Controller;

use Drupal\Core\Controller\ControllerBase;
use Drupal\file\FileInterface;

/**
 * Demo page — pdf_viewer and pdf_viewer_secure side by side.
 */
class HelloWorldController extends ControllerBase {

  public function hello(): array {
    $files = $this->latestPdfs(2);
    $file1 = $files[0] ?? NULL;
    $file2 = $files[1] ?? $files[0] ?? NULL;

    $build = [];

    // ── pdf_viewer (original) ─────────────────────────────────────────────────
    $build['original_heading'] = [
      '#markup' => '<h2>pdf_viewer — original (URL exposée)</h2>',
    ];

    if ($file1) {
      $build['mode1_heading'] = [
        '#markup' => '<h3>Mode 1 — bouton intégré</h3>',
      ];
      $build['pdf1'] = [
        '#theme'        => 'pdf_viewer',
        '#pdf_url'      => $this->fileUrl($file1),
        '#button_label' => '📄 ' . $file1->getFilename(),
      ];
    }

    if ($file2) {
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
             data-pdf="' . $this->fileUrl($file1) . '"
             style="margin-right:1rem">
            🔗 ' . $file1->getFilename() . '
          </a>
          <button type="button"
                  data-open-pdf-viewer="devis-viewer"
                  data-pdf="' . $this->fileUrl($file2) . '"
                  style="padding:8px 16px;cursor:pointer">
            🖱️ ' . $file2->getFilename() . '
          </button>
        ',
      ];
    }

    // ── pdf_viewer_secure ─────────────────────────────────────────────────────
    $build['secure_heading'] = [
      '#markup' => '<h2 style="margin-top:3rem">pdf_viewer_secure — URL jamais exposée</h2>',
    ];

    if ($file1) {
      $build['secure_mode1_heading'] = [
        '#markup' => '<h3>Mode 1 — bouton intégré (secure)</h3>',
      ];
      $build['secure_pdf1'] = [
        '#theme'        => 'pdf_viewer_secure',
        '#fid'          => (int) $file1->id(),
        '#button_label' => '🔒 ' . $file1->getFilename() . ' (secure)',
      ];
    }

    if ($file2) {
      $build['secure_mode2_heading'] = [
        '#markup' => '<h3 style="margin-top:2rem">Mode 2 — déclencheurs externes (secure)</h3>',
      ];
      $build['secure_devis_modal'] = [
        '#theme'     => 'pdf_viewer_secure_modal',
        '#fid'       => (int) $file2->id(),
        '#viewer_id' => 'devis-viewer-secure',
      ];
      $build['secure_devis_triggers'] = [
        '#markup' => '
          <p>Pas de <code>data-pdf</code> sur le déclencheur :</p>
          <a href="#" data-open-pdf-viewer-secure="devis-viewer-secure">
            🔗 ' . $file2->getFilename() . ' (secure)
          </a>
        ',
      ];
    }

    if (!$file1) {
      $build['no_files'] = [
        '#markup' => '<p><em>Aucun fichier PDF trouvé en base. Importer via <a href="/admin/content/files">/admin/content/files</a>.</em></p>',
      ];
    }

    return $build;
  }

  /**
   * Returns up to $limit managed PDF file entities, newest first.
   *
   * @return \Drupal\file\FileInterface[]
   */
  private function latestPdfs(int $limit = 2): array {
    $ids = $this->entityTypeManager()
      ->getStorage('file')
      ->getQuery()
      ->accessCheck(FALSE)
      ->condition('filemime', 'application/pdf')
      ->condition('status', 1)
      ->sort('fid', 'DESC')
      ->range(0, $limit)
      ->execute();

    if (empty($ids)) {
      return [];
    }

    return array_values(
      $this->entityTypeManager()->getStorage('file')->loadMultiple($ids)
    );
  }

  private function fileUrl(FileInterface $file): string {
    return \Drupal::service('file_url_generator')->generateAbsoluteString($file->getFileUri());
  }

}
