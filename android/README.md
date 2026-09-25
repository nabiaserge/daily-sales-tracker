# Application Android Suivi Ventes

Cette application Android affiche la plateforme sécurisée `https://suivi-ventes.netlify.app/` dans une WebView durcie. Elle utilise exclusivement HTTPS, bloque les navigations non approuvées dans l'application et conserve les sessions dans le stockage privé Android.

## Identité

- Application ID : `com.nabia.suiviventes`
- Nom : `Suivi Ventes`
- Version : `1.0.3` (`versionCode` 4)
- Android minimum : Android 7.0, API 24
- Android cible : Android 16, API 36

## Construction

```powershell
.\android\scripts\build-debug.ps1
.\android\scripts\create-upload-key.ps1
.\android\scripts\build-release.ps1
```

La clé d'envoi et son mot de passe sont créés hors du dépôt dans `C:\Users\guyse\Documents\Codex\secrets\suivi-ventes`. Ils ne doivent jamais être publiés dans GitHub. Sauvegardez ce dossier dans un coffre privé distinct avant la première mise en production.

## Remplissage automatique des identifiants

L'application et le site sont liés par Digital Asset Links : Android propose dans l'application les identifiants enregistrés pour `suivi-ventes.netlify.app`, et inversement.

- Côté application : `asset_statements` dans `AndroidManifest.xml` (valeur dans `res/values/strings.xml`).
- Côté site : `.well-known/assetlinks.json`, publié par le build Netlify.

Le fichier `assetlinks.json` doit contenir l'empreinte SHA-256 de **chaque** certificat qui signe l'application installée :

- Clé d'envoi (APK installé directement) : `37:53:51:8D:48:C0:96:99:00:88:00:56:88:BC:82:42:A9:5D:07:58:E5:2B:A4:8A:93:BC:EE:F1:61:36:9B:70`
- Clé de signature Google Play (applications installées depuis le Play Store) : à copier depuis Play Console → *Intégrité de l'application* → *Signature d'application*, puis à ajouter dans `sha256_cert_fingerprints`.

Sans l'empreinte Google Play, l'application installée depuis le Play Store ne reçoit pas les identifiants du site. N'ajoutez jamais l'empreinte de la clé de débogage : elle n'est pas secrète.
