# PDF Viewer Secure — Module Drupal custom

Visionneuse PDF modale avec **protection contre le téléchargement**. Variante sécurisée de `pdf_viewer` : le chemin réel du fichier n'apparaît jamais dans le DOM, dans le Network tab, ni dans les logs navigateur.

---

## Sommaire

1. [Différences avec pdf_viewer](#différences-avec-pdf_viewer)
2. [Comprendre la sécurité des fichiers — version simple](#comprendre-la-sécurité-des-fichiers--version-simple)
3. [Architecture de sécurité](#architecture-de-sécurité)
4. [Ce qui est protégé / ce qui ne l'est pas](#ce-qui-est-protégé--ce-qui-ne-lest-pas)
5. [Prérequis](#prérequis)
6. [Installation](#installation)
7. [Mode 1 — Bouton + modal groupés](#mode-1--bouton--modal-groupés)
8. [Mode 2 — Modal seule + déclencheur externe](#mode-2--modal-seule--déclencheur-externe)
9. [Variables disponibles](#variables-disponibles)
10. [Structure du module](#structure-du-module)
11. [Flux technique détaillé](#flux-technique-détaillé)
12. [Personnalisation CSS](#personnalisation-css)
13. [Limites connues](#limites-connues)

---

## Comprendre la sécurité des fichiers — version simple

> Cette section explique sans jargon technique pourquoi ce module existe et ce qu'il protège vraiment.

### Le problème avec un PDF "normal" sur un site web

Quand un site affiche un PDF classiquement, il met quelque part dans la page une adresse qui pointe directement vers le fichier, par exemple :

```
https://mon-site.fr/sites/default/files/contrat-2024.pdf
```

N'importe qui qui trouve cette adresse — en inspectant le code de la page, en regardant les requêtes réseau dans les outils développeur, ou simplement parce qu'on la lui a partagée — peut **copier cette URL, l'ouvrir dans un onglet, et télécharger le fichier**.

Le fichier est sur le serveur comme un document dans un couloir ouvert : si tu connais le chemin, tu peux y aller.

### Ce que fait ce module

Ce module cache le chemin du fichier. Le navigateur ne reçoit jamais l'adresse réelle du PDF.

À la place, voici ce qui se passe quand un utilisateur clique sur "Voir le document" :

1. **Le site vérifie d'abord** : est-ce que cet utilisateur a le droit de voir ce fichier ? Si non, refus immédiat.
2. **Si oui**, le site génère un **laissez-passer temporaire** (un code unique, valable 1 heure, lié à cet utilisateur précis).
3. **Le navigateur utilise ce laissez-passer** pour récupérer le fichier — sans jamais connaître son emplacement réel.
4. **Le PDF s'affiche** directement dans la page, sans être téléchargé.

C'est comme un vestiaire : tu reçois un jeton numéroté, pas l'adresse de ta veste. Le personnel fait le lien en interne.

### Ce que ça protège

✅ **Quelqu'un qui inspecte la page** ne verra pas l'URL du fichier — il n'y en a pas.

✅ **Quelqu'un qui surveille le trafic réseau** ne verra qu'un code opaque, pas le nom ou le chemin du fichier.

✅ **Partager le lien ne fonctionne pas** — le laissez-passer est personnel et expire en 1 heure.

✅ **Un visiteur non connecté** ne peut rien voir — la vérification d'identité est obligatoire.

### Ce que ça ne protège pas

❌ **Une capture d'écran** reste toujours possible — si tu vois quelque chose sur ton écran, tu peux le photographier.

❌ **Un utilisateur qui a le droit de voir un fichier** peut, avec des efforts techniques, le télécharger quand même. Ce module ne remplace pas les règles d'accès Drupal.

### La règle fondamentale

> **Ce module cache la porte. Les règles d'accès Drupal décident qui a la clé.**
>
> Si un utilisateur n'a pas le droit de voir un fichier dans Drupal, ce module le bloquera. Si un utilisateur a ce droit, il pourra le voir — et potentiellement le récupérer avec suffisamment d'efforts. La bonne protection des fichiers sensibles passe d'abord par des **permissions Drupal correctement configurées** (fichiers privés, rôles, modules d'accès).

---

| | `pdf_viewer` | `pdf_viewer_secure` |
|---|---|---|
| Variable principale | `#pdf_url` (string) | `#fid` (int — ID fichier Drupal) |
| URL fichier dans le DOM | ✅ Oui (`data-pdf`) | ❌ Non |
| URL fichier dans Network tab | ✅ Oui (requête directe) | ❌ Non (proxy opaque) |
| Fichier mis en cache navigateur | ✅ Oui | ❌ Non (`Cache-Control: no-store`) |
| URL directe téléchargeable | ✅ Oui | ❌ Non (header custom requis) |
| Requiert un fichier géré Drupal | Non | ✅ Oui (entité `file`) |
| Requiert connexion utilisateur | Non | ✅ Oui |
| Coexistence sur la même page | ✅ Oui | ✅ Oui |

---

## Architecture de sécurité

### Flux complet

```
┌──────────────────────────────────────────────────────────────┐
│ Rendu PHP (page)                                             │
│   • Seul data-fid="{{ fid }}" est rendu dans le DOM          │
│   • Aucune URL, aucun path, aucun token                      │
└──────────────────────────────┬───────────────────────────────┘
                               │
                         Clic utilisateur
                               │
┌──────────────────────────────▼───────────────────────────────┐
│ JS — Étape 1 : GET /pdf-viewer/token/{fid}                   │
│   Header : X-PDF-Viewer: 1                                   │
│   → PHP vérifie : utilisateur connecté + accès au fichier    │
│   → PHP génère token HMAC signé (TTL 1h, scoped uid+fid)     │
│   ← Réponse JSON : { "token": "eyJ..." }                     │
└──────────────────────────────┬───────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────┐
│ JS — Étape 2 : GET /pdf-viewer/serve/{token}                 │
│   Header : X-PDF-Viewer: 1                                   │
│   → PHP vérifie : signature HMAC + uid + expiry + accès      │
│   ← Stream binaire PDF avec headers :                        │
│       Content-Disposition: inline                            │
│       Cache-Control: no-store, private                       │
│       Accept-Ranges: none                                    │
└──────────────────────────────┬───────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────┐
│ JS — Rendu                                                   │
│   pdfjsLib.getDocument({ data: arrayBuffer })                │
│   → Rendu sur <canvas> — aucun URL créé, aucun blob          │
└──────────────────────────────────────────────────────────────┘
```

### Token HMAC

Format : `{base64url(json_payload)}.{HMAC-SHA256_hex}`

Payload :
```json
{ "fid": 42, "uid": 1, "exp": 1746612345 }
```

Secret : clé privée Drupal (`private_key` service — propre à chaque installation).

Validations successives sur `/pdf-viewer/serve/{token}` :
1. Header `X-PDF-Viewer: 1` présent → sinon 403
2. Signature HMAC valide → sinon 403
3. Token non expiré (TTL 1h) → sinon 403
4. `uid` du token === utilisateur courant → sinon 403
5. Fichier existe en base → sinon 404
6. `$file->access('view')` → sinon 403

### Pourquoi le token est généré au clic (pas au render)

Le token est demandé par le JS au moment où l'utilisateur ouvre la modal (via `/pdf-viewer/token/{fid}`), pas au moment où PHP rend la page. Cela garantit que :

- Le token est **toujours frais**, peu importe la durée de mise en cache de la page Drupal.
- La page est **entièrement cacheable** (Dynamic Page Cache, CDN) : aucun token sensible dans le HTML.
- Un utilisateur qui garde la page ouverte plusieurs heures peut toujours ouvrir le viewer.

---

## Ce qui est protégé / ce qui ne l'est pas

| Vecteur | Statut | Détail |
|---|---|---|
| URL directe du fichier dans le DOM | ✅ Bloqué | Jamais rendue |
| URL dans le Network tab | ✅ Bloqué | Seul `/pdf-viewer/serve/{token}` visible |
| Navigation directe vers l'URL proxy | ✅ Bloqué | Header `X-PDF-Viewer: 1` requis |
| Cache navigateur du fichier | ✅ Bloqué | `Cache-Control: no-store` |
| `Accept-Ranges` / téléchargement partiel | ✅ Bloqué | `Accept-Ranges: none` |
| Indexation moteurs de recherche | ✅ Bloqué | `X-Robots-Tag: noindex` |
| Screenshot / enregistrement écran | ❌ Non bloquable | OS-level, hors portée |
| Impression (`Ctrl+P`) | ❌ Non bloquable | Navigateur natif |
| Extraction pixel par pixel via canvas | ❌ Friction seulement | `getImageData()` reste possible |
| `curl` avec header forgé + token valide | ⚠️ Niveau élevé | Nécessite session authentifiée |

---

## Prérequis

- Drupal 10 ou 11
- Module `file` core activé
- Utilisateur **connecté** (route protégée par `_user_is_logged_in: TRUE`)
- Les PDFs doivent être des **entités fichier gérées** par Drupal (table `file_managed`)

### Enregistrer un fichier existant comme entité gérée

Si le PDF est déjà dans `sites/default/files/` mais pas en base :

```bash
drush php:script register_pdf.php
```

Contenu de `register_pdf.php` :
```php
<?php
$uri = 'public://mon-document.pdf';
$file = \Drupal\file\Entity\File::create(['uri' => $uri, 'status' => 1]);
$file->save();
echo 'fid=' . $file->id() . PHP_EOL;
```

---

## Installation

```bash
# Copier dans le projet
cp -r pdf_viewer_secure /votre-projet/web/modules/custom/

# Activer
drush en pdf_viewer_secure
drush cr
```

Aucune dépendance Composer, aucun npm. `pdf_viewer` n'est **pas** requis.

---

## Mode 1 — Bouton + modal groupés

Le theme hook `pdf_viewer_secure` rend un bouton déclencheur et sa modal en une fois.

```php
return [
  '#theme'        => 'pdf_viewer_secure',
  '#fid'          => 42,
  '#button_label' => '📄 Voir le contrat',
  '#viewer_id'    => 'contrat-viewer',  // optionnel
];
```

### Exemple dans un Controller

```php
public function view(): array {
  $files = \Drupal::entityTypeManager()
    ->getStorage('file')
    ->loadByProperties(['uri' => 'public://contrat.pdf']);
  $fid = $files ? reset($files)->id() : NULL;

  return [
    '#theme'        => 'pdf_viewer_secure',
    '#fid'          => $fid,
    '#button_label' => 'Consulter le contrat',
  ];
}
```

---

## Mode 2 — Modal seule + déclencheur externe

La modal est déclarée une fois. N'importe quel élément peut l'ouvrir via l'attribut `data-open-pdf-viewer-secure`.

**Différence clé vs `pdf_viewer`** : le déclencheur n'a **pas** de `data-pdf` — le path du fichier n'est nulle part dans le HTML.

### Étape 1 — Déclarer la modal

```php
$build['modal'] = [
  '#theme'     => 'pdf_viewer_secure_modal',
  '#fid'       => 42,
  '#viewer_id' => 'contrat-viewer',
];
```

### Étape 2 — Déclencheur (un seul attribut)

```html
<a href="#" data-open-pdf-viewer-secure="contrat-viewer">
  Voir le contrat
</a>

<button type="button" data-open-pdf-viewer-secure="contrat-viewer">
  Ouvrir le document
</button>
```

> La même modal peut être ouverte par plusieurs déclencheurs différents.
> Le fichier est fixé par le `#fid` de la modal — un viewer = un fichier.

---

## Variables disponibles

### `pdf_viewer_secure` (Mode 1)

| Variable | Type | Obligatoire | Défaut | Description |
|---|---|---|---|---|
| `#fid` | `int` | ✅ Oui | `NULL` | ID de l'entité fichier Drupal. |
| `#button_label` | `string` | Non | `📄 Voir le document` | Texte du bouton déclencheur. |
| `#viewer_id` | `string` | Non | Auto-généré | ID unique de l'instance. |

### `pdf_viewer_secure_modal` (Mode 2)

| Variable | Type | Obligatoire | Défaut | Description |
|---|---|---|---|---|
| `#fid` | `int` | ✅ Oui | `NULL` | ID de l'entité fichier Drupal. |
| `#viewer_id` | `string` | Non | Auto-généré | Doit correspondre à `data-open-pdf-viewer-secure` sur les déclencheurs. |

---

## Structure du module

```
pdf_viewer_secure/
├── pdf_viewer_secure.info.yml        # Déclaration du module
├── pdf_viewer_secure.libraries.yml   # Librairie JS/CSS
├── pdf_viewer_secure.module          # hook_theme() + hook_preprocess_*()
├── pdf_viewer_secure.routing.yml     # Routes proxy et token
├── pdf_viewer_secure.services.yml    # Service PdfTokenService
├── src/
│   ├── Controller/
│   │   └── PdfProxyController.php    # Endpoints /token/{fid} et /serve/{token}
│   └── Service/
│       └── PdfTokenService.php       # Génération et validation HMAC
├── templates/
│   ├── pdf-viewer-secure.html.twig        # Mode 1 : bouton + modal
│   └── pdf-viewer-secure-modal.html.twig  # Mode 2 : modal seule
├── js/
│   └── pdf-viewer-secure.js          # Behavior Drupal
└── css/
    └── pdf-viewer-secure.css         # Styles (préfixe pvs-)
```

---

## Flux technique détaillé

### Rendu PHP

Le preprocess assigne un `viewer_id` unique si non fourni. Le template rend :
- Un bouton portant `data-viewer-id` (Mode 1)
- Une overlay `.pvs-modal-overlay` portant `data-viewer-id` et `data-fid`

Aucun token, aucune URL de fichier dans le HTML généré → page entièrement cacheable.

### JS — `Drupal.behaviors.pdfViewerSecure.attach()`

1. **Hoist** : déplace `.pvs-modal-overlay` vers `<body>` (résout les problèmes de stacking context avec la toolbar Drupal).
2. Attache les écouteurs de clic sur `.open-viewer-secure` (Mode 1) et `[data-open-pdf-viewer-secure]` (Mode 2).
3. Attache les contrôles internes (fermer, navigation, zoom, rotation) via `once()`.

### JS — `openModal(viewerId)`

1. Localise l'overlay par `data-viewer-id`.
2. Lit `data-fid` depuis l'overlay.
3. Remet à zéro l'état (page 1, scale 1.5, rotation 0).
4. Affiche l'overlay, appelle `loadPdf(fid)`.

### JS — `loadPdf(fid)` — deux requêtes fetch

```
GET /pdf-viewer/token/{fid}
  Headers: X-PDF-Viewer: 1, credentials: same-origin
  ← { "token": "eyJ..." }

GET /pdf-viewer/serve/{token}
  Headers: X-PDF-Viewer: 1, cache: no-store
  ← stream binaire PDF

pdfjsLib.getDocument({ data: arrayBuffer })
  → renderPage(1)
```

Le PDF est passé comme `ArrayBuffer` directement à PDF.js — aucun Blob URL créé, rien dans le Network tab après la réponse.

### Routes PHP

| Route | Handler | Accès |
|---|---|---|
| `GET /pdf-viewer/token/{fid}` | `PdfProxyController::token()` | Connecté + `X-PDF-Viewer: 1` |
| `GET /pdf-viewer/serve/{token}` | `PdfProxyController::serve()` | Connecté + `X-PDF-Viewer: 1` + token valide |

---

## Personnalisation CSS

Tous les sélecteurs sont préfixés `pvs-` pour éviter les collisions si `pdf_viewer` et `pdf_viewer_secure` sont actifs simultanément.

```css
/* Bouton déclencheur */
.open-viewer-secure {
  background: #2e7d32;
}

/* Overlay */
.pvs-modal-overlay { ... }

/* Modal */
.pvs-modal {
  max-width: 1400px;
  max-height: 98vh;
}

/* Cibler une instance spécifique */
.pvs-modal-overlay[data-viewer-id="contrat-viewer"] .pvs-modal {
  border-top: 4px solid #b71c1c;
}
```

---

## Limites connues

- **Utilisateur connecté obligatoire.** Les utilisateurs anonymes reçoivent un 403. Pour les visiteurs non connectés, utiliser `pdf_viewer` (sans protection) ou implémenter un système de tokens anonymes.
- **Un seul viewer ouvert à la fois.** L'état JS est un singleton. Prévu par design.
- **Screenshot / impression non bloquables.** Si l'utilisateur peut voir le document, il peut le capturer par ces moyens.
- **`curl` avec header forgé.** Un utilisateur connecté qui forge `X-PDF-Viewer: 1` et utilise un token valide peut télécharger via curl. Le token expirant en 1h et étant scopé à son UID, la surface d'attaque reste limitée.
- **Pas de support des formulaires PDF interactifs.** PDF.js canvas ne rend que le visuel.
