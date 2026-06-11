const https = require('https');

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Vercel body parsing safety check
    let body = req.body;
    if (typeof body === 'string') {
      body = JSON.parse(body);
    }
    const { messages, systemPrompt } = body;

    // Convert history format to Gemini specifications
    const formattedContents = messages.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));

    const payload = JSON.stringify({
      contents: formattedContents,
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: { 
        responseMimeType: "application/json", 
        temperature: 1.0 
      }
    });

    const apiKey = process.env.GEMINI_API_KEY;
    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const apiResponse = await new Promise((resolve, reject) => {
      const apiReq = https.request(options, (apiRes) => {
        let data = '';
        apiRes.on('data', (chunk) => data += chunk);
        apiRes.on('end', () => resolve({ statusCode: apiRes.statusCode, data }));
      });

      apiReq.on('error', (e) => reject(e));
      apiReq.write(payload);
      apiReq.end();
    });

    const data = JSON.parse(apiResponse.data);

    // Check if Google returned an internal API error
    if (data.error) {
      return res.status(500).json({ error: data.error.message });
    }

    // Ultra-safe extraction of response text
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content || !data.candidates[0].content.parts || !data.candidates[0].content.parts[0]) {
      return res.status(500).json({ error: "Invalid response structure from Gemini API", rawReceived: data });
    }

    let replyText = data.candidates[0].content.parts[0].text;

    // Safe Markdown wrapper cleaning
    if (replyText && replyText.includes("```")) {
      replyText = replyText.replace(/```json|```/g, "").trim();
    }

    return res.status(200).json({ text: replyText });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}