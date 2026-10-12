// ============================================================
// VALIDARE PRE-POPULARE — Statgraph
// Utilizare (în DevTools/Consolă, cu Dashboard deschis pe
// instituția țintă): lipește tot conținutul acestui fișier,
// apoi rulează: validateBulkJson(`[...JSON-ul tău aici...]`)
// ============================================================

function validateBulkJson(rawJson) {
  const errors = [];
  const warnings = [];
  const matches = [];

  // 1. Parsare
  let data;
  try {
    data = JSON.parse(rawJson.replace(/```json/g, '').replace(/```/g, '').trim());
  } catch (e) {
    console.error('❌ JSON invalid:', e.message);
    return;
  }
  if (!Array.isArray(data)) {
    console.error('❌ JSON-ul trebuie să fie un array de obiecte.');
    return;
  }

  // 2. Normalizare (identică cu cea din injectBulkJson)
  const clean = s => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

  // 3. Luăm nodurile din memoria Dashboard-ului
  const nodes = window.__statgraphNodes || [];
  if (nodes.length === 0) {
    console.warn('⚠️ Nu am găsit noduri. Rulează scriptul cu Dashboard-ul deschis pe instituție (vezi nota de activare mai jos).');
  }

  const rootStr = String(window.__statgraphRootId || '');

  // 4. Verificăm fiecare intrare din JSON
  data.forEach((item, i) => {
    const name = item.nume_nod || item.nume;
    if (!name) { errors.push(`[${i}] intrare fără nume_nod`); return; }

    // are cel puțin un câmp util de scris?
    const hasContent = item.rol || item.department_rof || item.role_reglementare || item.role_baza_legala || item.role_cod_cor;
    if (!hasContent) warnings.push(`"${name}": fără niciun câmp de scris (doar nume)`);

    // căutare în nodurile curente
    const found = nodes.filter(n =>
      (String(n.parent_id) === rootStr || true) && // simplificare: căutăm în tot setul încărcat
      clean(n.nume || n.node_name) === clean(name)
    );

    if (found.length === 0) {
      errors.push(`"${name}": NU s-a găsit în nodurile încărcate`);
    } else if (found.length > 1) {
      warnings.push(`"${name}": AMBIGU — ${found.length} noduri cu acest nume vor primi ACELEAȘI date`);
    } else {
      matches.push(name);
    }
  });

  // 5. Raport
  console.log('════════ RAPORT VALIDARE ════════');
  console.log(`✅ Se vor potrivi: ${matches.length}`);
  console.log(`⚠️ Avertismente: ${warnings.length}`);
  warnings.forEach(w => console.warn('  ⚠️', w));
  console.log(`❌ Erori: ${errors.length}`);
  errors.forEach(e => console.error('  ❌', e));
  console.log('══════════════════════════════════');

  if (errors.length === 0) console.log('✅ SAFE — poți lipi JSON-ul în instrumentul de populare.');
  else console.log('🛑 NU popula încă — repară erorile de mai sus (verifică numele vs. SQL).');
}

// ============================================================
// ACTIVARE: pentru ca scriptul să vadă nodurile, adaugă în
// Dashboard.vue (injectBulkJson, la începutul funcției) o linie:
//   window.__statgraphNodes = allNodesList.value;
//   window.__statgraphRootId = String(currentRootId.value);
// (vezi Pasul 4 — o facem separat)
// ============================================================