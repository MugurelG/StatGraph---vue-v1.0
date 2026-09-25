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
    
     // 1. Construim mesajul pentru AI (Promptul Definitiv Combinat)
    let prompt = `Ești un motor IDP (Intelligent Document Processing) pentru administrația publică din România.
    Analizezi documentele furnizate pentru entitatea: "${nodeName}" (Tip: ${nodeType}).

    Reguli ABSOLUTE (Anti-Halucinație):
    1. Pentru Adresă, Telefon, Email, Website, Tabel HR, Salarii: Extrage datele STRICT din documentele furnizate de utilizator. Dacă nu există în documente, pune "null". ESTE INTERZIS SĂ INVENTEZI DATE DE CONTACT SAU FINANCIARE.
    2. Pentru Rol/Atribuții: Fă un rezumat DETALIAT ȘI COMPREHENSIV al tuturor articolelor din ROF care descriu atribuțiile. Nu rezuma doar prima propoziție. Acoperă toate domeniile de competență descrise în document.
    3. Pentru CUI, Bază legală și Cod COR: ESTE STRICT INTERZIS SĂ FOLOSEȘTI MEMORIA TA INTERNĂ. Trebuie să efectuezi o căutare pe internet (Web Search) pentru a găsi răspunsul corect și actual.
       - Pentru CUI: caută pe internet "Care este CUI-ul pentru ${nodeName}".
       - Pentru Bază legală: caută pe internet "Care este baza legală (Lege/HG) pentru ${nodeName}".
       - Pentru Cod COR: caută pe internet "Care este codul COR pentru funcția de ${nodeName}".
       Dacă nu găsești răspunsul pe internet, pune "null".
    4. Pentru Calitatea Bugetară: Dacă nu scrie clar în document, deduce logic (ex: un Minister sau o Agenție Națională = "Ordonator principal de credite", o Primărie sau Consiliu Local = "Ordonator terțiar de credite").
    5. Curăță datele extrase (ex: dacă scrie "Tel: 021.123", pune doar "021.123").

    REGULI SPECIALE PENTRU TABELUL HR (hr_rows):
    6. IGNORĂ complet coloanele cu salarii, sporuri, indemnizații sau alte drepturi salariale. NU include aceste valori în JSON pentru tabelul HR.
    7. Grupează posturile în rânduri pe baza a 3 elemente: 1. Funcția (Denumirea postului), 2. Gradația, 3. Salariul de bază (folosit DOAR ca criteriu de grupare, nu se afișează).
    8. Dacă mai multe posturi au aceeași Funcție, aceeași Gradație și același Salariu, grupează-le într-un SINGUR rând (ex: Total posturi = 8, Ocupate = 8, Vacante = 0).
    9. Dacă posturile au aceeași Funcție și aceeași Gradație, dar Salariu DIFERIT, creează rânduri SEPARATE, cu aceeași denumire de funcție (fără a adăuga nimic suplimentar în nume).
    10. Dacă posturile au aceeași Funcție, dar Gradație DIFERITĂ, creează rânduri separate și adaugă la denumirea funcției textul " - gradatie [nr]" (ex: "Consilier - gradatie 4").

    11. Returnează RĂSPUNSUL STRICT într-un JSON valid, fără text adițional.\n\n`;

      if (nodeType === 'Instituție') {
      prompt += `{ "cui": "", "acronim": "", "calitate_bugetara": "", "adresa": "", "telefon": "Toate numerele de telefon găsite, separate prin punct și virgulă (;)", "email": "Toate adresele de email găsite, separate prin punct și virgulă (;)", "website": "Doar domeniul principal (ex: https://www.site.ro), fără calea paginii", "rol": "", "department_rof": "", "hr_rows": [{"functie":"", "ocupate":0, "vacante":0, "total":0}], "fin_columns_salarii": [{"functie":"", "venituri":[{"name":"", "type":"", "value":0}]}] }`;
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

              const isRateLimited = data.error && data.error.message && data.error.message.includes('rate limited');
        const isUnavailable = !response.ok || (data.error && (data.error.message.includes('unavailable') || data.error.message.includes('high demand') || data.error.message.includes('endpoints')));

        if (isRateLimited) {
          // Dacă suntem limitați de citire PDF, așteptăm 3 secunde și reîncercăm ACELAȘI model
          lastError = data.error?.message;
          await new Promise(r => setTimeout(r, 3000)); 
          continue; 
        } else if (isUnavailable) {
          // Dacă modelul e ocupat, trecem la următorul
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