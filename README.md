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
- **Courses** : les articles sous leur seuil forment la liste (on peut en ajouter d'autres). Au magasin, on coche
  ce qu'on achète, on ajuste la quantité et la marque, puis « Ranger en stock » met tout à jour d'un coup.
- **Historique** : chaque entrée et sortie est enregistrée (qui, quoi, quand, comment). Graphique de consommation
  sur 6 mois, top des articles consommés du mois, journal filtrable, et derniers mouvements dans chaque fiche article.
- **Sauvegarde** : export / restauration de l'inventaire **et de l'historique** dans un fichier (onglet Réglages),
  restauration en « fusionner » (sans doublons) ou « remplacer », rappel quand la dernière sauvegarde date.
- **Courses partagées** : les cases cochées, quantités et prix sont les mêmes sur tous les téléphones, en direct,
  avec le prénom de qui s'en occupe. Les articles « bientôt vides » d'après la consommation sont proposés.
- **Scan en rafale** : « Rafale +1 » ou « Rafale −1 » ajoute ou retire à chaque scan, sans carte de validation.
- **Mode inventaire** : on compte ce qu'il y a réellement, étagère par étagère ; l'app montre les écarts et les corrige d'un coup.
- **Péremption** : date par référence, pastille « Périme dans 3 j » et filtre « À consommer ».
- **Fiche vin** : millésime, appellation, couleur, période de dégustation, note et commentaire ; filtre « Vins à boire ».
- **Prix et budget** : prix par référence (mis à jour depuis les courses), valeur du stock, dépenses du mois.
- **Plusieurs emplacements** : chaque référence peut avoir son propre emplacement (cave, congélateur…) ;
  tri et regroupement de la liste par emplacement.
- **Prévision de rupture** : consommation mensuelle, date de rupture estimée et seuil conseillé dans chaque fiche.
- **Export tableur** (CSV pour Excel / Google Sheets) de l'inventaire et de l'historique.
- **Annuler** juste après un +/− par erreur ; indicateur des modifications en attente hors-ligne.
- **Installable** sur l'écran d'accueil (PWA), thème clair/sombre automatique, démarrage hors-ligne,
  bandeau « Nouvelle version » quand l'app est mise à jour.

## Stack

React + TypeScript + Vite, Firebase (Firestore pour la synchro temps réel, connexion Google pour la sécurité),
ZXing / BarcodeDetector pour le scan. Hébergement statique sur GitHub Pages.

Sans configuration Firebase, l'app fonctionne en **mode local** (données sur l'appareil uniquement), pratique pour essayer.

## Mise en route

```bash
npm install
npm run dev        # http://localhost:5173 (et l'adresse réseau pour tester sur le téléphone)
npm test           # tests de la logique (alertes, péremption, prévision, sauvegarde, export)
```

> La caméra n'est autorisée par les navigateurs qu'en HTTPS (ou sur localhost). Pour scanner depuis le téléphone,
> utilisez la version déployée sur GitHub Pages.

## Activer la synchro entre téléphones (Firebase, gratuit)

1. Créez un projet sur <https://console.firebase.google.com> (offre gratuite *Spark* suffisante).
2. **Firestore Database** › Créer une base (mode production, région `eur3`).
3. **Authentication** › Méthode de connexion › activez **Google**.
   Dans *Paramètres › Domaines autorisés*, ajoutez `thebootfinder.github.io`.
4. **Paramètres du projet** › *Vos applications* › ajoutez une app Web et copiez la config.
5. Copiez le contenu de `firestore.rules` (il inclut la liste de courses partagée, document `shared/courses`) dans *Firestore › Règles*, remplacez **dans la console**
   `votre.adresse@gmail.com` par les comptes Google de la maison, puis publiez.
   Le dépôt étant public, ne mettez pas vos vraies adresses dans le fichier du dépôt.
6. En local : copiez `.env.example` en `.env.local` et remplissez les valeurs.
   Pour le déploiement : ajoutez les mêmes clés dans GitHub › *Settings › Secrets and variables › Actions › Variables*,
   puis relancez le workflow « Déploiement GitHub Pages ».

## Déploiement (GitHub Pages)

GitHub › *Settings › Pages* › Source : **GitHub Actions**. Chaque push sur `main` publie l'app sur
<https://thebootfinder.github.io/Inventory-management/>.

Sur le téléphone : ouvrez l'adresse, puis *Partager › Sur l'écran d'accueil* (iPhone) ou *Installer l'application* (Android).
