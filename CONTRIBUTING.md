# Contribuer / Contributing

**Français** - [English](#english)

## Français

Merci de votre aide ! Toute modification passe par une **Pull Request** : la branche `main` est protégée et la CI doit être verte pour fusionner.

### 1. Préparer le projet

```bash
git clone https://github.com/kaveraa/site-audit.git
cd site-audit
npm install
```

Il faut Node.js 22 ou plus.

### 2. Créer une branche

```bash
git checkout -b fix/nom-court-du-changement
```

Préfixes conseillés : `feat/` (nouveauté), `fix/` (correction), `docs/` (documentation).

### 3. Lancer les tests

```bash
npm test           # tests unitaires et d'intégration, sur des serveurs locaux, sans réseau
npm run typecheck
npm run build
```

### 4. Règles du projet

- **Des vérifications passives et légères.** Quelques requêtes GET vers des chemins connus, une par une : jamais de tentative d'exploitation, de connexion ou de contournement.
- **Un correctif par constat.** Tout constat qui n'est pas OK dit ce qui a été mesuré et comment le corriger.
- **Pas de faux positif.** Un site qui renvoie sa page d'accueil pour toute adresse ne doit rien déclencher : comparez au contenu attendu, pas seulement au code HTTP.
- **Les tests restent hors réseau.** Ils tournent sur des serveurs `node:http` et `node:https` locaux ; OSV est simulé par `SITE_AUDIT_OSV_URL`.
- **Une seule dépendance d'exécution** (`node-html-parser`). N'en ajoutez pas pour ce que quelques lignes font.
- **Langues** : code, noms et commentaires en anglais ; sortie console et `--help` en français.
- **Tests** : toute correction ou nouveauté est accompagnée d'un test.
- **Documentation** : mettez à jour `README.md` (anglais simple) **et** `README.fr.md` (français), ainsi que le `CHANGELOG.md` (section en haut, en français et en anglais).
- **Commits** : en anglais simple, compréhensible par un débutant. Phrases courtes, pas de jargon.
- **Caractères** : uniquement des caractères du clavier dans les fichiers et les commits : `-` (pas de tiret long), `"` (pas de guillemets français), `->` (pas de flèche), pas d'emoji ni d'icône. Les lettres accentuées du français sont acceptées.

### 5. Ouvrir la Pull Request

Poussez votre branche, ouvrez une PR vers `main` et remplissez la checklist proposée. La PR peut être fusionnée quand le contrôle **All tests passed** est vert.

### Publier une version (mainteneur)

Après la fusion : mettre à jour la version dans `package.json` et le `CHANGELOG.md` (via une PR), créer un tag `vX.Y.Z` sur `main`, puis lancer `npm publish`.

### Changer la bannière (mainteneur)

Les README chargent `art/banner.svg` par une URL qui nomme un commit, pas la branche `main`, pour que les sites qui affichent le README montrent toujours la bannière en cours. Quand la bannière change :

1. Commiter le nouveau `art/banner.svg`.
2. Mettre ce commit dans l'URL de l'image de `README.md` et `README.fr.md`, dans un second commit.

---

## English

Thank you for your help! Every change goes through a **Pull Request**: the `main` branch is protected, and the CI must be green before merge.

### 1. Set up the project

```bash
git clone https://github.com/kaveraa/site-audit.git
cd site-audit
npm install
```

You need Node.js 22 or more.

### 2. Create a branch

```bash
git checkout -b fix/short-name-of-the-change
```

Suggested prefixes: `feat/` (new feature), `fix/` (bug fix), `docs/` (documentation).

### 3. Run the tests

```bash
npm test           # unit and integration tests, on local servers, no network
npm run typecheck
npm run build
```

### 4. Project rules

- **Passive and light checks.** A few GET requests to well-known paths, one at a time: never an attempt to exploit, log in or bypass anything.
- **One fix per finding.** Every finding that is not OK says what was measured and how to fix it.
- **No false positive.** A site that answers its home page for every address must not trigger anything: compare with the expected content, not only the HTTP code.
- **Tests stay off the network.** They run on local `node:http` and `node:https` servers; OSV is faked through `SITE_AUDIT_OSV_URL`.
- **One runtime dependency** (`node-html-parser`). Do not add one for what a few lines do.
- **Languages**: code, names and comments in English; console output and `--help` in French.
- **Tests**: every fix or new feature comes with a test.
- **Documentation**: update `README.md` (simple English) **and** `README.fr.md` (French), and the `CHANGELOG.md` (section at the top, in French and English).
- **Commits**: in simple English, easy to read for a beginner. Short sentences, no jargon.
- **Characters**: only keyboard characters in files and commits: `-` (no long dash), `"` (no French quotes), `->` (no arrow), no emoji or icon. French accented letters are fine.

### 5. Open the Pull Request

Push your branch, open a PR to `main` and fill in the checklist. The PR can be merged when the **All tests passed** check is green.

### Release a version (maintainer)

After the merge: update the version in `package.json` and the `CHANGELOG.md` (with a PR), create a `vX.Y.Z` tag on `main`, then run `npm publish`.

### Change the banner (maintainer)

The README files load `art/banner.svg` through a URL that names a commit, not the `main` branch, so sites that show the README always display the current banner. When the banner changes:

1. Commit the new `art/banner.svg`.
2. Put that commit in the image URL of `README.md` and `README.fr.md`, in a second commit.
