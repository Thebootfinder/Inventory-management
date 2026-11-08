# Cellier · inventaire en temps réel

Application web pensée pour le téléphone : on sait à tout moment ce qu'il reste dans le cellier.

- **Stock en direct** : chaque ajout ou retrait apparaît instantanément sur tous les téléphones connectés.
- **Ajouter / retirer** en un geste avec les boutons − et + de chaque article.
- **Scan de code-barres** avec la caméra : le produit scanné s'affiche avec une quantité modifiable,
  et rien ne bouge tant qu'on n'a pas appuyé sur **Ajouter** ou **Retirer**.
- **Regroupement par article** : « Jus de pomme » peut contenir plusieurs marques, chacune avec son code-barres
  et sa quantité. L'alerte porte sur le total ; un clic sur l'article montre le détail par marque.
- **Code inconnu** : on le range dans un article existant (suggestions automatiques) ou on crée un article,
  avec nom et photo pré-remplis via Open Food Facts quand le produit y est référencé.
  Une fois nommé, le code est reconnu à chaque scan.
- **Alertes** : chaque article a un seuil minimum. En dessous, il passe en « Stock bas » ou « Rupture »
  et rejoint la liste **À racheter**, partageable en un clic (SMS, WhatsApp, notes…).
- **Hors-ligne** : au fond du cellier sans réseau, les modifications sont gardées et envoyées au retour de la connexion.
- **Sauvegarde** : export / restauration de l'inventaire dans un fichier (menu du badge en haut à droite).
- **Installable** sur l'écran d'accueil (PWA), thème clair/sombre automatique.

## Stack

React + TypeScript + Vite, Firebase (Firestore pour la synchro temps réel, connexion Google pour la sécurité),
ZXing / BarcodeDetector pour le scan. Hébergement statique sur GitHub Pages.

Sans configuration Firebase, l'app fonctionne en **mode local** (données sur l'appareil uniquement), pratique pour essayer.

## Mise en route

```bash
npm install
npm run dev        # http://localhost:5173 (et l'adresse réseau pour tester sur le téléphone)
```

> La caméra n'est autorisée par les navigateurs qu'en HTTPS (ou sur localhost). Pour scanner depuis le téléphone,
> utilisez la version déployée sur GitHub Pages.

## Activer la synchro entre téléphones (Firebase, gratuit)

1. Créez un projet sur <https://console.firebase.google.com> (offre gratuite *Spark* suffisante).
2. **Firestore Database** › Créer une base (mode production, région `eur3`).
3. **Authentication** › Méthode de connexion › activez **Google**.
   Dans *Paramètres › Domaines autorisés*, ajoutez `thebootfinder.github.io`.
4. **Paramètres du projet** › *Vos applications* › ajoutez une app Web et copiez la config.
5. Copiez le contenu de `firestore.rules` dans *Firestore › Règles*, remplacez **dans la console**
   `votre.adresse@gmail.com` par les comptes Google de la maison, puis publiez.
   Le dépôt étant public, ne mettez pas vos vraies adresses dans le fichier du dépôt.
6. En local : copiez `.env.example` en `.env.local` et remplissez les valeurs.
   Pour le déploiement : ajoutez les mêmes clés dans GitHub › *Settings › Secrets and variables › Actions › Variables*,
   puis relancez le workflow « Déploiement GitHub Pages ».

## Déploiement (GitHub Pages)

GitHub › *Settings › Pages* › Source : **GitHub Actions**. Chaque push sur `main` publie l'app sur
<https://thebootfinder.github.io/Inventory-management/>.

Sur le téléphone : ouvrez l'adresse, puis *Partager › Sur l'écran d'accueil* (iPhone) ou *Installer l'application* (Android).
