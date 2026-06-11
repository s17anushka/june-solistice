const https = require('https');

export default async function handler(req, res) {
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
    let body = req.body;
    if (typeof body === 'string') {
      body = JSON.parse(body);
    }
    const { messages, systemPrompt } = body;

    // Standard Gemini Contents format
    const formattedContents = messages.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));

    // CRITICAL: v1 Stable endpoint strictly expects snake_case properties
    const payload = JSON.stringify({
      contents: formattedContents,
      system_instruction: { 
        parts: [{ text: systemPrompt }] 
      },
      generation_config: { 
        response_mime_type: "application/json", 
        temperature: 1.0 
      }
    });

    const apiKey = process.env.GEMINI_API_KEY;
    
    // v1 STABLE ENDPOINT: Universally active for all free tier keys
    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
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

    if (data.error) {
      return res.status(200).json({ text: JSON.stringify({ chapter: "Quota/API Error", speech: `Google API Error: ${data.error.message}`, mode: "free" }) });
    }

    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
      return res.status(200).json({ text: JSON.stringify({ chapter: "Silent Oracle", speech: "Alan Turing's ghost remains silent. Check account restrictions.", mode: "free" }) });
    }

    let replyText = data.candidates[0].content.parts[0].text;
    if (replyText && replyText.includes("```")) {
      replyText = replyText.replace(/```json|```/g, "").trim();
    }

    return res.status(200).json({ text: replyText });

  } catch (error) {
    return res.status(200).json({ text: JSON.stringify({ chapter: "Crash Log", speech: `Internal Exception: ${error.message}`, mode: "free" }) });
  }
}