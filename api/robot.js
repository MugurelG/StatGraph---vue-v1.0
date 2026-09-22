export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metoda nepermisa' });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  
  // VERIFICARE DEBUG: Vedem exact ce cheie citește Vercel (primele 6 și ultimele 4 caractere)
  const maskedKey = apiKey ? `${apiKey.substring(0, 6)}...${apiKey.slice(-4)}` : 'LIPSESTE COMPLET';
  
  if (!apiKey) {
    return res.status(500).json({ error: `Cheia API lipseste din Vercel. (Cheie detectata: ${maskedKey})` });
  }

  try {
    const { nodeName, nodeType, rawText, files } = req.body;
    
    // Construim conținutul pentru OpenRouter (format standard OpenAI)
    let content = [];

    // 1. Adăugăm Promptul (Instrucțiunile)
    let prompt = `Ești un expert în administrația publică din România. Analizează documentele/textul de mai jos pentru entitatea numită "${nodeName}" (Tip: ${nodeType}).
    Reguli:
    1. Extrage datele specifice pentru acest tip de nod STRICT din documentele sau textul furnizat de utilizator.
    2. Dacă o informație LIPSEȘTE din documente, încearcă să folosește-ți cunoștințele generale (ex: găsește Codul COR, Baza legală).
    3. Dacă NU EȘTI 100% SIGUR de o informație exactă (ex: CUI, Telefon, Adresa exactă), returnează valoarea "null". ESTE STRICT INTERZIS SĂ INVENTEZI DATE FINANCIARE SAU DE IDENTITATE.
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
        "rol": "rezumatul atribuțiilor generale",
        "department_rof": "reglementarea (ex: Hotărârea X/2020)",
        "hr_rows": [ { "functie": "Nume post", "ocupate": 0, "vacante": 0, "total": 0, "salariu_baza": 0 } ]
      }`;
    } else if (nodeType === 'Departament' || nodeType === 'Birou') {
      prompt += `JSON-ul trebuie să aibă exact această structură:
      {
        "department_rof": "Articolul și capitolul din ROF care reglementează acest departament (ex: Cap. II, Art. 15)",
        "rol": "rezumatul complet al atribuțiilor departamentului",
        "hr_rows": [ { "functie": "Nume post", "ocupate": 0, "vacante": 0, "total": 0, "salariu_baza": 0 } ]
      }`;
    } else if (nodeType === 'Rol') {
      prompt += `JSON-ul trebuie să aibă exact această structură:
      {
        "role_cod_cor": "Codul COR din 6 cifre",
        "role_baza_legala": "Legea sau HG care reglementează funcția",
        "role_reglementare": "Articolul specific din ROF",
        "role_gradatie_treapta": "Gradația sau treapta (dacă există)",
        "rol": "rezumatul complet al atribuțiilor rolului",
        "fin_columns": [ { "name": "Salariu de bază", "type": "valoare", "value": 0 }, { "name": "Spor vechime", "type": "procent", "value": 15 } ]
      }`;
    } else if (nodeType === 'Comisie') {
      prompt += `JSON-ul trebuie să aibă exact această structură:
      {
        "department_rof": "Baza legală de înființare a comisiei",
        "rol": "atribuțiile comisiei",
        "committee_members": [ { "nume": "Numele persoanei", "rol_in_comisie": "Președinte/Membru", "functia_de_baza": "Funcția din instituție" } ]
      }`;
    }

    content.push({ type: 'text', text: prompt });

    // 2. Adăugăm fișierele (PDF/Imagini) dacă există
    if (files && files.length > 0) {
      files.forEach(file => {
        content.push({ type: 'image_url', image_url: { url: `data:${file.mimeType};base64,${file.data}` } });
      });
    }

    // 3. Adăugăm textul brut dacă există
    if (rawText && rawText.trim().length > 0) {
      content.push({ type: 'text', text: `TEXT BRUT COPITAT DE UTILIZATOR:\n${rawText}` });
    }

    // 4. Trimitem cererea către OpenRouter
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://stat-graph-vue-v1-0.vercel.app', // Necesar pentru OpenRouter
        'X-Title': 'Statgraph Robot' // Numele aplicației pentru OpenRouter
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-3.1-8b-instruct:free', // Model gratuit, stabil și inteligent
        messages: [{ role: 'user', content: content }]
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'Eroare OpenRouter AI');

    // 5. Extragem răspunsul
    let aiText = data.choices?.[0]?.message?.content || '';
    aiText = aiText.replace(/```json/g, '').replace(/```/g, '').trim();

    return res.status(200).json({ result: aiText });

  } catch (error) {
    console.error('Eroare Robot:', error);
    // Afișăm eroarea exactă PLUS cheia mascată pentru a ști ce cheie a folosit
    return res.status(500).json({ error: `${error.message} (Cheie folosită: ${maskedKey})` });
  }
}