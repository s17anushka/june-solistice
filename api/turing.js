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

    const structuralEnforcer = `\n\n[CRITICAL RULE: Return ONLY a raw, valid JSON string matching the requested game schema. Do not include markdown code blocks like \`\`\`json. Start directly with { and end with }.]`;

    const formattedMessages = [
      { role: 'system', content: systemPrompt + structuralEnforcer },
      ...messages
    ];

    const payload = JSON.stringify({
      model: 'meta-llama/Meta-Llama-3-8B-Instruct', // Permanent 100% Free active model
      messages: formattedMessages,
      temperature: 0.1, // Super low temperature for strict JSON output
      max_tokens: 800
    });

    const hfToken = process.env.HF_TOKEN;

    const options = {
      hostname: 'router.huggingface.co',
      path: '/v1/chat/completions', // Standard OpenAI compatible endpoint mapping
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${hfToken}`,
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
      return res.status(200).json({ text: JSON.stringify({ chapter: "Hugging Face Error", speech: `API Error: ${data.error.message || data.error}`, mode: "free" }) });
    }

    let replyText = data.choices[0].message.content;

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