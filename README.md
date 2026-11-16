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

## L'appli Android et son widget

Pour avoir le renard en widget sur l'écran d'accueil, il existe une petite appli Android (dossier `android/`).
Elle affiche le site en plein écran : les mises à jour du site y arrivent donc toutes seules. En plus, elle apporte :

- un **petit widget** (2 × 2) : le renard, sans fond, dans l'humeur du dernier check-in ;
- un **grand widget** (4 × 2) : le renard, son humeur, ses jauges (humeur, énergie, nuit) et les boutons *Ça va ?* et *Je le sens* ;
- les **capteurs Bluetooth** (ceinture cardio et bague), branchés directement par l'appli ;
- le **pouls en direct** sur les deux widgets, même appli fermée : un petit service Android prend le relais de la page,
  avec une notification qui permet de l'arrêter (il s'arrête seul au bout de 4 h, 1 h pour la démo) ;
- un renard **animé** (il respire, bouge, cligne des yeux) et somnolent la nuit, de 22 h à 7 h ;
- les sauvegardes rangées directement dans les téléchargements.

**Installer** : sur le téléphone, *Repères → Le widget du renard* propose de télécharger `mon-renard.apk`.
Android demande alors d'autoriser Chrome à installer des applis. Le journal de Chrome ne passe pas tout seul dans
l'appli : il faut faire une sauvegarde dans Chrome, puis la restaurer dans l'appli. Désinstaller l'appli efface son journal.

**Construire l'APK** (Android Studio ou son JDK, et le SDK Android) :

```bash
cd android
./gradlew assembleRelease   # APK signé dans app/build/outputs/apk/release/
./gradlew assembleDebug     # version d'essai « .essai », branchée sur le serveur de dev de l'ordinateur
```

La clé de signature n'est **jamais** sur le dépôt. Elle est lue dans `~/.mon-renard/signature/keystore.properties`
(ou le fichier indiqué par la variable `MON_RENARD_SIGNING`). Sans elle, impossible de publier une mise à jour qui
s'installe par-dessus l'appli existante : il faut en garder une copie en lieu sûr.

**Publier une nouvelle version de l'APK** : augmenter `versionCode` et `versionName` dans `android/app/build.gradle`,
construire, copier l'APK dans `public/android/mon-renard.apk` et mettre les mêmes numéros dans
`public/android/version.json`. L'appli signale alors la mise à jour dans *Repères*.

**Images du widget** : `node tools/render-widget.mjs <chemin vers puppeteer-core>`, avec le serveur de dev ouvert,
refait les images à partir du vrai renard 3D, sans fond : pour chaque humeur, une boucle de 16 images, 2 images de
clignement et une boucle de nuit de 8 images. Un widget Android ne peut pas faire tourner de 3D : il fait défiler
ces images (un `ViewFlipper`, `res/layout/widget_fox.xml`, écrit lui aussi par le script, comme les vitesses dans
`res/values/widget_anim.xml`). Le défilement s'arrête tout seul quand l'écran d'accueil n'est pas visible.

La version d'essai se teste dans un émulateur : lancer `npx vite --host 127.0.0.1 --port 5174`
(l'émulateur voit l'ordinateur à l'adresse 10.0.2.2).

## Jauges et mesures en direct

Sur l'accueil, trois **jauges** résument le dernier check-in : l'humeur (centrée sur l'équilibre : la barre part
à gauche quand elle baisse, à droite quand elle monte), l'énergie, et la nuit si elle a été notée aujourd'hui.
Elles pâlissent quand le dernier check-in date de plus de 12 heures.

Le panneau **En direct** affiche les mesures des capteurs portés : pouls et variabilité cardiaque (RMSSD), avec la
courbe du pouls des deux dernières minutes. *Brancher la ceinture* et *Brancher la bague* les connectent en
Bluetooth, l'un ou l'autre ou les deux : la variabilité vient de la ceinture (elle seule envoie les intervalles
entre battements) et, quand les deux sont là, le pouls de la ceinture, plus précis, passe avant celui de la bague.
Une **démo** produit aussi des valeurs simulées, toujours signalées comme telles.

Le code des capteurs est dans `src/sensors/` :

| Fichier | Rôle |
|---|---|
| `types.ts` | le modèle des mesures horodatées (pouls, intervalles RR, GSR, pouls optique, accéléromètre) et l'interface d'une source |
| `simulator.ts` | la démo (valeurs plausibles, reproductibles) |
| `metrics.ts` | RMSSD, fenêtre glissante |
| `ble/heartRate.ts` | la ceinture cardio : service Bluetooth standard Heart Rate (0x180D), lecture des paquets 0x2A37 |
| `ble/colmi.ts` | la bague Colmi : paquets de 16 octets, pouls en continu (commande 0x1E, relancée toutes les 25 s), mesure ponctuelle (0x69) en secours |
| `ble/esp32.ts` | l'ancien boîtier ESP32 (non fabriqué) : service personnalisé et format des paquets **proposés** |
| `ble/webBluetooth.ts` | la connexion Web Bluetooth commune |
| `native.ts` | les capteurs branchés par l'appli Android, vus comme des sources ordinaires |

Web Bluetooth marche dans Chrome (appli installée depuis Chrome), mais **pas** dans la WebView de l'appli Android.
Là, c'est l'appli qui se connecte en Bluetooth natif (`BleSensors.java`, et `ColmiProtocol.java` pour la bague, à
garder d'accord avec `colmi.ts`) et envoie les mesures à la page (événement `renard-ble`). La connexion continue
appli fermée : `LiveService.java` garde l'appli en vie avec une notification « Mesure en direct » (4 h au plus) et
le widget suit le pouls. La bague ne parle qu'à une appli à la fois : l'appli QRing doit être fermée.

Le protocole de la bague vient de [colmi_r02_client](https://github.com/tahnok/colmi_r02_client) et de
[Gadgetbridge](https://gadgetbridge.org/gadgets/rings/yawell/). Ni la ceinture ni la bague n'ont encore été
essayées pour de vrai : le premier branchement dira s'il faut ajuster.

### Alerte quand le pouls monte

Dans **Repères → Alerte quand ton pouls monte** : un seuil (100 par défaut), des **plages horaires** (jours et
heures ; une plage peut passer minuit) et un son. Si le pouls d'un vrai capteur reste au-dessus du seuil pendant
30 secondes (80 % des mesures, pour tolérer les ratés de la bague), pendant une plage horaire, le téléphone **sonne
et vibre fort**, puis un écran propose de respirer avec le renard (la séance démarre tout de suite). Ensuite :
15 minutes sans nouvelle alerte ; *Pas maintenant* coupe les alertes pendant 1 heure. Jamais pendant la démo.

- `src/lib/pulseAlert.ts` : la règle (seuil, durée, plages horaires), testée ; `PulseAlert.java` refait la même.
- `src/lib/alert.svelte.ts` : réglages, écran d'alerte (`AlertOverlay.svelte`), et dans le navigateur la sonnerie
  (carillon ou bips, synthétisés) et la vibration, seulement tant que la page est ouverte.
- Dans l'appli Android (1.4 et plus), c'est `PulseAlert.java` qui surveille, appli fermée comprise : son au choix
  (sonnerie ou musique du téléphone) sur le volume des **alarmes** (il passe le mode silencieux), vibration en
  mode alarme, notification plein écran avec *Arrêter* et *Pas maintenant (1 h)*.

La liste du matériel (une ceinture cardio et une bague connectée Colmi R03), la façon de les porter et l'ancienne
piste du boîtier fait maison à imprimer en 3D sont dans [`materiel/`](materiel/README.md).

## Sauvegarder ses données

Dans **Repères → Tes données**, *Enregistrer une sauvegarde* met tout le journal (check-ins et moments « je le sens »)
dans un fichier `mon-renard-sauvegarde-AAAA-MM-JJ.json`, rangé dans les téléchargements du téléphone.
*Restaurer une sauvegarde* ajoute le contenu d'un tel fichier au journal, sans rien effacer ni créer de doublons.
Le fichier n'est pas chiffré : il faut le garder dans un endroit sûr.

## Organisation du code

| Dossier | Contenu |
|---|---|
| `src/pages/` | les écrans (accueil, Repères…) |
| `src/lib/` | navigation, installation, journal des check-ins côté interface, logique partagée |
| `src/data/` | base de données locale (IndexedDB via Dexie) : profils, check-ins, moments « je le sens », sauvegarde JSON |
| `src/fox/` | la scène 3D du renard : humeurs, lumière, météo, réactions |
| `src/sensors/` | les mesures en continu : modèle, sources (démo, ceinture, boîtier), calculs |
| `src/components/` | morceaux d'interface réutilisables |
| `public/` | icônes et images servies telles quelles |
| `public/models/fox.glb` | le modèle 3D du renard, allégé (2,4 Mo au lieu de 9,1) |
| `tools/source/fox-original.glb` | le modèle d'origine, non publié |
| `tools/` | outils de développement : rendu des icônes (`make-icons.mjs`), allègement du modèle (`optimize-model.mjs`), images du widget (`render-widget.mjs`) |
| `android/` | l'appli Android (Java, sans bibliothèque externe) : affichage du site, widgets, pont `window.RenardAndroid` |
| `public/android/` | l'APK à télécharger et son numéro de version |

Pour utiliser une nouvelle animation du renard, l'ajouter à la liste `KEEP` de `tools/optimize-model.mjs`,
puis relancer `node tools/optimize-model.mjs` avec le serveur de dev ouvert. Un test vérifie que toutes
les animations utilisées sont bien dans le modèle.

## Crédits

- Modèle 3D « Fox » par [pxltiger](https://sketchfab.com/3d-models/fox-39f97fe58f0b47ce80b6e02814001dd7), licence [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- Construit avec [Svelte](https://svelte.dev), [Vite](https://vite.dev), [three.js](https://threejs.org), [Dexie](https://dexie.org) et [uPlot](https://github.com/leeoniya/uPlot).
