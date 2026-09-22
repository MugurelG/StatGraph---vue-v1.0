export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metoda nepermisa' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Cheia API lipseste din Vercel.' });
  }

  try {
    const { url, type, nodeName } = req.body;

    // 1. Descărcăm conținutul de la linkul furnizat
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Nu pot accesa linkul: ${response.statusText}`);
    
    const contentType = response.headers.get('content-type') || '';
    let parts = [];

    // 2. Verificăm dacă e PDF sau pagină Web (HTML)
    if (contentType.includes('application/pdf')) {
      // Dacă e PDF, îl transformăm în Base64 pentru a-l trimite la Gemini
      const buffer = await response.arrayBuffer();
      const base64Pdf = Buffer.from(buffer).toString('base64');
      parts.push({ inlineData: { mimeType: 'application/pdf', data: base64Pdf } });
    } else {
      // Dacă e pagină web, curățăm HTML-ul și păstrăm doar textul
      const htmlText = await response.text();
      const cleanText = htmlText.replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, '')
                                .replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, '')
                                .replace(/<[^>]+>/g, ' ')
                                .replace(/\s+/g, ' ')
                                .trim();
      parts.push({ text: cleanText });
    }

    // 3. Construim Promptul în funcție de ce fel de date vrem să extragem
    let prompt = '';
    if (type === 'contact') {
      prompt = `Din textul/documentul de mai jos, extrage datele de identificare și contact. Returnează STRICT un JSON valid: { "cui": "", "acronim": "", "adresa": "", "telefon": "", "email": "", "website": "" }`;
    } else if (type === 'rof') {
      prompt = `Din documentul ROF de mai jos, găsește reglementarea și atribuțiile pentru entitatea: "${nodeName}". Returnează STRICT un JSON valid: { "reglementare": "Cap. X, Art. Y", "atributii": "rezumat complet" }`;
    } else if (type === 'hr') {
      prompt = `Din documentul cu statul de funcții de mai jos, extrage posturile, numărul de ocupate și vacante. Returnează STRICT un array JSON valid: [{ "functie": "", "ocupate": 0, "vacante": 0, "total": 0 }]`;
    } else if (type === 'salarii') {
      prompt = `Din documentul cu salariile de mai jos, extrage salariul de bază pentru fiecare funcție. Returnează STRICT un array JSON valid: [{ "functie": "", "salariu_baza": 0 }]`;
    }
    
    parts.unshift({ text: prompt });

    // 4. Trimitem către Gemini 2.5 Flash (modelul care funcționează pe contul tău)
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }] })
    });

    const geminiData = await geminiRes.json();
    if (!geminiRes.ok) throw new Error(geminiData.error?.message || 'Eroare Google AI');

    let aiText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    aiText = aiText.replace(/```json/g, '').replace(/```/g, '').trim();

    return res.status(200).json({ result: aiText });

  } catch (error) {
    console.error('Eroare Robot:', error);
    return res.status(500).json({ error: error.message });
  }
}