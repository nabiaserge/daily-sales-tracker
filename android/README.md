# Application Android Suivi Ventes

Cette application Android affiche la plateforme sécurisée `https://suivi-ventes.netlify.app/` dans une WebView durcie. Elle utilise exclusivement HTTPS, bloque les navigations non approuvées dans l'application et conserve les sessions dans le stockage privé Android.

## Identité

- Application ID : `com.nabia.suiviventes`
- Nom : `Suivi Ventes`
- Version : `1.0.0` (`versionCode` 1)
- Android minimum : Android 7.0, API 24
- Android cible : Android 16, API 36

## Construction

```powershell
.\android\scripts\build-debug.ps1
.\android\scripts\create-upload-key.ps1
.\android\scripts\build-release.ps1
```

La clé d'envoi et son mot de passe sont créés hors du dépôt dans `C:\Users\guyse\Documents\Codex\secrets\suivi-ventes`. Ils ne doivent jamais être publiés dans GitHub. Sauvegardez ce dossier dans un coffre privé distinct avant la première mise en production.
