import { GoogleGenerativeAI } from '@google/generative-ai';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metoda nepermisa' });
  }

  try {
    // Verificăm dacă cheia API există pe Vercel
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('Cheia API GEMINI_API_KEY lipsește din Vercel Environment Variables.');
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
   const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const { prompt, text } = req.body;
    const fullPrompt = `${prompt}\n\nTEXT BRUT:\n${text}`;

    const result = await model.generateContent(fullPrompt);
    const response = await result.response;
    const aiText = response.text();

    res.status(200).json({ result: aiText });
    
  } catch (error) {
    console.error('Eroare Parser Detaliată:', error);
    // Trimitem mesajul exact de eroare înapoi către frontend
    res.status(500).json({ error: error.message || 'Eroare necunoscută în serverul AI' });
  }
}