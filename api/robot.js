export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metoda nepermisa' });
  }

  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    return res.status(500).json({ error: 'Cheia API lipseste din Vercel.' });
  }

  try {
    const { nodeName, nodeType, rawText, files } = req.body;
    
    let content = [];

    // 1. Promptul (Același ca înainte)
    let prompt = `Ești un expert în administrația publică din România. Analizează documentele/textul de mai jos pentru entitatea numită "${nodeName}" (Tip: ${nodeType}).
    Reguli:
    1. Extrage datele specifice STRICT din documentele sau textul furnizat.
    2. Dacă o informație LIPSEȘTE, încearcă să folosești-ți cunoștințele generale (ex: găsește Codul COR).
    3. Dacă NU EȘTI 100% SIGUR de o informație exactă (ex: CUI, Telefon), returnează "null". ESTE INTERZIS SĂ INVENTEZI DATE.
    4. Returnează RĂSPUNSUL STRICT într-un JSON valid.\n\n`;

    if (nodeType === 'Instituție') {
      prompt += `{ "cui": "", "acronim": "", "calitate_bugetara": "", "adresa": "", "telefon": "", "email": "", "website": "", "rol": "", "department_rof": "", "hr_rows": [{"functie":"", "ocupate":0, "vacante":0, "total":0, "salariu_baza":0}] }`;
    } else if (nodeType === 'Departament' || nodeType === 'Birou') {
      prompt += `{ "department_rof": "", "rol": "", "hr_rows": [{"functie":"", "ocupate":0, "vacante":0, "total":0, "salariu_baza":0}] }`;
    } else if (nodeType === 'Rol') {
      prompt += `{ "role_cod_cor": "", "role_baza_legala": "", "role_reglementare": "", "role_gradatie_treapta": "", "rol": "", "fin_columns": [{"name":"Salariu de bază", "type":"valoare", "value":0}] }`;
    } else if (nodeType === 'Comisie') {
      prompt += `{ "department_rof": "", "rol": "", "committee_members": [{"nume":"", "rol_in_comisie":"", "functia_de_baza":""}] }`;
    }

    content.push({ type: 'text', text: prompt });

    if (files && files.length > 0) {
      files.forEach(file => {
        content.push({ type: 'image_url', image_url: { url: `data:${file.mimeType};base64,${file.data}` } });
      });
    }

    if (rawText && rawText.trim().length > 0) {
      content.push({ type: 'text', text: `TEXT BRUT:\n${rawText}` });
    }

    // 2. NOU: Căutăm LIVE ce modele gratuite sunt disponibile pe OpenRouter chiar acum!
    const modelsRes = await fetch('https://openrouter.ai/api/v1/models');
    const modelsData = await modelsRes.json();
    
    // Filtrăm doar modelele gratuite și le prioritizăm pe cele mai bune
    const priorityKeywords = ['deepseek', 'gemini', 'llama-3.3', 'llama-3.2', 'qwen', 'mistral'];
    let freeModels = modelsData.data.filter(m => m.id.includes(':free')).map(m => m.id);
    
    // Le sortăm astfel încât cele din lista de priorități să fie încercate primele
    freeModels.sort((a, b) => {
      let aP = priorityKeywords.findIndex(p => a.toLowerCase().includes(p));
      let bP = priorityKeywords.findIndex(p => b.toLowerCase().includes(p));
      return (aP === -1 ? 99 : aP) - (bP === -1 ? 99 : bP);
    });

    if (freeModels.length === 0) {
      throw new Error("OpenRouter nu are niciun model gratuit disponibil momentan.");
    }

    let lastError = null;

    // 3. Bucla de reîncercare: Încearcă fiecare model gratuit găsit
    for (const model of freeModels) {
      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://stat-graph-vue-v1-0.vercel.app',
            'X-Title': 'Statgraph Robot'
          },
          body: JSON.stringify({
            model: model,
            messages: [{ role: 'user', content: content }]
          })
        });

        const data = await response.json();

        // Dacă modelul e ocupat sau indisponibil, trecem la următorul
        if (!response.ok || (data.error && (data.error.message.includes('unavailable') || data.error.message.includes('high demand') || data.error.message.includes('rate limit') || data.error.message.includes('endpoints')))) {
          lastError = data.error?.message || `Modelul ${model} a eșuat`;
          continue; 
        }

        // Dacă am primit un răspuns valid, îl returnăm
        let aiText = data.choices?.[0]?.message?.content || '';
        if (aiText) {
          aiText = aiText.replace(/```json/g, '').replace(/```/g, '').trim();
          return res.status(200).json({ result: aiText });
        }

      } catch (err) {
        lastError = err.message;
      }
    }

    throw new Error(`Toate modelele AI gratuite sunt momentan indisponibile. Încearcă peste 5 minute. (Ultima eroare: ${lastError})`);

  } catch (error) {
    console.error('Eroare Robot:', error);
    return res.status(500).json({ error: error.message });
  }
}