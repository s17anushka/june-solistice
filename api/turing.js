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

    // Strict instructions ko direct prompt ke top par merge kar rahe hain
    // Taaki 'systemInstruction' field ki zaroorat hi na pade!
    const injectionPrompt = `[CRITICAL SYSTEM INSTRUCTION: ${systemPrompt}]\n\n[RESPONSE RULE: You must ONLY respond with a raw, valid JSON object matching the requested schema. Do not wrap it in markdown code blocks like \`\`\`json. Return raw JSON text directly.]\n\n`;

    const formattedContents = messages.map((msg, idx) => {
      // Pehle user message me system instruction inject kar do
      let textContent = msg.content;
      if (idx === 0 && msg.role === 'user') {
        textContent = injectionPrompt + textContent;
      }
      return {
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: textContent }]
      };
    });

    // Ekdam basic, minimal payload jo har version par chalta hai
    const payload = JSON.stringify({
      contents: formattedContents,
      generationConfig: { 
        temperature: 0.7 // Strict JSON ke liye temperature thoda kam kiya
      }
    });

    const apiKey = process.env.GEMINI_API_KEY;
    
    // Using v1beta as it universally supports the default models seamlessly
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

    if (data.error) {
      return res.status(200).json({ text: JSON.stringify({ chapter: "API Error", speech: `Google API Error: ${data.error.message}`, mode: "free" }) });
    }

    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
      return res.status(200).json({ text: JSON.stringify({ chapter: "Error", speech: "Empty content returned from Gemini.", mode: "free" }) });
    }

    let replyText = data.candidates[0].content.parts[0].text;
    
    // Agar model ne galti se markdown block laga bhi diya, toh use handle karne ke liye cleanup safety filter
    if (replyText && replyText.includes("```")) {
      replyText = replyText.replace(/```json|```/g, "").trim();
    }

    return res.status(200).json({ text: replyText });

  } catch (error) {
    return res.status(200).json({ text: JSON.stringify({ chapter: "Crash Log", speech: `Internal Exception: ${error.message}`, mode: "free" }) });
  }
}