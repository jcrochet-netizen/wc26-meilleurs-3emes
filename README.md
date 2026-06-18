# Widget – Meilleurs 3èmes de la Coupe du Monde 2026

Tableau dynamique classant les **8 meilleurs troisièmes** (sur 12) qui se
qualifient pour les 16èmes de finale, selon les critères de départage FIFA.
Données **officielles via SportMonks**, mise à jour automatique, à coller dans
un bloc HTML WordPress. Multilingue : FR / EN / ES / PT-BR.

## Fichiers

| Fichier | Rôle |
|---|---|
| `widget-meilleurs-3emes-wc2026.html` | Le widget à coller dans WordPress (bloc « HTML personnalisé »). |
| `fetch-data.js` | Script Node qui interroge SportMonks et écrit `data.json`. |
| `data.json` | Données générées (les 12 troisièmes, classés). Lues par le widget. |
| `.github/workflows/refresh-standings.yml` | Rafraîchit `data.json` automatiquement (cron). |
| `.env` | Contient `SPORTMONKS_API_TOKEN` (local, hors git). |

## Comment ça marche

```
[SportMonks API]  ──►  fetch-data.js  ──►  data.json  ──►  widget WordPress
 (saison 26618)        (GitHub Action,      (commit auto)    (lit dataUrl,
                        cron 2h)                              re-fetch /10 min)
```

Le token SportMonks reste **côté serveur** (secret GitHub) — jamais exposé dans
le navigateur. Le widget ne lit qu'un `data.json` public.

## Mise en place (une fois)

1. **Créer un dépôt GitHub** et y pousser ce dossier.
2. Dans le dépôt : **Settings → Secrets and variables → Actions → New secret**
   - Nom : `SPORTMONKS_API_TOKEN`
   - Valeur : le token (celui du `.env`, identique aux projets FootballWhispers / DataBetting).
3. Onglet **Actions** → activer les workflows → lancer « Refresh WC26 standings »
   une fois à la main (`Run workflow`) pour générer un premier `data.json`.
4. Récupérer l'URL brute du fichier :
   `https://raw.githubusercontent.com/<compte>/<repo>/main/data.json`
5. Dans `widget-meilleurs-3emes-wc2026.html`, renseigner cette URL :
   ```js
   var WC26_CONFIG = { lang: "fr", dataUrl: "https://raw.githubusercontent.com/.../data.json", refreshSeconds: 600 };
   ```
6. Coller le widget dans un bloc **HTML personnalisé** de la page WordPress.

> Sans `dataUrl`, le widget affiche les données de repli embarquées (mises à
> jour à chaque exécution locale de `node fetch-data.js`). C'est suffisant pour
> tester, mais l'auto-update nécessite l'étape `dataUrl` ci-dessus.

## Rafraîchir manuellement (en local)

```bash
node fetch-data.js     # nécessite Node 20+ et un .env avec le token
```

## Versions linguistiques

Le widget embarque les 4 langues. Pour servir une langue, change une ligne :
```js
lang: "fr"   // ou "en", "es", "pt"
```
Les noms de pays sont traduits via la table `COUNTRY_NAMES` dans le widget.

## Critères de départage (tous implémentés)

Le tri des 12 troisièmes applique l'ordre complet de l'art. 13 FIFA :

1. **Points** — `overall-points` (standings SportMonks)
2. **Différence de buts** — `goal-difference`
3. **Buts marqués** — `overall-goals-for`
4. **Fair-play** — calculé depuis les **cartons** des fixtures SportMonks
   (`fetch-data.js` → `computeFairPlay`). Barème art. 13 : 1 jaune −1, 2e jaune
   (expulsion indirecte) −3, rouge direct −4, jaune + rouge direct −5 ; une seule
   déduction (la pire) par joueur et par match. Types d'événements SportMonks
   utilisés : 19 = jaune, 21 = jaune/rouge (2e jaune), 20 = rouge direct. Le plus
   haut score (le moins négatif) est le mieux classé.
5. **Classement FIFA** — table `FIFA_RANK` dans `fetch-data.js`, édition du
   **11 juin 2026** (inside.fifa.com). C'est l'édition en vigueur pour toute la
   phase de groupes (prochaine publication : 20 juillet 2026). À rafraîchir
   manuellement si une nouvelle édition sort avant.

Le 3ème de chaque groupe est déterminé par la `position` SportMonks (qui applique
déjà les départages internes au groupe, dont la confrontation directe).

## Limites connues

- **Source FIFA** : `inside.fifa.com` est rendu en JavaScript et son API
  publique renvoie une liste vide ; les rangs ont donc été repris de l'édition
  officielle du 11/06/2026 et figés dans `FIFA_RANK`. Valeurs identiques à FIFA.
- **Second avertissement** : géré via le type d'événement 21 (jaune/rouge),
  prioritaire → −3, même si un événement rouge (20) l'accompagne. Résidu très
  rare : si une source enregistrait un 2e jaune comme rouge direct (type 20) sans
  type 21 ni 2e jaune (type 19), il serait compté −4 au lieu de −3.
