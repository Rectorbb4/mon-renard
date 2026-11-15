# Mon renard

Compagnon d'humeur du quotidien : un renard 3D qui vit avec toi et reflète ton humeur.
Application web installable (PWA), qui marche hors ligne. **Toutes les données restent sur l'appareil**, sans compte ni serveur.

Ce n'est pas un outil médical. En cas de besoin : **3114** (prévention du suicide, gratuit, 24 h/24) ou **15** (urgence).

## Lancer l'appli sur l'ordinateur

Il faut [Node.js](https://nodejs.org) 22 ou plus récent.

```bash
npm install
npm run dev
```

Puis ouvrir http://localhost:5173.

## Vérifier

```bash
npm run check   # types TypeScript et Svelte
npm test        # tests automatiques
npm run build   # version de production dans dist/
npm run preview # sert dist/ sur http://localhost:4173/mon-renard/
```

## Mise en ligne

Chaque envoi sur la branche `main` construit l'appli et la publie sur GitHub Pages
(voir `.github/workflows/deploy.yml`). Dans les réglages du dépôt, *Settings → Pages → Source* doit être sur **GitHub Actions**.

L'adresse est `https://<compte>.github.io/<dépôt>/`. Le chemin est pris automatiquement depuis le nom du dépôt.

## Installer sur un téléphone Android

1. Ouvrir l'adresse de l'appli dans Chrome.
2. Toucher **Installer sur l'écran d'accueil** dans l'appli, ou passer par le menu ⋮ de Chrome → *Installer l'application*.
3. L'icône du renard apparaît sur l'écran d'accueil. L'appli s'ouvre en plein écran et marche sans connexion.

Les mises à jour s'installent toutes seules au lancement suivant.

## Organisation du code

| Dossier | Contenu |
|---|---|
| `src/pages/` | les écrans (accueil, Repères…) |
| `src/lib/` | navigation, installation, logique partagée |
| `src/fox/` | la scène 3D du renard : humeurs, lumière, météo, réactions |
| `src/components/` | morceaux d'interface réutilisables |
| `public/` | icônes et images servies telles quelles |
| `public/models/fox.glb` | le modèle 3D du renard |
| `tools/` | outils de développement, par exemple le rendu des icônes à partir du modèle 3D |

## Crédits

- Modèle 3D « Fox » par [pxltiger](https://sketchfab.com/3d-models/fox-39f97fe58f0b47ce80b6e02814001dd7), licence [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- Construit avec [Svelte](https://svelte.dev), [Vite](https://vite.dev) et [three.js](https://threejs.org).
