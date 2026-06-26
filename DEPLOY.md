# GeoTopo Pro — Déploiement Cloudflare Pages

## Architecture

```
GitHub repo (public)
       ↓ push → build automatique
Cloudflare Pages (static: public/)
       ↓ /api/* → Functions
Cloudflare Functions (functions/)
       ↓              ↓
  D1 Database     R2 Storage
 (users/sessions  (GeoJSON/KML
 /projects/layers)  /GPX/DXF)
```

---

## Étape 1 — Créer la base D1

```bash
npx wrangler d1 create geotopo-pro-db
```

Copiez le `database_id` retourné et collez-le dans `wrangler.toml`.

Appliquer le schéma :
```bash
npx wrangler d1 execute geotopo-pro-db --file=migrations/0001_init.sql
```

---

## Étape 2 — Créer le bucket R2

```bash
npx wrangler r2 bucket create geotopo-pro-storage
```

---

## Étape 3 — Secrets

```bash
npx wrangler secret put JWT_SECRET
# Entrez une chaîne aléatoire longue (≥ 64 caractères)
# Exemple: openssl rand -hex 32
```

---

## Étape 4 — Lier le repo GitHub à Cloudflare Pages

1. Dashboard Cloudflare → **Pages → Create a project**
2. **Connect to Git** → choisir votre repo GitHub
3. Settings:
   - **Framework preset**: None
   - **Build command**: *(vide)*
   - **Build output directory**: `public`
4. **Environment variables** :
   - Ajouter `JWT_SECRET` (valeur secrète)
5. Cliquer **Save and Deploy**

---

## Étape 5 — Lier D1 + R2 au projet Pages

Dans Cloudflare Dashboard:
1. Pages → votre projet → **Settings → Functions**
2. **D1 database bindings** → Add:
   - Variable name: `DB`
   - Database: `geotopo-pro-db`
3. **R2 bucket bindings** → Add:
   - Variable name: `R2`
   - Bucket: `geotopo-pro-storage`
4. **Redeploy** le projet

---

## Structure du repo

```
geotopo-pro/
├── public/
│   ├── index.html       ← App principale (modifiée)
│   ├── app.js           ← GIS core (inchangé)
│   └── cloud.js         ← Client auth + projets cloud
├── functions/
│   ├── _middleware.js   ← CORS + crypto + auth helper
│   └── api/
│       ├── auth/
│       │   ├── login.js
│       │   ├── register.js
│       │   ├── logout.js
│       │   ├── me.js
│       │   └── reset.js
│       ├── projects/
│       │   ├── index.js    ← GET list / POST create
│       │   └── [id].js     ← GET / PUT / DELETE
│       ├── layers/
│       │   ├── index.js    ← POST save layer
│       │   └── [id].js     ← DELETE layer
│       └── files/
│           └── upload.js   ← POST upload to R2
├── migrations/
│   └── 0001_init.sql    ← Schema D1
└── wrangler.toml        ← Config Cloudflare
```

---

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/auth/register | — | Inscription |
| POST | /api/auth/login | — | Connexion |
| POST | /api/auth/logout | ✅ | Déconnexion |
| GET  | /api/auth/me | ✅ | Profil |
| POST | /api/auth/reset | — | Reset mdp |
| GET  | /api/projects | ✅ | Lister projets |
| POST | /api/projects | ✅ | Créer projet |
| GET  | /api/projects/:id | ✅ | Détail + layers |
| PUT  | /api/projects/:id | ✅ | Modifier |
| DELETE | /api/projects/:id | ✅ | Supprimer |
| POST | /api/layers | ✅ | Sauvegarder couche |
| DELETE | /api/layers/:id | ✅ | Supprimer couche |
| POST | /api/files/upload | ✅ | Upload R2 |

---

## Sécurité

- PBKDF2 100 000 itérations (hash mot de passe)
- JWT HS256 + validation session DB à chaque requête
- Protection timing attack sur login
- Anti-énumération email sur reset password
- Isolation R2 par userId dans le chemin
- Token reset expire après 1 heure
- Sessions expirées automatiquement (30 jours)

---

## Développement local

```bash
npm install -g wrangler
npx wrangler pages dev public --d1=DB=local
```
