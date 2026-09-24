export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metoda nepermisa' });
  }

  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    return res.status(500).json({ error: 'Cheia API lipseste din Vercel.' });
  }

  try {
    const { nodeName, nodeType, files } = req.body;
    
    // 1. Construim mesajul pentru AI cu Regulile de Extrager (IDP)
    let prompt = `Ești un motor IDP (Intelligent Document Processing) pentru administrația publică din România.
    Analizezi documentele furnizate pentru entitatea: "${nodeName}" (Tip: ${nodeType}).

    Reguli ABSOLUTE (Anti-Halucinație):
    1. Pentru Adresă, Telefon, Email, Website, Atribuții, Reglementare, Tabel HR, Salarii: Extrage datele STRICT din documentele furnizate. Dacă nu există în documente, pune "null". ESTE INTERZIS SĂ INVENTEZI.
    2. Pentru CUI, Acronim, Calitate Bugetară, Cod COR, Bază Legală: Dacă nu le găsești în documente, poți folosi cunoștințele tale generale să le generezi, dar doar dacă ești 100% sigur. Dacă nu ești sigur, pune "null".
    3. Curăță datele extrase (ex: dacă scrie "Tel: 021.123", pune doar "021.123").
    4. Returnează RĂSPUNSUL STRICT într-un JSON valid, fără text adițional.\n\n`;

    if (nodeType === 'Instituție') {
      prompt += `JSON-ul trebuie să aibă exact această structură:
      {
        "cui": "număr sau null",
        "acronim": "scurtare sau null",
        "calitate_bugetara": "Ordonator principal/secundar/terțiar/Nu se aplică",
        "adresa": "adresa completă",
        "telefon": "telefon",
        "email": "email",
        "website": "site web",
        "rol": "rezumatul atribuțiilor generale din ROF",
        "department_rof": "reglementarea (ex: Hotărârea X/2020)",
        "hr_rows": [ { "functie": "Nume post", "ocupate": 0, "vacante": 0, "total": 0 } ],
        "fin_columns_salarii": [ { "functie": "Nume post", "venituri": [ {"name": "Salariu de bază", "type": "valoare", "value": 0}, {"name": "Spor", "type": "procent", "value": 15} ] } ]
      }`;
    } else if (nodeType === 'Departament' || nodeType === 'Birou') {
      prompt += `JSON-ul trebuie să aibă exact această structură:
      {
        "department_rof": "Articolul și capitolul din ROF care reglementează acest departament (ex: Cap. II, Art. 15)",
        "rol": "rezumatul complet al atribuțiilor departamentului din ROF",
        "hr_rows": [ { "functie": "Nume post", "ocupate": 0, "vacante": 0, "total": 0 } ],
        "fin_columns_salarii": [ { "functie": "Nume post", "venituri": [ {"name": "Salariu de bază", "type": "valoare", "value": 0} ] } ]
      }`;
    } else if (nodeType === 'Rol') {
      prompt += `JSON-ul trebuie să aibă exact această structură:
      {
        "role_cod_cor": "Codul COR din 6 cifre",
        "role_baza_legala": "Legea sau HG care reglementează funcția",
        "role_reglementare": "Articolul specific din ROF",
        "role_gradatie_treapta": "Gradația sau treapta (dacă există)",
        "rol": "rezumatul complet al atribuțiilor rolului",
        "fin_columns_salarii": [ { "venituri": [ {"name": "Salariu de bază", "type": "valoare", "value": 0}, {"name": "Spor vechime", "type": "procent", "value": 15} ] } ]
      }`;
    } else if (nodeType === 'Comisie') {
      prompt += `JSON-ul trebuie să aibă exact această structură:
      {
        "department_rof": "Baza legală de înființare a comisiei",
        "rol": "atribuțiile comisiei",
        "committee_members": [ { "nume": "Numele persoanei", "rol_in_comisie": "Președinte/Membru", "functia_de_baza": "Funcția din instituție" } ]
      }`;
    }

    // 2. Adăugăm fișierele și textul pentru AI (Format OpenAI Vision)
    let content = [{ type: 'text', text: prompt }];

    // Funcție pentru a adăuga fișierele cu eticheta lor
    const addFiles = (label, fileList) => {
      if (fileList && fileList.length > 0) {
        content.push({ type: 'text', text: `--- DOCUMENTE: ${label.toUpperCase()} ---` });
        fileList.forEach(file => {
          content.push({ type: 'image_url', image_url: { url: `data:${file.mimeType};base64,${file.data}` } });
        });
      }
    };

    addFiles('1. CONTACT', files.contact);
    addFiles('2. ROF', files.rof);
    addFiles('3. STAT FUNCTII HR', files.hr);
    addFiles('4. SALARII', files.salarii);

    // 3. Căutăm LIVE modele gratuite pe OpenRouter
    const modelsRes = await fetch('https://openrouter.ai/api/v1/models');
    const modelsData = await modelsRes.json();
    
    const priorityKeywords = ['gemini-2.0-flash', 'llama-3.3', 'llama-3.2', 'qwen', 'mistral', 'deepseek'];
    let freeModels = modelsData.data.filter(m => m.id.includes(':free')).map(m => m.id);
    
    freeModels.sort((a, b) => {
      let aP = priorityKeywords.findIndex(p => a.toLowerCase().includes(p));
      let bP = priorityKeywords.findIndex(p => b.toLowerCase().includes(p));
      return (aP === -1 ? 99 : aP) - (bP === -1 ? 99 : bP);
    });

    if (freeModels.length === 0) throw new Error("Nu există modele AI gratuite disponibile.");

    let lastError = null;

    // 4. Bucla de reîncercare pe modele
    for (const model of freeModels) {
      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://stat-graph-vue-v1-0.vercel.app',
            'X-Title': 'Statgraph IDP Robot'
          },
          body: JSON.stringify({
            model: model,
            messages: [{ role: 'user', content: content }]
          })
        });

        const data = await response.json();

        if (!response.ok || (data.error && (data.error.message.includes('unavailable') || data.error.message.includes('high demand') || data.error.message.includes('endpoints')))) {
          lastError = data.error?.message || `Modelul a eșuat`;
          continue; 
        }

        let aiText = data.choices?.[0]?.message?.content || '';
        if (aiText) {
          aiText = aiText.replace(/```json/g, '').replace(/```/g, '').trim();
          return res.status(200).json({ result: aiText });
        }

      } catch (err) {
        lastError = err.message;
      }
    }

    throw new Error(`Toate modelele AI gratuite sunt indisponibile. Încearcă peste 5 minute. (Eroare: ${lastError})`);

  } catch (error) {
    console.error('Eroare Robot:', error);
    return res.status(500).json({ error: error.message });
  }
}