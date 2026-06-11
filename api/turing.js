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

    // Strict formatting constraint
    const structuralEnforcer = `\n\n[CRITICAL RULE: Return ONLY a raw, valid JSON string matching the game schema. Do not include markdown code blocks like \`\`\`json. Start directly with { and end with }.]`;

    const formattedMessages = [
      { role: 'system', content: systemPrompt + structuralEnforcer },
      ...messages
    ];

    // SINGLE STABLE FREE MODEL
    const payload = JSON.stringify({
      model: 'openrouter/auto:free', 
      messages: formattedMessages,
      temperature: 0.3,
      max_tokens: 800
    });

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
      return res.status(200).json({ text: JSON.stringify({ chapter: "API Error", speech: `Error: ${data.error.message}`, mode: "free" }) });
    }

    let replyText = data.choices[0].message.content;

    // Heavy regex slice safely ensuring frontend doesn't crash on invalid JSON wrapping
    if (replyText) {
      if (replyText.includes("```")) {
        replyText = replyText.replace(/```json|```/g, "").trim();
      }
      const firstCurly = replyText.indexOf('{');
      const lastCurly = replyText.lastIndexOf('}');
      if (firstCurly !== -1 && lastCurly !== -1) {
        replyText = replyText.substring(firstCurly, lastCurly + 1);
      }
    }

    return res.status(200).json({ text: replyText });

  } catch (error) {
    return res.status(200).json({ text: JSON.stringify({ chapter: "Crash Log", speech: `Internal Exception: ${error.message}`, mode: "free" }) });
  }
}