# OtAkU+ AI Server

Serveur proxy securise pour l'agent IA Mistral de l'application OtAkU+.

## Routes disponibles

| Route | Methode | Description |
|-------|---------|-------------|
| `/` | GET | Statut du serveur |
| `/health` | GET | Verification sante |
| `/api/chat` | POST | Chat avec l'agent IA |
| `/api/recommend` | POST | Recommandations personnalisees |
| `/api/quiz` | POST | Generation de quiz anime |

## Deploiement sur Render

1. Fork ou push ce dossier sur GitHub
2. Aller sur [render.com](https://render.com) -> New Web Service
3. Connecter le repo GitHub
4. Ajouter la variable d'environnement :
   - **Key** : `MISTRAL_API_KEY`
   - **Value** : ta cle API depuis [platform.mistral.ai](https://platform.mistral.ai)
5. Deployer

## Utilisation depuis OtAkU+

Une fois l'URL Render obtenue (ex: `https://otakuplus-ai-server.onrender.com`),
la configurer dans `index.html` :

```js
var OTAKU_AI_SERVER = 'https://ton-serveur.onrender.com';
```

## Variables d'environnement

| Variable | Requis | Description |
|----------|--------|-------------|
| `MISTRAL_API_KEY` | Oui | Cle API depuis platform.mistral.ai |
| `MISTRAL_MODEL` | Non | Modele (defaut: mistral-large-latest) |
| `PORT` | Non | Port (Render le definit automatiquement) |

## Developpement local

```bash
npm install
MISTRAL_API_KEY=sk-... npm start
```

---
Cree par **DAVIESLAY** pour OtAkU+
