export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metoda nepermisa' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Cheia API lipseste din Vercel.' });
  }

  try {
    const { nodeName, nodeType, rawText, files } = req.body;
    
    let parts = [];

    if (files && files.length > 0) {
      files.forEach(file => {
        parts.push({ inlineData: { mimeType: file.mimeType, data: file.data } });
      });
    }

    if (rawText && rawText.trim().length > 0) {
      parts.push({ text: `TEXT BRUT COPITAT DE UTILIZATOR:\n${rawText}` });
    }

    let prompt = `Ești un expert în administrația publică din România. Analizează documentele/textul de mai jos pentru entitatea numită "${nodeName}" (Tip: ${nodeType}).
    Reguli:
    1. Extrage datele specifice pentru acest tip de nod STRICT din documentele sau textul furnizat de utilizator.
    2. Dacă o informație LIPSEȘTE din documente, încearcă să folosești-ți cunoștințele generale (ex: găsește Codul COR, Baza legală).
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

    parts.unshift({ text: prompt });

    // NOU: Mecanism de Reîncercare (Retry)
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`;
    let geminiRes;
    let attempts = 0;
    let geminiData;

    while (attempts < 3) {
      geminiRes = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts }] })
      });

      geminiData = await geminiRes.json();

      // Dacă avem eroare de "High demand" (503), așteptăm 2 secunde și reîncercăm
      if (geminiRes.status === 503 || (geminiData.error && geminiData.error.message.includes('high demand'))) {
        attempts++;
        await new Promise(r => setTimeout(r, 2000));
      } else {
        break; // Dacă am primit un răspuns (bun sau alt tip de eroare), ieșim din buclă
      }
    }

    if (!geminiRes.ok) {
      throw new Error(geminiData.error?.message || 'Eroare Google AI');
    }

    let aiText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    aiText = aiText.replace(/```json/g, '').replace(/```/g, '').trim();

    return res.status(200).json({ result: aiText });

  } catch (error) {
    console.error('Eroare Robot:', error);
    return res.status(500).json({ error: error.message });
  }
}