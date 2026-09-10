export default async function handler(req, res) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Cheia API lipseste.' });
  }

  try {
    // Apel direct pentru a lista toate modelele disponibile pentru cheia ta
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    
    const apiResponse = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    const data = await apiResponse.json();

    if (!apiResponse.ok) {
      return res.status(500).json({ error: `Google API Error: ${data.error?.message}` });
    }

    // Returnăm lista de modele direct către frontend (în consolă)
    const models = data.models.map(m => m.name).join(', ');
    return res.status(200).json({ result: `MODELE DISPONIBILE: ${models}` });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}