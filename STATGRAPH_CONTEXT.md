Excelentă idee — acesta e exact mecanismul corect de continuitate. Mai jos ai documentul complet: copiază-l într-un fișier (recomand `STATGRAPH_CONTEXT.md` în rădăcina proiectului) și lipește-l la începutul oricărui chat nou cu mine.

---

# STATGRAPH — Document de Context pentru Asistent AI

*Ultima actualizare: după sesiunea de analiză completă a codebase-ului. Toate informațiile de mai jos sunt confirmate din cod primit în conversație, cu excepția secțiunii 13 (necunoscute).*

## 1. Ce este aplicația

**Statgraph** centralizează organigramele instituțiilor publice din România, relațiile administrative și datele organizaționale, într-o platformă de analiză. Slogan: *"Transparența statului face puterea înțeleasă."*

**Scopuri:**
1. Vizualizare drill-down a organigramelor pe 3 niveluri de administrare
2. Educație sistemică a publicului (modul Educație)
3. Produse analitice monetizabile (modul "Analize"/Premium — **încă nedevelopat**)

**Niveluri de administrare acoperite:**
- **Național:** Președinție, Guvern, Parlament, Justiție, C.S.A.T.
- **Județean:** Consilii județene, Prefecturi, Deconcentrate, Siguranță
- **Local:** Primării/Consilii locale (Municipii, Orașe, Comune), Servicii și Regii

## 2. Stack tehnic

| Componentă | Tehnologie |
|---|---|
| Frontend | Vue 3 (Composition API, `<script setup>`) + Vite |
| State | Pinia (instalat, doar fișier demo — nefolosit efectiv) |
| Rutare | Vue Router (`createWebHistory`) |
| Backend | Supabase (Postgres + Auth + Storage) |
| Vizualizări | `@vue-flow/core` (drill-down principal), `d3` (Sunburst + Treemap) |
| Export PDF | `html2pdf.js` |
| Iconițe | `lucide-vue-next` |
| Deploy | Vercel (funcții serverless în `/api` — **acum scoase din uz**) |
| Lint | ESLint + oxlint + Prettier |
| Node | `^22.18.0 || >=24.12.0` |

**Dependențe candidate la ștergere:** `@google/generative-ai` (nefolosit), funcțiile `/api/robot.js` și `/api/parser.js` (dezactivate — vezi §12).

## 3. Structura proiectului

```
statgraph_vue/
├── api/                    # robot.js, parser.js (DEPRECATED — de șters)
├── src/
│   ├── assets/main.css
│   ├── components/
│   │   ├── auth/AuthModal.vue
│   │   ├── DynamicFinTable.vue      # coloane financiare dinamice în tabele
│   │   ├── SunburstChart.vue
│   │   └── TreemapChart.vue
│   ├── composables/useAuth.js
│   ├── lib/supabase.js              # DUPLICAT mort — de șters
│   ├── router/index.js
│   ├── stores/counter.js            # scaffolding — de șters
│   ├── views/
│   │   ├── HomeView.vue             # landing
│   │   ├── Dashboard.vue            # NUCLEUL — monolit mare
│   │   ├── dashboard-template.html  # template extern pt Dashboard
│   │   ├── dashboard-style.scss     # stiluri scoped
│   │   ├── dashboard-flow-style.scss
│   │   ├── Educatie.vue
│   │   └── Analize.vue              # modul Premium (nedezvoltat)
│   ├── App.vue                      # doar <router-view />
│   ├── main.js
│   └── supabaseClient.js            # clientul Supabase ACTIV
```

**Rute:** `/` → HomeView, `/dashboard` → Dashboard, `/educatie` → Educatie, `/analize` → Analize.

**Client Supabase** (`src/supabaseClient.js`): URL + publishable key hardcodate în cod (cheie publică — OK, dar recomandat mutare în `.env`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`).

## 4. Modelul de date (Supabase)

| Tabelă | Rol | Coloane cheie |
|---|---|---|
| `institutii` | nodurile rădăcină (instituții) | `id` (uuid), `nume`, `nume_curat` (fără diacritice, pt căutare), `rol`, `metadata` JSONB (`imagine`, `logo_url`, ...), + câmpuri contact (cui, adresa, telefon, email, website, program, acronim, calitate_bugetara, news, relatie) |
| `organograms` | toate nodurile copil (toate cele 3 niveluri) | `id`, `parent_id`, `institutie_id`, `node_name`/`nume`, `is_institution`, `is_department`, `is_office`, `is_committee` (bool; **Rol = toate false**), `rol`, `metadata` JSONB |
| `date_joburi` | posturi pe nod | `organogram_node_id`, `functie`, `pozitii_ocupate`, `pozitii_vacante`, `statut`, `observatii`, `fin_columns` JSONB |
| `surse_informatii` | surse cu link pe nod | `organogram_node_id`, `subiect`, `link_sursa`, `observatii` |
| `profiles` | roluri utilizatori | `id` (= auth.users.id), `role` ∈ {`vizitator`, `utilizator`, `admin`} |
| Storage | bucket `poze_institutii` | poze + logo-uri instituții |

**`metadata` JSONB — cheile folosite:** `hr_departament` (rânduri HR pt departamente), `role_statut` (`Activ`/`Vacant`), `role_fin_columns`, `imagine`, `logo_url`, `rol`, `rof`, `reglementare`, `baza_legala`, `cod_cor`.

**⚠️ Necunoscut critic:** structura exactă + statusul RLS pe tabele NU au fost încă verificate (vezi §13).

## 5. Auth & roluri

- `useAuth.js`: singleton (refs la nivel de modul), ascultă `onAuthStateChange`, preia rolul din `profiles` după login/refresh.
- Roluri: **vizitator** (neautentificat — gating), **utilizator** (acces complet), **admin** (+ instrumente editare).
- `AuthModal.vue` acceptă prop `initialMode` ('login'/'register'); login-ul face redirect la `/dashboard`.
- **Probleme identificate (P0):** fallback fail-open (`userRole='utilizator'` la eroare → ocolește paywall); posibil lipsă trigger DB care creează `profiles` la signup; race condition la redirect rapid (flag `roleLoaded` recomandat).

## 6. Dashboard — funcționalități

**Vizualizări:** Graph (Vue Flow — root sus, copiii în grid dedesubt, click = drill-down, `navigationStack` + breadcrumbs, selector 2-7 coloane), Sunburst, Treemap (comutator 👁️).

**Căutare:** globală multi-select cu insigne (normalizare diacritice via `nume_curat`, debounce 300ms), panou lateral rezultate, spotlight pe nodurile curente (clase `spotlight-match`/`spotlight-dim`).

**Gating vizitatori:** arbore tăiat la 2 niveluri (`visibleChartData`/`pruneTree`); click pe nod cu subordonați → AuthModal register; badge-uri "🔒 Cont necesar", "D" (detalii), "HR indisponibil" (pt instituții care nu publică — transparență).

**Panouri detalii per tip nod:** Profil instituțional (cu agregare HR: `date_joburi` + `metadata.hr_departament` din departamente + roluri ca posturi 1/1), panou Departament/Birou, panou Rol (venituri + statut), panou Comisie (membri). Toate cu export PDF (tehnica clonării elementului în wrapper off-screen).

**Dark mode:** toggle în meniul dreapta, persistat în `localStorage('darkMode')`.

## 7. Logica financiară (fundamentul modulului Premium)

- `fin_columns`: array per rând, obiect `{id, name, type: 'valoare'|'procent'|'text', value}`.
- Calcul rând: `valoare` × ocupate; `procent` = (prima coloană `valoare` ca bază × %/100) × ocupate; `text` ignorat.
- Rol: totalul NU se înmulțește cu ocupate (o persoană).
- Totaluri per rând + general, coloane master generate automat (Map pe id-uri).

## 8. Instrumente admin (panou draggable, click-dreapta pe nod)

CRUD + mutare noduri; formulare dedicate per tip entitate (Instituție / Departament / Birou / Comisie / Rol); upload poză + logo; tabel HR cu coloane dinamice; tabel Surse; membri comisie; calitate bugetară (Ordonator principal/secundar/terțiar); `hr_unavailable`.

**Minor:** `handleAdminCreate` resetează `adminFormData` inconsistent (lipsesc `role_*`, `calitate_bugetara`, `hr_unavailable`).

## 9. WORKFLOW ACTIV — Populare masivă ROF (contractul principal de colaborare)

**Context:** robotul AI in-app a fost abandonat. Acum: utilizatorul creează nodurile manual, apoi folosește asistentul (Claude) pentru extragerea din ROF.

**Pașii:**
1. Utilizatorul creează nodurile în aplicație conform organigramei de pe site-ul instituției.
2. Rulează în Supabase SQL-ul de extracție (varianta cu UNION include și rădăcina):

```sql
SELECT i.nume AS nume_nod, 'Instituție' AS tip_nod
FROM institutii i WHERE i.id = 'ID_INSTITUTIE'
UNION ALL
SELECT o.node_name AS nume_nod,
  CASE WHEN o.is_institution THEN 'Instituție'
       WHEN o.is_department THEN 'Departament'
       WHEN o.is_office THEN 'Birou'
       WHEN o.is_committee THEN 'Comisie'
       ELSE 'Rol' END AS tip_nod
FROM organograms o WHERE o.institutie_id = 'ID_INSTITUTIE'
ORDER BY tip_nod, nume_nod;
```

3. Îi dă asistentului: rezultatul SQL + **PDF-ul ROF atașat în chat**.
4. Asistentul citește ROF, caută per nod capitolul/articolele, scrie rezumat atribuții + referință reglementare (format: `R.O.F. Art. X, alin. (Y), lit. Z`), returnează JSON.
5. Utilizatorul lipește JSON-ul în instrumentul de Populare Masivă (cu instituția deschisă în Dashboard) și apasă butonul.

**Contract JSON (`injectBulkJson`):**
```json
[
  {
    "nume_nod": "Direcția Generală Administrație",
    "rol": "rezumatul atribuțiilor din ROF...",
    "department_rof": "R.O.F. Art. 5, alin. (2)",
    "role_reglementare": "R.O.F. Art. 4",
    "role_baza_legala": "HG nr. X/2023",
    "role_cod_cor": "111101"
  }
]
```

**Mapare:** `rol` → col. `rol` + `metadata.rol`; `department_rof` → `metadata.rof` (Instituție/Dept/Birou/Comisie); `role_reglementare` → `metadata.reglementare`; `role_baza_legala` → `metadata.baza_legala`; `role_cod_cor` → `metadata.cod_cor` (Roluri).

**Reguli de matching (instrument):** nume normalizat (fără diacritice, lowercase); se caută DOAR în sub-arborele deschis (`currentRootId`); TOATE nodurile cu același nume primesc aceleași date; câmpurile absente NU suprascriu; tabel țintă: `institutii` dacă `parent_id === null`, altfel `organograms`.

**Bug de verificat:** `parent_id === null` (strict) nu prinde `undefined` → posibil UPDATE pe tabela greșită pt rădăcină. Fix: `== null`. De testat dacă rădăcina s-a populat vreodată cu succes.

**Test de consistență recomandat:** confirmă că `saveAdminNode` (formular manual) scrie în ACELAȘI chei metadata (`metadata.rof` etc.) și că panourile de profil citesc de acolo.

## 10. Decizii luate

1. **Robotul AI + parserul (serverless) sunt scoase din uz** — popularea se face prin asistent AI în chat (workflow §9). De șters: `api/robot.js`, `api/parser.js`, cheile Gemini/OpenRouter din Vercel, deps `@google/generative-ai`.
2. Prioritate pe reparațiile auth/RLS înainte de funcționalități noi (doar dacă RLS lipsește — altfel backup-ul prioritar e §9).

## 11. Backlog prioritar

| Pr. | Problemă | Unde |
|---|---|---|
| P0 | Verificare/implementare RLS pe toate tabelele | Supabase |
| P0 | Fallback fail-open → `'vizitator'` (fail-closed) | `useAuth.js` |
| P0 | Trigger DB `handle_new_user` pt `profiles` la signup (necesită verificare dacă există) | Supabase SQL |
| P1 | Race condition login→dashboard (flag `roleLoaded`) | `useAuth.js` |
| P1 | `openAuth(isLogin)` ignoră parametrul în HomeView (AuthModal suportă deja `initial-mode`) | `HomeView.vue` |
| P1 | Link-uri moarte Disclaimer/Instrucțiuni | `HomeView.vue` |
| P2 | Curățenie: `lib/supabase.js`, `counter.js`, console.log-uri, fișier accidental "nano vercel.json" | diverse |
| P2 | Refactor Dashboard monolit → componente/composables | `Dashboard.vue` |
| P2 | Ștergere cont: clientul nu poate șterge din `auth.users` → necesar Edge Function cu service role | `handleDeleteAccount` |
| P2 | Reset inconsistnt `adminFormData` la Create | `Dashboard.vue` |

## 12. Standarde de cod stabilite în conversație

- Limba UI: română. Comentarii în cod: română.
- Fallback-uri de securitate: fail-closed (acces restricționat la eroare).
- Chei: publishable OK în client; service role DOAR pe server; de preferat env vars, nu hardcodate.

## 13. NECUNOSCUTE — de cerut la următoarea sesiune

1. **Schema Supabase + status RLS** (critic!): `select tablename, rowsecurity from pg_tables where schemaname='public';` + coloanele `organograms` și `profiles`; există trigger pe `auth.users`?
2. Conținutul: `Educatie.vue`, `Analize.vue`, `SunburstChart.vue`, `TreemapChart.vue`, `DynamicFinTable.vue`.
3. Restul script-ului din `Dashboard.vue` (după `handleAdminEdit`): `saveAdminNode`, `handleAdminDelete/Move`, `loadRootNodes`, `handleLogout`, `handleDeleteAccount`, `runDataRobot`, `injectManualJson`, `selectJudet/Localitate`, `selectView` etc.
4. Confirmare dacă rădăcina (`institutii`) s-a populat vreodată cu succes via bulk (testul bug-ului `=== null`).

## 14. Cum să continui o conversație nouă

Lipește acest document la începutul chatului + spune ce vrei să lucrezi. Dacă lucrăm la populare ROF: atașează PDF-ul ROF + rezultatul SQL.

---

Câteva indicații de folosire:

1. **Salvează-l ca fișier real** (`STATGRAPH_CONTEXT.md` în proiect) — așa îl poți versiona în git și actualiza după fiecare sesiune importantă de lucru.
2. **Actualizează-l după sesiuni productive** — când rezolvăm un P0 sau stabilim o decizie nouă, adaugi o linie la §10/§11. Documentul viu e mai valoros decât unul perfect.
3. **Nu trebuie re-trimis integral la fiecare mesaj** — doar la începutul chatului nou.



Regulă de lucru (de la proprietar): un singur pas per mesaj. Explicații scurte. Nu trecem la pasul următor până când pasul curent e confirmat de proprietar. Livrări mari de cod → pe fragmente.

15. ACTUALIZĂRI — sesiuni ulterioare
15.1 Populare DNSC — COMPLETĂ ✅ (63/63)
Workflow validat: SQL recursiv + PDF ROF → JSON → injectBulkJson
Format referință: „R.O.F. Cap. X.Y" (ROF structurat pe capitole)
La nodurile tip INSTITUȚIE: atributele se scriu în câmpul „Descriere rol" (col. rol)
LECȚIE: salvarea prin formular SUPRASCRIE metadata (a șters metadata.rof!) —după bulk NU salva prin formular; corecții = bulk refăcut sau UPDATE SQL
CUI DNSC: 28598894 (confirmat e-licitatie; de re-verificat pe anaf.ro)
15.2 Landing page NOU — implementat și pe producție ✅
HomeView.vue rescris integral (dark premium, canvas tricolor, organigramă-demo SVGcu desenare la scroll, piloni ca organigramă, misiune, CTA)
Buton mapare: nav „Accesează platforma" → vizitator pe Dashboard; „Vezi cum arată" →AuthModal LOGIN; „Creează cont gratuit" → AuthModal REGISTER (fix initialMode aplicat)
FIX main.css: body,html avea height:100%; overflow:hidden (moștenire landing vechi)→ min-height:100%; overflow-x:hidden — aceasta bloca scroll-ul paginii noi
15.3 AuthModal redesign ✅
Dark premium, responsive, tricolor, toggle parolă, autocomplete, mesaje prietenoase
Dimensiuni calibrate de proprietar (max-width 580, padding propriu, dot tricoloraliniat manual cu titlul, bara .card-tri poziționată manual)
LECȚIE: reset-ul .home-wrapper * { padding:0 } din HomeView suprascria cardul(modalul e copil) → FIX: AuthModal mutat AFARĂ din .home-wrapper (root multiplu)
15.4 AUTOMATIZARE — nivelul 1+2 ✅
FIX injectBulkJson: parent_id == null (era ===, rata rădăcini cu undefined)
Playbook: docs/rof-playbook.md (workflow complet + SQL + contract JSON + avertismente)
Script src/scripts/validate-bulk-json.js (validare pre-populare, în consola)
BUTON NOU „🔍 Verificare încărcare date" în panoul Admin: numără nodurile cu/fărădate DOAR în sub-arborele deschis; rezultat în alert
LECȚIE CRITICĂ: Dashboard are template EXTERN (dashboard-template.html) → funcțiilenoi apelate din butoanele template-ului trebuie expuse global:window.numeFunctie = numeFunctie; + buton cu onclick="numeFunctie()"(Nu @click Vue — nu vede funcția din script setup când template e separat!)
DLAF populat 16/16 ✅ (HG 738/2011, root ID 441af994-...)
Nod ratat la primul bulk → re-populat individual (verificare prin buton a confirmat)
15.5 Roadmap automatizare (agreed)
Nivel 3 (următor): populare HR din Stat de Funcții + contacte din surse primare + validare CUINivel 4 (la 10+ instituții): monitorizare modificări ROF, nod_historyNivel 5 (la 30+): extragere AI serverless, DOAR extragere, validare umanăPRINCIPIU: „AI pregătește, omul validează, instrumentul scrie"

15.6 Regulă de lucru (proprietar)
Un singur pas per mesaj. Explicații scurte. Confirmare înainte de pasul următor.Livrări mari de cod → pe fragmente de ~200 linii.


16. CONTRACT JSON POPULARE (final, validat pe DNSC + DLAF)
16.1 Structura completă — toate câmpurile acceptate de injectBulkJson
[ { "nume_nod": "Denumirea exactă a nodului din DB (cheie de potrivire, nu se scrie)",

// --- TEXT (ca până acum) ---"rol": "rezumat atribuții...",            // → col. rol + metadata.rol"department_rof": "R.O.F. Cap. X",        // → metadata.rof (Inst/Dept/Birou/Comisie)"role_reglementare": "R.O.F. Art. X",     // → metadata.reglementare (Rol)"role_baza_legala": "...",                // → metadata.baza_legala (Rol)"role_cod_cor": "...",                    // → metadata.cod_cor (Rol, doar dacă apare în doc)// --- HR INSTITUȚIE (nod cu date personale centralizate) ---// → tabela date_joburi (delete + insert pe nodul respectiv)"hr_rows": [  { "functie": "Director",                // OBLIGATORIU (NOT NULL în DB)    "ocupate": 1, "vacante": 0,    "statut": "Activ",                    // opțional, default Activ    "observatii": "",    "finColumns": [                       // veniturile rândului      { "name": "Salariu de bază - brut", "type": "valoare", "value": 13724 }    ] }],// --- HR DEPARTAMENT/BIROU (posturi defalcate pe nod) ---// → metadata.hr_departament (păstrează restul metadata!)"hr_departament": [  { "functie": "Consilier", "total": 10, "ocupate": 8, "vacante": 2,    "observatii": "", "finColumns": [ ...same format... ] }],// --- HR ROL ---// → metadata.role_statut + metadata.role_fin_columns"role_statut": "Activ" | "Vacant","role_fin_columns": [ { "name": "...", "type": "valoare", "value": 9000 } ],// --- COMISIE ---"committee_members": [ { "nume": "", "rol_in_comisie": "", "functia_de_baza": "" } ]
}]

16.2 Reguli de CONȚINUT (extragerea din documente)
UN RÂND = O VALOARE per venit. La intervale (min–max):
scriem DOAR minimul, numit „Salariu minim de bază - brut"
MAXIMUL SE IGNORĂ COMPLET (nu se scrie nicăieri — nici în observații)
motiv: algoritmul de calcul ADUNĂ toate valorile din finColumns
Veniturile = VALORI FIXE din document (nu procente) — proprietarul vrea sumele exacte
funcție obligatorie: rândurile fără „functie" sunt arse (NOT NULL în date_joburi)
Tabel centralizat (toate posturile pe rădăcină) → hr_rows pe nodul rădăcinăTabel defalcat → hr_rows/hr_departament pe fiecare nod cu posturile lui
CUI/contacte: doar din surse primare (antet document oficial, e-licitatie), niciodată din memorie
Cod COR: doar dacă apare în document
16.3 Reguli de MATCHING & EXECUȚIE
nume normalizat (fără diacritice, lowercase, trim); toate nodurile cu același nume primesc datele
doar sub-arborele DESCHIS în Dashboard e căutat — instituția trebuie deschisă ca rădăcină
hr_rows: DELETE + INSERT pe nod (zero duplicate); alte câmpuri: merge în metadata (păstrează restul)
după bulk NU salva nodurile prin formular (suprascrie metadata!)
verificare post-populare: butonul „🔍 Verificare încărcare date" din panoul Admin
16.4 PROTOCOL CU ASISTENTUL (la fiecare instituție nouă)
Proprietarul trimite: rezultat SQL (sub-arbore) + documentele (ROF, tabel salarizare, Stat de Funcții)
Asistentul extrage și returnează JSON conform §16.1-16.2 — proprietarul confirmă deciziilede interpretare (ce e venit, ce e spor, ce se ignoră) ÎNAINTE de aplicare
Proprietarul aplică + verifică cu butonul + panoul „D"
Lecție tehnică veche, valabilă: funcții noi pentru template extern → window.expose