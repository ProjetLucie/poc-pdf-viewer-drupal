# poc-viewer-drupal

Modules Drupal custom pour la visualisation sécurisée de documents PDF.

---

## Modules

### [`pdf_viewer`](./pdf_viewer)

Visionneuse PDF modale basique propulsée par PDF.js.  
Rendu sur `<canvas>`, navigation, zoom, rotation. Aucune dépendance Composer.

→ [Documentation complète](./pdf_viewer/README.md)

**Usage rapide :**
```php
return [
  '#theme'   => 'pdf_viewer',
  '#pdf_url' => '/sites/default/files/document.pdf',
];
```

---

### [`pdf_viewer_secure`](./pdf_viewer_secure)

Variante sécurisée de `pdf_viewer` — le chemin réel du fichier n'apparaît jamais dans le DOM ni dans le Network tab.

Proxy PHP avec token HMAC signé, généré au clic, scopé à l'utilisateur.  
Requiert un fichier géré Drupal (`fid`).

→ [Documentation complète](./pdf_viewer_secure/README.md)

**Usage rapide :**
```php
return [
  '#theme' => 'pdf_viewer_secure',
  '#fid'   => 42,
];
```

---

## Module de démo

### [`hello_world`](./hello_world)

Page `/hello` qui illustre les deux modes de `pdf_viewer` et `pdf_viewer_secure` côte à côte.  
Non destiné à la production.

---

## Comparatif rapide

| | `pdf_viewer` | `pdf_viewer_secure` |
|---|---|---|
| URL fichier dans le DOM | ✅ Oui | ❌ Non |
| URL dans le Network tab | ✅ Oui | ❌ Non |
| Cache navigateur | ✅ Oui | ❌ Non (`no-store`) |
| Requiert connexion | Non | ✅ Oui |
| Requiert `fid` Drupal | Non | ✅ Oui |
