<?php

namespace Drupal\pdf_viewer_secure\Controller;

use Drupal\Core\Controller\ControllerBase;
use Drupal\pdf_viewer_secure\Service\PdfTokenService;
use Symfony\Component\DependencyInjection\ContainerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * Serves PDF files via signed tokens generated on demand.
 *
 * Two endpoints:
 *   GET /pdf-viewer/token/{fid}  — generates a fresh short-lived token (AJAX).
 *   GET /pdf-viewer/serve/{token} — streams the PDF bytes.
 *
 * Tokens are generated at click time, not at page render time, so they are
 * always fresh regardless of Drupal page cache TTL.
 */
class PdfProxyController extends ControllerBase {

  public function __construct(
    private readonly PdfTokenService $tokenService,
  ) {}

  public static function create(ContainerInterface $container): static {
    return new static($container->get('pdf_viewer_secure.token'));
  }

  /**
   * Returns a fresh signed token for the given managed file.
   *
   * Called by the JS on every viewer open — never cached, always fresh.
   */
  public function token(int $fid, Request $request): JsonResponse {
    if ($request->headers->get('X-PDF-Viewer') !== '1') {
      throw new AccessDeniedHttpException();
    }

    $file = $this->entityTypeManager()->getStorage('file')->load($fid);
    if (!$file) {
      throw new NotFoundHttpException();
    }

    if (!$file->access('view')) {
      throw new AccessDeniedHttpException();
    }

    $token = $this->tokenService->generate($fid, (int) $this->currentUser()->id());

    $response = new JsonResponse([
      'token'    => $token,
      'filename' => $file->getFilename(),
    ]);
    $response->headers->set('Cache-Control', 'no-store, private');
    return $response;
  }

  /**
   * Streams the PDF after validating the signed token.
   */
  public function serve(string $token, Request $request): StreamedResponse {
    if ($request->headers->get('X-PDF-Viewer') !== '1') {
      throw new AccessDeniedHttpException();
    }

    $data = $this->tokenService->validate($token);
    if (!$data) {
      throw new AccessDeniedHttpException();
    }

    if ((int) $data['uid'] !== (int) $this->currentUser()->id()) {
      throw new AccessDeniedHttpException();
    }

    $file = $this->entityTypeManager()->getStorage('file')->load($data['fid']);
    if (!$file) {
      throw new NotFoundHttpException();
    }

    if (!$file->access('view')) {
      throw new AccessDeniedHttpException();
    }

    $uri = $file->getFileUri();

    $response = new StreamedResponse(static function () use ($uri): void {
      $handle = fopen($uri, 'rb');
      if ($handle !== FALSE) {
        fpassthru($handle);
        fclose($handle);
      }
    });

    $response->headers->set('Content-Type', 'application/pdf');
    $response->headers->set('Content-Disposition', 'inline; filename="document.pdf"');
    $response->headers->set('Content-Length', (string) $file->getSize());
    $response->headers->set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    $response->headers->set('Pragma', 'no-cache');
    $response->headers->set('X-Content-Type-Options', 'nosniff');
    $response->headers->set('X-Robots-Tag', 'noindex, nofollow');
    $response->headers->set('Accept-Ranges', 'none');

    return $response;
  }

}
