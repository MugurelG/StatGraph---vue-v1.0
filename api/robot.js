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
    
    // 1. Construim mesajul pentru AI
    let prompt = `Ești un motor IDP (Intelligent Document Processing) pentru administrația publică din România.
    Analizezi documentele furnizate pentru entitatea: "${nodeName}" (Tip: ${nodeType}).

    Reguli ABSOLUTE (Anti-Halucinație):
    1. Pentru Adresă, Telefon, Email, Website, Atribuții, Reglementare, Tabel HR, Salarii: Extrage datele STRICT din documentele furnizate. Dacă nu există, pune "null". ESTE INTERZIS SĂ INVENTEZI.
    2. Pentru CUI, Acronim, Calitate Bugetară, Cod COR, Bază Legală: Dacă nu le găsești în documente, poți folosi cunoștințele tale generale, dar doar dacă ești 100% sigur. Dacă nu ești sigur, pune "null".
    3. Curăță datele extrase (ex: dacă scrie "Tel: 021.123", pune doar "021.123").
    4. Returnează RĂSPUNSUL STRICT într-un JSON valid.\n\n`;

    if (nodeType === 'Instituție') {
      prompt += `{ "cui": "", "acronim": "", "calitate_bugetara": "", "adresa": "", "telefon": "", "email": "", "website": "", "rol": "", "department_rof": "", "hr_rows": [{"functie":"", "ocupate":0, "vacante":0, "total":0}], "fin_columns_salarii": [{"functie":"", "venituri":[{"name":"", "type":"", "value":0}]}] }`;
    } else if (nodeType === 'Departament' || nodeType === 'Birou') {
      prompt += `{ "department_rof": "", "rol": "", "hr_rows": [{"functie":"", "ocupate":0, "vacante":0, "total":0}], "fin_columns_salarii": [{"functie":"", "venituri":[{"name":"", "type":"", "value":0}]}] }`;
    } else if (nodeType === 'Rol') {
      prompt += `{ "role_cod_cor": "", "role_baza_legala": "", "role_reglementare": "", "role_gradatie_treapta": "", "rol": "", "fin_columns_salarii": [{"venituri":[{"name":"", "type":"", "value":0}]}] }`;
    } else if (nodeType === 'Comisie') {
      prompt += `{ "department_rof": "", "rol": "", "committee_members": [{"nume":"", "rol_in_comisie":"", "functia_de_baza":""}] }`;
    }

    let content = [{ type: 'text', text: prompt }];

    // 2. Adăugăm fișierele (PDF/Imagini) în formatul corect pentru OpenRouter
    const addFiles = (label, fileList) => {
      if (fileList && fileList.length > 0) {
        content.push({ type: 'text', text: `--- DOCUMENTE: ${label.toUpperCase()} ---` });
        fileList.forEach(file => {
          if (file.mimeType === 'application/pdf') {
            // PDF-urile trebuie trimise ca 'file' în OpenRouter
            content.push({ type: 'file', file: { filename: 'document.pdf', file_data: `data:application/pdf;base64,${file.data}` } });
          } else {
            // Imaginile ca 'image_url'
            content.push({ type: 'image_url', image_url: { url: `data:${file.mimeType};base64,${file.data}` } });
          }
        });
      }
    };

    addFiles('1. CONTACT', files.contact);
    addFiles('2. ROF', files.rof);
    addFiles('3. STAT FUNCTII HR', files.hr);
    addFiles('4. SALARII', files.salarii);

    // 3. Căutăm LIVE modele gratuite CARE SUPORTĂ IMAGINI (Vision)
    const modelsRes = await fetch('https://openrouter.ai/api/v1/models');
    const modelsData = await modelsRes.json();
    
    const priorityKeywords = ['gemini-2.0-flash', 'llama-3.2-11b-vision', 'llama-3.2-90b-vision', 'qwen-2.5-vl', 'llama-3.3'];
    
    // Filtrăm doar modelele gratuite care au suport pentru imagini (input_modalities include 'image')
    let freeVisionModels = modelsData.data.filter(m => 
      m.id.includes(':free') && 
      m.architecture && 
      m.architecture.input_modalities && 
      m.architecture.input_modalities.includes('image')
    ).map(m => m.id);
    
    // Le sortăm după priorități
    freeVisionModels.sort((a, b) => {
      let aP = priorityKeywords.findIndex(p => a.toLowerCase().includes(p));
      let bP = priorityKeywords.findIndex(p => b.toLowerCase().includes(p));
      return (aP === -1 ? 99 : aP) - (bP === -1 ? 99 : bP);
    });

    // Dacă nu găsim modele Vision gratuite, cădem înapoi pe orice model gratuit (pentru text)
    if (freeVisionModels.length === 0) {
      let freeTextModels = modelsData.data.filter(m => m.id.includes(':free')).map(m => m.id);
      freeVisionModels = freeTextModels; // Folosim ce avem
    }

    let lastError = null;

    // 4. Bucla de reîncercare
    for (const model of freeVisionModels) {
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