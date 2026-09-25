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

    REGULI PENTRU TABELUL HR (hr_rows):
    6. Citește tabelul cu posturi și returnează o listă BRUTĂ cu FIECARE post în parte. NU le grupa.
    7. Pentru fiecare post, extrage: "functie" (denumirea exactă), "gradatie" (ex: 4, sau null dacă nu are), "salariu" (doar cifra, ex: 9195), "observatie" (orice notă specială din tabel, ex: "cfp", "spor handicap", sau null) și "statut" ("Activ" dacă e ocupat, "Vacant" dacă e liber).
    8. Ignoră sporurile și alte indemnizații.
    9. Dacă posturile au aceeași Funcție și aceeași Gradație, dar Salariu DIFERIT, creează rânduri SEPARATE, cu aceeași denumire de funcție. În câmpul "observatie" pune motivul separării (ex: "cfp", "spor handicap", "indm doctor") sau salariul de bază dacă nu are notă specială.

    10. Returnează RĂSPUNSUL STRICT într-un JSON valid, fără text adițional.\n\n`;

    if (nodeType === 'Instituție') {
      prompt += 'Returnează JSON cu structura: { "cui": "", "acronim": "", "calitate_bugetara": "", "adresa": "", "telefon": "", "email": "", "website": "", "rol": "", "department_rof": "", "hr_rows": [{"functie":"", "gradatie":"", "salariu":"", "observatie":"", "ocupate":1, "vacante":0}], "fin_columns_salarii": [] }';
    } else if (nodeType === 'Departament' || nodeType === 'Birou') {
      prompt += 'Returnează JSON cu structura: { "department_rof": "", "rol": "", "hr_rows": [{"functie":"", "gradatie":"", "salariu":"", "observatie":"", "ocupate":1, "vacante":0}], "fin_columns_salarii": [] }';
    } else if (nodeType === 'Rol') {
      prompt += 'Returnează JSON cu structura: { "role_cod_cor": "", "role_baza_legala": "", "role_reglementare": "", "role_gradatie_treapta": "", "rol": "", "fin_columns_salarii": [{"functie":"", "venituri":[{"name":"", "type":"", "value":0}]}] }';
    } else if (nodeType === 'Comisie') {
      prompt += 'Returnează JSON cu structura: { "department_rof": "", "rol": "", "committee_members": [{"nume":"", "rol_in_comisie":"", "functia_de_baza":""}] }';
    }

    let content = [{ type: 'text', text: prompt }];

    const addFiles = (label, fileList) => {
      if (fileList && fileList.length > 0) {
        content.push({ type: 'text', text: `--- DOCUMENTE: ${label.toUpperCase()} ---` });
        fileList.forEach(file => {
          if (file.mimeType === 'application/pdf') {
            content.push({ type: 'file', file: { filename: 'document.pdf', file_data: `data:application/pdf;base64,${file.data}` } });
          } else {
            content.push({ type: 'image_url', image_url: { url: `data:${file.mimeType};base64,${file.data}` } });
          }
        });
      }
    };

    addFiles('1. CONTACT', files.contact);
    addFiles('2. ROF', files.rof);
    addFiles('3. STAT FUNCTII HR', files.hr);
    addFiles('4. SALARII', files.salarii);

    const modelsRes = await fetch('https://openrouter.ai/api/v1/models');
    const modelsData = await modelsRes.json();
    
    const priorityKeywords = ['gemini-2.0-flash', 'llama-3.2-11b-vision', 'llama-3.2-90b-vision', 'qwen-2.5-vl', 'llama-3.3'];
    
    let freeVisionModels = modelsData.data.filter(m => 
      m.id.includes(':free') && 
      m.architecture && 
      m.architecture.input_modalities && 
      m.architecture.input_modalities.includes('image')
    ).map(m => m.id);
    
    freeVisionModels.sort((a, b) => {
      let aP = priorityKeywords.findIndex(p => a.toLowerCase().includes(p));
      let bP = priorityKeywords.findIndex(p => b.toLowerCase().includes(p));
      return (aP === -1 ? 99 : aP) - (bP === -1 ? 99 : bP);
    });

    if (freeVisionModels.length === 0) {
      let freeTextModels = modelsData.data.filter(m => m.id.includes(':free')).map(m => m.id);
      freeVisionModels = freeTextModels;
    }

    let lastError = null;

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
          lastError = data.error?.message;
          await new Promise(r => setTimeout(r, 3000)); 
          continue; 
        } else if (isUnavailable) {
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