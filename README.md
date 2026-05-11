# poc-viewer-drupal

Projet Drupal de démonstration pour la visualisation sécurisée de documents PDF.

---

## Modules custom

### [`pdf_viewer`](./web/modules/custom/pdf_viewer)

Visionneuse PDF modale basique propulsée par PDF.js.  
Rendu sur `<canvas>`, navigation, zoom, rotation. Aucune dépendance Composer.

→ [Documentation complète](./web/modules/custom/pdf_viewer/README.md)

```php
return [
  '#theme'   => 'pdf_viewer',
  '#pdf_url' => '/sites/default/files/document.pdf',
];
```

---

### [`pdf_viewer_secure`](./web/modules/custom/pdf_viewer_secure)

Variante sécurisée — le chemin réel du fichier n'apparaît jamais dans le DOM ni dans le Network tab.

Proxy PHP avec token HMAC signé, généré au clic, scopé à l'utilisateur et au fichier.  
Requiert un fichier géré Drupal (`fid`) et un utilisateur connecté.

→ [Documentation complète](./web/modules/custom/pdf_viewer_secure/README.md)

```php
return [
  '#theme' => 'pdf_viewer_secure',
  '#fid'   => 42,
];
```

---

## Comparatif

| | `pdf_viewer` | `pdf_viewer_secure` |
|---|---|---|
| URL fichier dans le DOM | ✅ Oui | ❌ Non |
| URL dans le Network tab | ✅ Oui | ❌ Non |
| Cache navigateur | ✅ Oui | ❌ Non (`no-store`) |
| Requiert connexion | Non | ✅ Oui |
| Requiert `fid` Drupal | Non | ✅ Oui |

---

## Lancer en local

Prérequis : [DDEV](https://ddev.com) + Docker.

```bash
ddev start
ddev composer install
ddev drush site:install --account-name=admin --account-pass=admin -y
ddev drush en hello_world pdf_viewer pdf_viewer_secure -y
ddev drush cr
ddev launch /hello
```
