<?php

namespace Drupal\pdf_viewer_secure\Service;

use Drupal\Core\PrivateKey;

/**
 * Generates and validates HMAC-signed, time-limited PDF access tokens.
 *
 * Token format: {base64url(json_payload)}.{hmac_sha256_hex}
 * Payload fields: fid (int), uid (int), exp (unix timestamp).
 */
class PdfTokenService {

  const TOKEN_TTL = 3600;

  public function __construct(
    private readonly PrivateKey $privateKey,
  ) {}

  public function generate(int $fid, int $uid): string {
    $payload = $this->encodePayload([
      'fid' => $fid,
      'uid' => $uid,
      'exp' => time() + self::TOKEN_TTL,
    ]);
    $sig = hash_hmac('sha256', $payload, $this->secret());
    return $payload . '.' . $sig;
  }

  /**
   * @return array{fid: int, uid: int, exp: int}|false
   */
  public function validate(string $token): array|false {
    $parts = explode('.', $token, 2);
    if (count($parts) !== 2) {
      return FALSE;
    }

    [$payload, $sig] = $parts;

    if (!hash_equals(hash_hmac('sha256', $payload, $this->secret()), $sig)) {
      return FALSE;
    }

    $data = json_decode(base64_decode(strtr($payload, '-_', '+/')), TRUE);
    if (!is_array($data) || empty($data['fid']) || !isset($data['uid'], $data['exp'])) {
      return FALSE;
    }

    if ($data['exp'] < time()) {
      return FALSE;
    }

    return $data;
  }

  private function encodePayload(array $data): string {
    $json = json_encode($data, JSON_THROW_ON_ERROR);
    return rtrim(strtr(base64_encode($json), '+/', '-_'), '=');
  }

  private function secret(): string {
    return $this->privateKey->get();
  }

}
