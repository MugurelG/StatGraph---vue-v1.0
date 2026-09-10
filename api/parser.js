export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metoda nepermisa' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Cheia API nu exista in Vercel Environment Variables.' });
  }

  try {
    const { prompt, text } = req.body;
    const fullPrompt = `${prompt}\n\nTEXT BRUT:\n${text}`;

    // Apel direct către API-ul Google (Fără librărie externă)
       const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    
    const apiResponse = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: fullPrompt }] }]
      })
    });

    const data = await apiResponse.json();

    // Dacă Google a returnat o eroare, o afișăm exactă
    if (!apiResponse.ok) {
      console.error('Eroare Google API:', data);
      return res.status(500).json({ error: `Google API Error: ${data.error?.message || 'Eroare necunoscută de la Google'}` });
    }

    // Extragem textul din răspuns
    const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    res.status(200).json({ result: aiText });

  } catch (error) {
    console.error('Eroare Server Parser:', error);
    res.status(500).json({ error: error.message });
  }
}