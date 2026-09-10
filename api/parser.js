import { GoogleGenerativeAI } from '@google/generative-ai';

export default async function handler(req, res) {
  // Permitem doar cereri de tip POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metoda nepermisa' });
  }

  try {
    // Luăm cheia secretă din variabilele de mediu (o vom pune în Vercel la pasul 2.3)
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    
    // Folosim modelul Gemini 1.5 Flash (cel mai rapid și gratuit)
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    // Primim textul și instrucțiunile (promptul) de la aplicația ta
    const { prompt, text } = req.body;

    // Combinăm instrucțiunea cu textul brut
    const fullPrompt = `${prompt}\n\nTEXT BRUT:\n${text}`;

    // Trimitem către Gemini
    const result = await model.generateContent(fullPrompt);
    const response = await result.response;
    const aiText = response.text();

    // Returnăm răspunsul înapoi către aplicația ta
    res.status(200).json({ result: aiText });
  } catch (error) {
    console.error('Eroare Parser:', error);
    res.status(500).json({ error: 'Eroare la procesarea AI' });
  }
}