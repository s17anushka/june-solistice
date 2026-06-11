const https = require('https');

// Sabhi available free models ki list (OpenRouter ke active free tiers)
const FREE_MODELS = [
  'google/gemini-2.5-flash:free',
  'meta-llama/llama-3-8b-instruct:free',
  'google/gemma-2-9b-it:free',
  'mistralai/mistral-7b-instruct:free',
  'qwen/qwen-2.5-7b-instruct:free'
];

async function tryModelRequest(modelName, formattedMessages, apiKey) {
  const payload = JSON.stringify({
    model: modelName,
    messages: formattedMessages,
    temperature: 0.7,
    max_tokens: 800
  });

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

  return new Promise((resolve, reject) => {
    const apiReq = https.request(options, (apiRes) => {
      let data = '';
      apiRes.on('data', (chunk) => data += chunk);
      apiRes.on('end', () => resolve({ statusCode: apiRes.statusCode, data }));
    });
    apiReq.on('error', (e) => reject(e));
    apiReq.write(payload);
    apiReq.end();
  });
}

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

    const formattedMessages = [
      { role: 'system', content: systemPrompt },
      ...messages
    ];

    const apiKey = process.env.OPENROUTER_API_KEY;
    let apiResponse = null;
    let successfulModel = '';
    let lastError = '';

    // AUTO LOOP: Ek-ek karke saare free models try karega
    for (const model of FREE_MODELS) {
      try {
        console.log(`Trying auto-fallback model: ${model}`);
        const result = await tryModelRequest(model, formattedMessages, apiKey);
        const parsedData = JSON.parse(result.data);

        // Agar OpenRouter ne data status me error diya, toh agla model try karo
        if (result.statusCode !== 200 || parsedData.error) {
          lastError = parsedData.error ? parsedData.error.message : `Status ${result.statusCode}`;
          continue; 
        }

        // Agar successfully response aa gaya, toh loop break kar do
        if (parsedData.choices && parsedData.choices[0] && parsedData.choices[0].message) {
          apiResponse = parsedData;
          successfulModel = model;
          break;
        }
      } catch (err) {
        lastError = err.message;
        continue;
      }
    }

    // Agar saare models fail ho gaye
    if (!apiResponse) {
      return res.status(200).json({ 
        text: JSON.stringify({ 
          chapter: "Auto Mode Failure", 
          speech: `All free models exhausted. Last error: ${lastError}`, 
          mode: "free" 
        }) 
      });
    }

    console.log(`Success with model: ${successfulModel}`);
    let replyText = apiResponse.choices[0].message.content;

    if (replyText && replyText.includes("```")) {
      replyText = replyText.replace(/```json|```/g, "").trim();
    }

    return res.status(200).json({ text: replyText });

  } catch (error) {
    return res.status(200).json({ text: JSON.stringify({ chapter: "Crash Log", speech: `Internal Exception: ${error.message}`, mode: "free" }) });
  }
}