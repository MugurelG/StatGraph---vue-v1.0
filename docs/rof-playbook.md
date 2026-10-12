PLAYBOOK — Populare instituție nouă (workflow ROF)
Pașii, în ordine
Creezi nodurile manual în aplicație (conform organigramei de pe site-ul instituției)
Rulezi SQL-ul de extracție (mai jos) în Supabase → obții lista nodurilor
Îmi trimiți în chat: rezultatul SQL + PDF-ul ROF atașat
Eu returnez JSON-ul de populare (rezumate + referințe)
Verifici JSON-ul cu scriptul de validare (Pasul 3 din plan)
Intri în Dashboard → faci drill-down până la rădăcina instituției(OBLIGATORIU: instrumentul caută doar în sub-arborele deschis)
Lipești JSON-ul în „6. Populare Masivă" și apeși butonul
Verifici 2-3 noduri cu badge-ul „D" — rezumatul + referința apar în panou
SQL de extracție (recursiv, pornește de la nodul instituției)
WITH RECURSIVE arbore AS ( SELECT id, parent_id, node_name, CASE WHEN is_institution = true THEN 'Instituție' WHEN is_department = true THEN 'Departament' WHEN is_office = true THEN 'Birou' WHEN is_committee = true THEN 'Comisie' ELSE 'Rol' END AS tip_nod FROM organograms WHERE id = 'ID_NOD_RADACINA' UNION ALL SELECT o.id, o.parent_id, o.node_name, CASE WHEN o.is_institution = true THEN 'Instituție' WHEN o.is_department = true THEN 'Departament' WHEN o.is_office = true THEN 'Birou' WHEN o.is_committee = true THEN 'Comisie' ELSE 'Rol' END FROM organograms o JOIN arbore a ON o.parent_id::text = a.id::text)SELECT a.node_name AS nume_nod, a.tip_nod, p.node_name AS parinteFROM arbore aLEFT JOIN organograms p ON a.parent_id::text = p.id::textORDER BY nume_nod, tip_nod;

Contract JSON (ce înlocuiește injectBulkJson)
[ { "nume_nod": "...", // cheie de potrivire (nu se scrie) "rol": "rezumat atribuții...", // → col. rol + metadata.rol "department_rof": "R.O.F. Cap. X.Y", // → metadata.rof (Inst/Dept/Birou/Comisie) "role_reglementare": "R.O.F. Cap. X.Y", // → metadata.reglementare (Rol) "role_baza_legala": "...", // → metadata.baza_legala (Rol) "role_cod_cor": "..." // → metadata.cod_cor (Rol) — DOAR dacă apare în ROF }]

Reguli de matching (instrumentul)
Numele se normalizează (fără diacritice, lowercase) — matching iertător
Se caută DOAR în sub-arborele deschis curent
TOATE nodurile cu același nume primesc aceleași date
Câmpurile absente din JSON NU suprascriu nimic
Rădăcina: parent_id == null → scrie în „institutii", altfel în „organograms"
Reguli de conținut (ce scriu eu în JSON)
Format referință: „R.O.F. Cap. X.Y" (sau Art. dacă ROF-ul e structurat pe articole)
La nodurile tip INSTITUȚIE: atributele se scriu în câmpul „Descriere rol"
Rezumat: comprehensiv, toate domeniile de competență din subcapitol
Cod COR: DOAR dacă apare în document, niciodată „din memorie"
CUI: doar din surse primare (e-licitatie, statut) + validare checksum
⚠️ Avertismente (lecții DNSC)
DUPĂ populare masivă NU salva nodurile prin formular — formularul suprascriemetadata (a șters metadata.rof la DNSC!). Corecțiile: refac bulk cu 1 nod, sau UPDATE SQL
La „Înlocuiește" tabele: rădăcina cu parent_id undefined mergea greșit — FIXAT cu ==
Verifică duplicate de nume înainte de populare (SQL GROUP BY HAVING COUNT > 1)
Checklist final după populare
[ ] Mesaj instrument: „X noduri actualizate" — X = nr. noduri din SQL[ ] Panou de detalii pe 2-3 noduri (1 departament + 1 rol + rădăcina)[ ] Rădăcina: „Descriere rol" vizibilă + referința prezentă