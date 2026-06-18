#!/usr/bin/env node
/**
 * Coupe du Monde 2026 – Meilleurs 3èmes : récupérateur de données
 * ----------------------------------------------------------------
 * Source : API SportMonks (même token que FootballWhispers / DataBetting).
 *
 *  1. Standings de la saison 26618 → le 3ème de chacun des 12 groupes.
 *  2. Fixtures (phase de groupes) → cartons → score fair-play FIFA par équipe.
 *  3. Classement FIFA (édition 11 juin 2026) → départage final.
 *
 * Classe les 12 troisièmes selon les critères FIFA (art. 13) :
 *   a) points  b) diff. de buts  c) buts marqués
 *   d) fair-play (cartons)       e/f) classement mondial FIFA
 *
 * Écrit data.json. Le widget WordPress le lit (token jamais exposé côté client).
 * Relancer pour rafraîchir :  node fetch-data.js
 */

const fs = require("fs");
const path = require("path");

function loadDotEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadDotEnv();

const API_TOKEN = process.env.SPORTMONKS_API_TOKEN;
if (!API_TOKEN) {
  console.error("✗ SPORTMONKS_API_TOKEN manquant (voir .env.example).");
  process.exit(1);
}

const BASE = "https://api.sportmonks.com/v3/football";
const SEASON_ID = 26618;          // Coupe du Monde 2026
const QUALIFY_COUNT = 8;          // 8 meilleurs 3èmes qualifiés
const GROUP_WINDOW = ["2026-06-11", "2026-06-27"]; // phase de groupes

// Classement FIFA/Coca-Cola hommes — édition du 11 juin 2026 (inside.fifa.com).
// Clé = nom de l'équipe tel que renvoyé par SportMonks.
const FIFA_RANK = {
  "Argentina": 1, "France": 2, "Spain": 3, "England": 4, "Brazil": 5,
  "Morocco": 6, "Portugal": 7, "Netherlands": 8, "Germany": 9, "Belgium": 10,
  "Croatia": 11, "Mexico": 13, "Colombia": 14, "United States": 15, "Senegal": 16,
  "Japan": 17, "Uruguay": 18, "Switzerland": 19, "Austria": 21, "Korea Republic": 22,
  "Australia": 23, "Iran": 24, "Türkiye": 26, "Norway": 27, "Ecuador": 28,
  "Egypt": 29, "Côte d'Ivoire": 30, "Algeria": 31, "Canada": 32, "Panama": 34,
  "Sweden": 35, "Scotland": 38, "Paraguay": 42, "Congo DR": 43, "Czech Republic": 44,
  "Qatar": 49, "Uzbekistan": 50, "Tunisia": 56, "Saudi Arabia": 59, "Iraq": 60,
  "South Africa": 61, "Bosnia and Herzegovina": 63, "Cape Verde Islands": 64, "Jordan": 67,
  "Ghana": 73, "New Zealand": 82, "Curacao": 83, "Haiti": 85
};

function det(details, code) {
  const d = (details || []).find((x) => x.type && x.type.code === code);
  return d ? Number(d.value) : 0;
}

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`SportMonks ${res.status} ${res.statusText}`);
  return res.json();
}

/**
 * Score fair-play FIFA par équipe (participant_id) sur les matchs de groupe.
 * Barème (art. 13) — une seule déduction, la pire, par joueur et par match :
 *   1 jaune = -1 | 2e jaune (expulsion indirecte) = -3 | rouge direct = -4 | jaune + rouge direct = -5
 * Types d'événements SportMonks : 19 = jaune, 21 = jaune/rouge (2e jaune), 20 = rouge direct.
 */
async function computeFairPlay(stageId) {
  const [start, end] = GROUP_WINDOW;
  const fairByTeam = {};
  let page = 1;
  for (;;) {
    const url =
      `${BASE}/fixtures/between/${start}/${end}` +
      `?api_token=${API_TOKEN}&include=events.type&filters=fixtureLeagues:732` +
      `&per_page=50&page=${page}`;
    const json = await getJSON(url);
    const fixtures = json.data || [];

    for (const fx of fixtures) {
      if (stageId && fx.stage_id !== stageId) continue; // matchs de groupe uniquement

      // Regroupe les cartons par (équipe, joueur) dans ce match.
      const byPlayer = {};
      for (const ev of fx.events || []) {
        if (ev.rescinded) continue;
        const t = ev.type_id;
        if (t !== 19 && t !== 20 && t !== 21) continue; // jaune / rouge / jaune-rouge
        const part = ev.participant_id;
        const who = ev.player_id != null ? "p" + ev.player_id : "c" + ev.coach_id;
        const key = part + ":" + who;
        const o = byPlayer[key] || (byPlayer[key] = { part: part, y: 0, r: 0, yr: 0 });
        if (t === 19) o.y++;
        else if (t === 20) o.r++;
        else o.yr++; // type 21 : 2e jaune (yellow/red)
      }
      for (const key in byPlayer) {
        const o = byPlayer[key];
        let p = 0;
        if (o.yr >= 1) p = -3;                  // 2e jaune → expulsion indirecte (prioritaire)
        else if (o.r >= 1 && o.y >= 1) p = -5;  // jaune + rouge direct
        else if (o.r >= 1) p = -4;              // rouge direct
        else if (o.y >= 2) p = -3;              // deux jaunes sans type 21 (repli)
        else if (o.y === 1) p = -1;             // 1 jaune
        fairByTeam[o.part] = (fairByTeam[o.part] || 0) + p;
      }
    }

    const pg = json.pagination || {};
    if (!pg.has_more) break;
    page++;
    if (page > 10) break; // garde-fou
  }
  return fairByTeam;
}

async function main() {
  // 1) Standings → 3ème de chaque groupe.
  const standings = await getJSON(
    `${BASE}/standings/seasons/${SEASON_ID}` +
      `?api_token=${API_TOKEN}&include=participant;group;details.type`
  );
  const rows = standings.data || [];
  if (!rows.length) throw new Error("Réponse SportMonks vide (standings).");
  const stageId = rows[0].stage_id;

  // 2) Fair-play (cartons) par équipe.
  const fairByTeam = await computeFairPlay(stageId);

  const groups = {};
  for (const r of rows) {
    const name = (r.group && r.group.name) || "";
    const letter = (name.match(/Group\s+([A-L])/i) || [])[1];
    if (!letter) continue;
    (groups[letter] = groups[letter] || []).push(r);
  }

  const thirds = [];
  for (const letter of Object.keys(groups)) {
    const arr = groups[letter].slice().sort((a, b) => a.position - b.position);
    const third = arr.find((r) => r.position === 3) || arr[2];
    if (!third) continue;
    const d = third.details;
    const p = third.participant || {};
    thirds.push({
      group: letter,
      name: p.name || "—",
      code: p.short_code || "",
      logo: p.image_path || "",
      played: det(d, "overall-matches-played"),
      pts: det(d, "overall-points") || Number(third.points) || 0,
      gf: det(d, "overall-goals-for"),
      ga: det(d, "overall-goals-against"),
      gd: det(d, "goal-difference"),
      fair: fairByTeam[p.id] || 0,
      fifa: FIFA_RANK[p.name] || null,
    });
  }

  // 3) Tri selon les critères FIFA a→f.
  thirds.sort(
    (a, b) =>
      b.pts - a.pts ||
      b.gd - a.gd ||
      b.gf - a.gf ||
      (b.fair || 0) - (a.fair || 0) ||                 // fair-play : plus haut = mieux
      (a.fifa || 999) - (b.fifa || 999) ||             // FIFA : plus petit = mieux
      a.name.localeCompare(b.name)
  );

  const out = {
    updated: new Date().toISOString(),
    source: "SportMonks + FIFA ranking (11/06/2026)",
    season: "2026",
    qualifyCount: QUALIFY_COUNT,
    teams: thirds,
  };
  fs.writeFileSync(path.join(__dirname, "data.json"), JSON.stringify(out, null, 2));

  console.log(`✓ data.json écrit — ${thirds.length}/12 groupes`);
  thirds.forEach((t, i) => {
    const mark = i < QUALIFY_COUNT ? "✅" : "❌";
    console.log(
      `${mark} ${String(i + 1).padStart(2)}. [${t.group}] ${t.name.padEnd(16)} ` +
        `${t.pts}pts  diff ${t.gd >= 0 ? "+" + t.gd : t.gd}  BP ${t.gf}  ` +
        `FP ${t.fair}  FIFA#${t.fifa}  (J${t.played})`
    );
  });
}

main().catch((e) => {
  console.error("✗", e.message || e);
  process.exit(1);
});
