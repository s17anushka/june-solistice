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

    // OpenRouter or openAI format  
    const formattedMessages = [
      { role: 'system', content: systemPrompt },
      ...messages
    ];

    const payload = JSON.stringify({
      model: 'google/gemini-2.5-flash', // OpenRoute Gemini 2.5 Flash model string
      messages: formattedMessages,
      temperature: 1.0,
      max_tokens: 1000
    });

    // OPENROUTER KEY reading from environment variables
    const apiKey = process.env.OPENROUTER_API_KEY;

    const options = {
      hostname: 'openrouter.ai',
      path: '/api/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
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
      return res.status(200).json({ text: JSON.stringify({ chapter: "OpenRouter Error", speech: `Error: ${data.error.message}`, mode: "free" }) });
    }

    // Standard OpenAI/OpenRouter response text extraction
    let replyText = data.choices[0].message.content;

    // Safety cleanup in case markdown block tags are included
    if (replyText && replyText.includes("```")) {
      replyText = replyText.replace(/```json|```/g, "").trim();
    }

    return res.status(200).json({ text: replyText });

  } catch (error) {
    return res.status(200).json({ text: JSON.stringify({ chapter: "Crash Log", speech: `Internal Exception: ${error.message}`, mode: "free" }) });
  }
}