export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metoda nepermisa' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Cheia API lipseste din Vercel.' });
  }

  try {
    const { prompt, text } = req.body;
    const fullPrompt = `${prompt}\n\nTEXT BRUT:\n${text}`;

    // Folosim modelul disponibil pe contul tau: gemini-2.5-flash
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`;
    
    const apiResponse = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: fullPrompt }] }]
      })
    });

    const data = await apiResponse.json();

    if (!apiResponse.ok) {
      const errMsg = data.error?.message || 'Eroare necunoscuta de la Google';
      console.error('Google API Error:', errMsg);
      return res.status(500).json({ error: `Google API: ${errMsg}` });
    }

    const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return res.status(200).json({ result: aiText });

  } catch (error) {
    console.error('Server Error:', error);
    return res.status(500).json({ error: error.message });
  }
}