# PDF Viewer — Module Drupal custom

Visionneuse PDF modale intégrée à Drupal, propulsée par **PDF.js**. Aucun iframe, aucun téléchargement forcé : le document est rendu directement dans la page sur un `<canvas>` HTML5.

---

## Sommaire

1. [Fonctionnalités](#fonctionnalités)
2. [Structure du module](#structure-du-module)
3. [Installation](#installation)
4. [Mode 1 — Bouton + modal groupés](#mode-1--bouton--modal-groupés)
5. [Mode 2 — Modal seule + déclencheur externe](#mode-2--modal-seule--déclencheur-externe)
6. [Instances multiples](#instances-multiples)
7. [Variables disponibles](#variables-disponibles)
8. [Fonctionnement technique](#fonctionnement-technique)
9. [Personnalisation CSS](#personnalisation-css)
10. [Personnalisation JS](#personnalisation-js)
11. [Utiliser un PDF.js en local (sans CDN)](#utiliser-un-pdfjs-en-local-sans-cdn)
12. [Compatibilité](#compatibilité)
13. [Limites connues](#limites-connues)

---

## Fonctionnalités

- ✅ Rendu PDF natif via `<canvas>` (PDF.js) — pas d'iframe, pas de plugin
- ✅ Modal plein écran au-dessus de tout (z-index `999999`, hoisting vers `<body>`)
- ✅ Navigation page par page (précédent / suivant) avec indicateur `1 / N`
- ✅ Zoom libre (de ×0.5 à ×5.0, par pas de ×0.25) — scroll si débordement
- ✅ Rotation à 90° horaire et anti-horaire
- ✅ Fermeture par le bouton, clic sur l'overlay ou touche `Escape`
- ✅ **Mode 1** — bouton + modal bundlés (simple, tout-en-un)
- ✅ **Mode 2** — modal seule, déclencheur libre sur n'importe quel élément HTML
- ✅ **Multi-instances** : autant de viewers que souhaité sur la même page, totalement isolés
- ✅ Compatible Drupal behaviors (AJAX-safe, pas de duplication d'écouteurs via `once()`)
- ✅ Aucune dépendance framework (vanilla JS)
- ✅ Portable : se copie tel quel dans n'importe quel projet Drupal 10/11

---

## Structure du module

```
pdf_viewer/
├── pdf_viewer.info.yml              # Déclaration du module Drupal
├── pdf_viewer.libraries.yml         # Définition de la librairie Drupal
├── pdf_viewer.module                # hook_theme() + hook_preprocess_*()
├── css/
│   └── pdf-viewer.css               # Styles de la modal, des boutons, du canvas
├── js/
│   └── pdf-viewer.js                # Comportement Drupal (Drupal.behaviors.pdfViewer)
└── templates/
    ├── pdf-viewer.html.twig          # Mode 1 : bouton + modal groupés
    └── pdf-viewer-modal.html.twig    # Mode 2 : modal seule (déclencheur externe)
```

---

## Installation

### 1. Copier le module

```bash
cp -r pdf_viewer /votre-projet/web/modules/custom/
```

### 2. Activer le module

```bash
drush en pdf_viewer
drush cr
```

C'est tout. Aucune dépendance Composer, aucun npm.

---

## Mode 1 — Bouton + modal groupés

Le theme hook `pdf_viewer` rend en une seule fois un bouton déclencheur **et** sa modal. Idéal quand le CTA est dédié au PDF et que vous n'avez pas d'élément existant à réutiliser.

```php
return [
  '#theme'        => 'pdf_viewer',
  '#pdf_url'      => '/sites/default/files/mon-document.pdf',
  '#button_label' => '📄 Voir le document',  // optionnel
];
```

### Exemple dans un Controller

```php
public function view(): array {
  return [
    '#theme'        => 'pdf_viewer',
    '#pdf_url'      => '/sites/default/files/contrat.pdf',
    '#button_label' => 'Consulter le contrat',
  ];
}
```

### Exemple dans un Block

```php
public function build(): array {
  return [
    '#theme'   => 'pdf_viewer',
    '#pdf_url' => '/sites/default/files/notice.pdf',
  ];
}
```

---

## Mode 2 — Modal seule + déclencheur externe

Le theme hook `pdf_viewer_modal` rend **uniquement la modal**, sans aucun bouton. Vous déclarez la modal une fois dans votre layout, puis vous attachez le déclenchement à **n'importe quel élément HTML** existant ou futur : un lien, une card cliquable, une image, un bouton venant d'un autre composant, etc.

### Étape 1 — Déclarer la modal

```php
$build['ma_modal'] = [
  '#theme'     => 'pdf_viewer_modal',
  '#viewer_id' => 'contrat-viewer',  // optionnel, auto-généré sinon
];
```

### Étape 2 — Déclencher depuis n'importe quel élément

Ajoutez deux attributs `data-` sur l'élément déclencheur :

| Attribut               | Valeur                   | Rôle                                |
| ---------------------- | ------------------------ | ----------------------------------- |
| `data-open-pdf-viewer` | `"contrat-viewer"`       | Cible la modal à ouvrir             |
| `data-pdf`             | `"/chemin/vers/doc.pdf"` | Document à charger dans cette modal |

```html
<!-- Un lien texte -->
<a
  href="#"
  data-open-pdf-viewer="contrat-viewer"
  data-pdf="/sites/default/files/contrat.pdf"
>
  Voir le contrat
</a>

<!-- Un bouton existant -->
<button
  type="button"
  data-open-pdf-viewer="contrat-viewer"
  data-pdf="/sites/default/files/contrat.pdf"
>
  Ouvrir le PDF
</button>

<!-- Une card cliquable -->
<div
  class="card"
  data-open-pdf-viewer="contrat-viewer"
  data-pdf="/sites/default/files/contrat.pdf"
  style="cursor:pointer"
>
  📄 Contrat 2024
</div>

<!-- Une image -->
<img
  src="/thumbs/contrat.png"
  alt="Aperçu du contrat"
  data-open-pdf-viewer="contrat-viewer"
  data-pdf="/sites/default/files/contrat.pdf"
  style="cursor:pointer"
/>
```

> **Important :** la bibliothèque JS/CSS est chargée par le template `pdf_viewer_modal`. Tant que la modal est rendue quelque part dans la page, tous les déclencheurs fonctionnent, peu importe où ils se trouvent dans le DOM.

### Un viewer, plusieurs déclencheurs, PDFs différents

La même modal peut être ouverte avec des PDFs différents depuis des déclencheurs différents. Le `data-pdf` est lu à chaque clic, pas à l'initialisation :

```php
// Une seule modal déclarée
$build['viewer'] = ['#theme' => 'pdf_viewer_modal', '#viewer_id' => 'doc-viewer'];

// Plusieurs déclencheurs, chacun avec son propre PDF
$build['liens'] = [
  '#markup' => '
    <a href="#" data-open-pdf-viewer="doc-viewer" data-pdf="/files/rapport-q1.pdf">Rapport Q1</a>
    <a href="#" data-open-pdf-viewer="doc-viewer" data-pdf="/files/rapport-q2.pdf">Rapport Q2</a>
    <a href="#" data-open-pdf-viewer="doc-viewer" data-pdf="/files/bilan.pdf">Bilan annuel</a>
  ',
];
```

### Exemple dans un template Twig existant

```twig
{# La modal est déclarée dans le layout #}
{{ content.ma_modal }}

{# N'importe où dans ce même template : #}
<a href="#"
   data-open-pdf-viewer="{{ viewer_id }}"
   data-pdf="{{ file.url }}">
  📄 {{ file.name }}
</a>
```

---

## Instances multiples

Plusieurs viewers (modaux) peuvent coexister sur la même page. Chaque instance a son `viewer_id` unique.

### Mode 1 (plusieurs bundlés)

```php
return [
  'contrat' => [
    '#theme'        => 'pdf_viewer',
    '#pdf_url'      => '/sites/default/files/contrat.pdf',
    '#button_label' => '📄 Contrat',
  ],
  'annexe' => [
    '#theme'        => 'pdf_viewer',
    '#pdf_url'      => '/sites/default/files/annexe.pdf',
    '#button_label' => '📄 Annexe',
  ],
];
```

### Mode 2 (plusieurs modals séparées)

```php
$build['modal_a'] = ['#theme' => 'pdf_viewer_modal', '#viewer_id' => 'modal-a'];
$build['modal_b'] = ['#theme' => 'pdf_viewer_modal', '#viewer_id' => 'modal-b'];
// Puis des déclencheurs avec data-open-pdf-viewer="modal-a" ou "modal-b"
```

---

## Variables disponibles

### `pdf_viewer` (Mode 1)

| Variable        | Type     | Obligatoire | Défaut                | Description                  |
| --------------- | -------- | ----------- | --------------------- | ---------------------------- |
| `#pdf_url`      | `string` | ✅ Oui      | `NULL`                | URL du PDF à afficher.       |
| `#button_label` | `string` | Non         | `📄 Voir le document` | Texte du bouton déclencheur. |
| `#viewer_id`    | `string` | Non         | Auto-généré           | ID unique de l'instance.     |

### `pdf_viewer_modal` (Mode 2)

| Variable     | Type     | Obligatoire | Défaut      | Description                                                                                            |
| ------------ | -------- | ----------- | ----------- | ------------------------------------------------------------------------------------------------------ |
| `#viewer_id` | `string` | Non         | Auto-généré | ID unique de l'instance. Doit correspondre à la valeur de `data-open-pdf-viewer` sur les déclencheurs. |

---

## Fonctionnement technique

### Cycle de vie d'une instance

```
[Rendu Twig]
  └─ Un viewer_id unique est assigné à l'overlay et au canvas (data-viewer-id)
     Les déclencheurs portent ce même ID dans data-open-pdf-viewer

[Drupal.behaviors.pdfViewer.attach()]
  ├─ (1) Hoist : déplace .pdf-modal-overlay vers <body>
  ├─ (2a) Mode 1 : écoute .open-viewer[data-viewer-id]
  ├─ (2b) Mode 2 : écoute [data-open-pdf-viewer] (n'importe quel élément)
  └─ (3) Attache (une seule fois via once()) les boutons de contrôle

[openModal(url, viewerId)]
  ├─ Localise l'overlay via [data-viewer-id="${viewerId}"]
  ├─ Stocke les références DOM dans state.els
  ├─ Remet à zéro : page=1, scale=1.5, rotation=0
  └─ Lance loadPdf(url)
```

### Gestion du z-index et du stacking context

La modal est systématiquement **déplacée comme enfant direct de `<body>`** au premier `attach`. Cela résout le problème classique où `position: fixed` reste bloqué sous un parent qui a `transform`, `filter`, `will-change` ou `isolation: isolate` (toolbar Drupal, certains thèmes).

Z-index utilisé : `999999`.

### Sécurité AJAX (Drupal behaviors)

Tous les écouteurs sont enregistrés via `once(token, selector, scope)`. Drupal peut appeler `attach` plusieurs fois (AJAX, Big Pipe) — `once()` garantit l'absence de duplication.

---

## Personnalisation CSS

### Changer le style du bouton déclencheur (Mode 1)

```css
.open-viewer {
  background: #2e7d32;
  border-radius: 20px;
}
```

### Changer l'overlay

```css
.pdf-modal-overlay {
  background: rgba(10, 10, 40, 0.9);
}
```

### Changer les dimensions de la modal

```css
.pdf-modal {
  width: 98vw;
  max-width: 1400px;
  max-height: 98vh;
}
```

### Cibler une instance spécifique

```css
.pdf-modal-overlay[data-viewer-id="contrat-viewer"] .pdf-modal {
  border: 3px solid #b71c1c;
}
```

---

## Personnalisation JS

### Modifier les limites de zoom

```js
const SCALE_MIN = 0.5; // 50 %
const SCALE_MAX = 5.0; // 500 %
const SCALE_STEP = 0.25;
```

### Modifier le zoom et la rotation initiaux

```js
// Dans openModal()
state.scale = 1.5; // zoom à l'ouverture
state.rotation = 0; // rotation à l'ouverture (0, 90, 180, 270)
```

### Brancher une logique externe sur le Mode 2

```js
Drupal.behaviors.monExtension = {
  attach(context) {
    once("mon-ext", "[data-open-pdf-viewer]", context).forEach((trigger) => {
      trigger.addEventListener("click", () => {
        console.log("PDF ouvert :", trigger.dataset.pdf);
        // Analytics, logs, etc.
      });
    });
  },
};
```

---

## Utiliser un PDF.js en local (sans CDN)

### 1. Copier les fichiers

```
pdf_viewer/js/pdfjs/pdf.min.js
pdf_viewer/js/pdfjs/pdf.worker.min.js
```

### 2. Mettre à jour `pdf_viewer.libraries.yml`

```yaml
pdf_viewer:
  js:
    js/pdfjs/pdf.min.js:
      minified: true
    js/pdf-viewer.js: {}
  css:
    theme:
      css/pdf-viewer.css: {}
  dependencies:
    - core/drupal
    - core/once
```

### 3. Mettre à jour la constante dans `pdf-viewer.js`

```js
const PDFJS_WORKER_SRC =
  "/modules/custom/pdf_viewer/js/pdfjs/pdf.worker.min.js";
```

### 4. Vider le cache

```bash
drush cr
```

---

## Compatibilité

| Environnement                    | Statut                           |
| -------------------------------- | -------------------------------- |
| Drupal 10.x                      | ✅ Supporté                      |
| Drupal 11.x                      | ✅ Supporté                      |
| PHP 8.1+                         | ✅ Requis par Drupal 10/11       |
| PDF.js 3.11.174                  | ✅ Version utilisée              |
| Chrome / Edge / Firefox / Safari | ✅ Tous les navigateurs modernes |
| IE 11                            | ❌ Non supporté (ES2020+)        |

---

## Limites connues

- **Un seul viewer ouvert à la fois.** L'état JS est un singleton. Prévu par design.
- **Pas de support des formulaires PDF interactifs.** PDF.js canvas ne rend que le visuel.
- **CORS.** Si le PDF est sur un autre domaine, le serveur doit renvoyer `Access-Control-Allow-Origin`.
- **Très grands PDF.** Fonctionne, mais la navigation peut être lente sur des machines modestes.

Visionneuse PDF modale intégrée à Drupal, propulsée par **PDF.js**. Aucun iframe, aucun téléchargement forcé : le document est rendu directement dans la page sur un `<canvas>` HTML5.

---

## Sommaire

1. [Fonctionnalités](#fonctionnalités)
2. [Structure du module](#structure-du-module)
3. [Installation](#installation)
4. [Utilisation de base](#utilisation-de-base)
5. [Instances multiples](#instances-multiples)
6. [Variables disponibles](#variables-disponibles)
7. [Fonctionnement technique](#fonctionnement-technique)
8. [Personnalisation CSS](#personnalisation-css)
9. [Personnalisation JS](#personnalisation-js)
10. [Utiliser un PDF.js en local (sans CDN)](#utiliser-un-pdfjs-en-local-sans-cdn)
11. [Compatibilité](#compatibilité)
12. [Limites connues](#limites-connues)

---

## Fonctionnalités

- ✅ Rendu PDF natif via `<canvas>` (PDF.js) — pas d'iframe, pas de plugin
- ✅ Modal plein écran au-dessus de tout (z-index `999999`, hoisting vers `<body>`)
- ✅ Navigation page par page (précédent / suivant) avec indicateur `1 / N`
- ✅ Zoom libre (de ×0.5 à ×5.0, par pas de ×0.25) — scroll si débordement
- ✅ Rotation à 90° horaire et anti-horaire
- ✅ Fermeture par le bouton, clic sur l'overlay ou touche `Escape`
- ✅ **Multi-instances** : autant de viewers que souhaité sur la même page, totalement isolés
- ✅ Compatible Drupal behaviors (AJAX-safe, pas de duplication d'écouteurs via `once()`)
- ✅ Aucune dépendance framework (vanilla JS)
- ✅ Portable : se copie tel quel dans n'importe quel projet Drupal 10/11

---

## Structure du module

```
pdf_viewer/
├── pdf_viewer.info.yml         # Déclaration du module Drupal
├── pdf_viewer.libraries.yml    # Définition de la librairie Drupal
├── pdf_viewer.module           # hook_theme() + hook_preprocess_pdf_viewer()
├── css/
│   └── pdf-viewer.css          # Styles de la modal, des boutons, du canvas
├── js/
│   └── pdf-viewer.js           # Comportement Drupal (Drupal.behaviors.pdfViewer)
└── templates/
    └── pdf-viewer.html.twig    # Template : bouton déclencheur + structure HTML de la modal
```

---

## Installation

### 1. Copier le module

```bash
cp -r pdf_viewer /votre-projet/web/modules/custom/
```

### 2. Activer le module

```bash
drush en pdf_viewer
drush cr
```

C'est tout. Aucune dépendance Composer, aucun npm.

---

## Utilisation de base

Dans n'importe quel **Controller**, **Block**, `hook_preprocess`, ou retour de `hook_page_build`, retournez un render array avec le theme hook `pdf_viewer` :

```php
return [
  '#theme'   => 'pdf_viewer',
  '#pdf_url' => '/sites/default/files/mon-document.pdf',
];
```

Drupal se charge d'attacher la librairie, de rendre le bouton et la modal.

### Exemple dans un Controller

```php
<?php

namespace Drupal\mon_module\Controller;

use Drupal\Core\Controller\ControllerBase;

class DocumentController extends ControllerBase {

  public function view(): array {
    return [
      '#theme'        => 'pdf_viewer',
      '#pdf_url'      => '/sites/default/files/contrat.pdf',
      '#button_label' => 'Consulter le contrat',
    ];
  }

}
```

### Exemple dans un Block

```php
public function build(): array {
  return [
    '#theme'   => 'pdf_viewer',
    '#pdf_url' => '/sites/default/files/notice.pdf',
  ];
}
```

### Exemple dans un template Twig existant

```twig
{{ attach_library('pdf_viewer/pdf_viewer') }}

{# Approche manuelle si vous gérez le HTML vous-même #}
<button class="open-viewer" data-pdf="/sites/default/files/guide.pdf" data-viewer-id="viewer-guide" type="button">
  📄 Voir le guide
</button>
```

> ⚠️ Si vous utilisez l'approche manuelle en Twig, vous devez également inclure manuellement la structure HTML complète de la modal avec le même `data-viewer-id`. Préférez le render array `#theme => 'pdf_viewer'` qui génère tout automatiquement.

---

## Instances multiples

Plusieurs viewers peuvent coexister sur la même page sans conflit. Retournez simplement plusieurs render arrays avec des clés distinctes :

```php
return [
  'contrat' => [
    '#theme'        => 'pdf_viewer',
    '#pdf_url'      => '/sites/default/files/contrat.pdf',
    '#button_label' => '📄 Contrat',
  ],
  'annexe' => [
    '#theme'        => 'pdf_viewer',
    '#pdf_url'      => '/sites/default/files/annexe.pdf',
    '#button_label' => '📄 Annexe',
  ],
  'facture' => [
    '#theme'        => 'pdf_viewer',
    '#pdf_url'      => '/sites/default/files/facture.pdf',
    '#button_label' => '📄 Facture',
    '#viewer_id'    => 'facture-2024',  // ID explicite optionnel
  ],
];
```

Chaque instance reçoit un `viewer_id` unique (généré automatiquement via `hook_preprocess_pdf_viewer` si non fourni). Cet identifiant scope tous les sélecteurs DOM pour éviter toute collision.

---

## Variables disponibles

| Variable        | Type     | Obligatoire | Défaut                | Description                                                                                                                  |
| --------------- | -------- | ----------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `#pdf_url`      | `string` | ✅ Oui      | `NULL`                | URL du fichier PDF à afficher. Peut être relative (`/sites/default/files/doc.pdf`) ou absolue.                               |
| `#button_label` | `string` | Non         | `📄 Voir le document` | Texte (ou HTML) affiché sur le bouton déclencheur.                                                                           |
| `#viewer_id`    | `string` | Non         | Auto-généré           | Identifiant unique de l'instance. Utile si vous avez besoin de cibler l'instance en CSS/JS. Format recommandé : `[a-z0-9-]`. |

---

## Fonctionnement technique

### Cycle de vie d'une instance

```
[Rendu Twig]
  └─ Génère un data-viewer-id unique sur le bouton, l'overlay et le canvas

[Drupal.behaviors.pdfViewer.attach()]
  ├─ (1) Hoist : déplace .pdf-modal-overlay vers <body>
  │         → empêche tout stacking context parent de capper le z-index
  ├─ (2) Écoute le clic sur .open-viewer
  │         → lit data-pdf et data-viewer-id
  │         → appelle openModal(url, viewerId)
  └─ (3) Attache (une seule fois via once()) les boutons de contrôle

[openModal(url, viewerId)]
  ├─ Localise l'overlay via [data-viewer-id="${viewerId}"]
  ├─ Stocke les références DOM dans state.els
  ├─ Remet à zéro : page=1, scale=1.5, rotation=0
  └─ Lance loadPdf(url)

[loadPdf(url)]
  └─ pdfjsLib.getDocument(url).promise
       └─ renderPage(1)

[renderPage(n)]
  ├─ page.getViewport({ scale, rotation })
  ├─ Redimensionne le <canvas> selon le viewport
  └─ page.render({ canvasContext, viewport })
```

### Gestion du z-index et du stacking context

La modal est systématiquement **déplacée comme enfant direct de `<body>`** au premier `attach`. Cela résout le problème classique où `position: fixed` avec un z-index élevé reste bloqué sous un parent qui a `transform`, `filter`, `will-change` ou `isolation: isolate` (c'est notamment le cas de la toolbar Drupal et de certains thèmes).

Z-index utilisé : `999999` — au-dessus de la toolbar admin Drupal (`~600`), de l'admin overlay (`~1000`) et de la plupart des librairies tierces.

### Sécurité AJAX (Drupal behaviors)

Tous les écouteurs d'événements sont enregistrés via `once(token, selector, scope)`. Drupal peut appeler `attach` plusieurs fois (chargement AJAX, Big Pipe, etc.) — `once()` garantit qu'aucun écouteur n'est dupliqué.

Les boutons internes à la modal (fermer, nav, zoom, rotation) utilisent `document` comme scope car la modal a été hoistée hors du contexte d'injection AJAX.

---

## Personnalisation CSS

Toutes les classes sont préfixées `pdf-` et non-conflictuelles. Les surcharges se font dans le CSS de votre thème.

### Changer le style du bouton déclencheur

```css
/* Dans votre thème */
.open-viewer {
  background: #2e7d32;
  border-radius: 20px;
  font-size: 16px;
}
```

### Changer la couleur de l'overlay

```css
.pdf-modal-overlay {
  background: rgba(10, 10, 40, 0.9);
}
```

### Changer les dimensions de la modal

```css
.pdf-modal {
  width: 98vw;
  max-width: 1400px;
  max-height: 98vh;
}
```

### Changer le fond du canvas (zone de lecture)

```css
.pdf-modal-body {
  background: #404040;
  padding: 30px;
}
```

### Cibler une instance spécifique

Si vous avez passé un `#viewer_id` ou si vous connaissez l'ID généré, vous pouvez cibler précisément une instance :

```css
/* Bouton déclencheur de cette instance */
.open-viewer[data-viewer-id="facture-2024"] {
  background: #b71c1c;
}

/* Modal de cette instance uniquement */
.pdf-modal-overlay[data-viewer-id="facture-2024"] .pdf-modal {
  border: 3px solid #b71c1c;
}
```

---

## Personnalisation JS

### Modifier les limites de zoom

Dans `js/pdf-viewer.js`, en haut du fichier :

```js
const SCALE_MIN = 0.5; // zoom minimum (×0.5 = 50 %)
const SCALE_MAX = 5.0; // zoom maximum (×5.0 = 500 %)
const SCALE_STEP = 0.25; // incrément par clic
```

### Modifier le zoom initial à l'ouverture

Dans la fonction `openModal()` :

```js
state.scale = 1.5; // ← changez cette valeur (ex: 1.0 pour 100 %)
```

### Modifier la rotation initiale à l'ouverture

```js
state.rotation = 0; // ← 0, 90, 180 ou 270
```

### Réagir aux événements du viewer depuis l'extérieur

Le viewer dispatch des événements natifs sur le canvas si vous souhaitez brancher une logique externe. Exemple d'extension :

```js
// Dans votre propre module/thème, APRÈS le chargement du pdf_viewer
Drupal.behaviors.monExtension = {
  attach(context) {
    once("mon-extension", ".open-viewer", context).forEach((btn) => {
      btn.addEventListener("click", () => {
        console.log("PDF ouvert :", btn.dataset.pdf);
        // Envoi analytics, logs, etc.
      });
    });
  },
};
```

---

## Utiliser un PDF.js en local (sans CDN)

Utile pour les environnements **air-gapped** ou pour contrôler la version de PDF.js.

### 1. Télécharger PDF.js

```bash
# Via npm (dans un dossier temporaire)
npm pack pdfjs-dist@3.11.174
# ou télécharger directement depuis https://github.com/mozilla/pdf.js/releases
```

Copier `pdf.min.js` et `pdf.worker.min.js` dans :

```
pdf_viewer/
└── js/
    ├── pdf-viewer.js
    ├── pdfjs/
    │   ├── pdf.min.js
    │   └── pdf.worker.min.js
```

### 2. Mettre à jour `pdf_viewer.libraries.yml`

```yaml
# Remplacer l'entrée CDN par :
pdf_viewer:
  js:
    js/pdfjs/pdf.min.js:
      minified: true
    js/pdf-viewer.js: {}
  css:
    theme:
      css/pdf-viewer.css: {}
  dependencies:
    - core/drupal
    - core/once
```

### 3. Mettre à jour la constante dans `pdf-viewer.js`

```js
// Chemin relatif à la racine Drupal
const PDFJS_WORKER_SRC =
  "/modules/custom/pdf_viewer/js/pdfjs/pdf.worker.min.js";
```

### 4. Vider le cache

```bash
drush cr
```

---

## Compatibilité

| Environnement                    | Statut                            |
| -------------------------------- | --------------------------------- |
| Drupal 10.x                      | ✅ Supporté                       |
| Drupal 11.x                      | ✅ Supporté                       |
| PHP 8.1+                         | ✅ Requis par Drupal 10/11        |
| PDF.js 3.11.174                  | ✅ Version utilisée               |
| Chrome / Edge / Firefox / Safari | ✅ Tous les navigateurs modernes  |
| IE 11                            | ❌ Non supporté (ES2020+ utilisé) |

---

## Limites connues

- **Un seul viewer ouvert à la fois.** L'état JS est un singleton. Ouvrir un second viewer alors qu'un premier est déjà ouvert est bloqué (prévu par design).
- **Pas de support des formulaires PDF interactifs.** PDF.js en mode canvas ne rend que le contenu visuel, pas les champs de formulaire cliquables.
- **Performances sur les très grands PDF.** Chaque page est rendue à la demande. Les PDF de plus de 500 pages fonctionnent, mais la navigation peut être légèrement lente sur des machines modestes.
- **CORS.** Si le PDF est hébergé sur un domaine différent, le serveur distant doit renvoyer les headers `Access-Control-Allow-Origin` appropriés.
