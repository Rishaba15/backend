import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import mammoth from 'mammoth';
import multer from 'multer';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

app.use(cors());
app.get('/health', (_request, response) => response.json({ ok: true }));

async function extractText(file) {
  const extension = file.originalname.split('.').pop()?.toLowerCase();
  if (extension === 'txt') return file.buffer.toString('utf8');
  if (extension === 'pdf') return (await pdfParse(file.buffer)).text;
  if (extension === 'docx') return (await mammoth.extractRawText({ buffer: file.buffer })).value;
  throw new Error('Only TXT, PDF, and DOCX files are supported.');
}

function localStudyGuide(text) {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 20);
  const points = (sentences.length ? sentences : [text]).slice(0, 5);
  const words = text.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 5);
  const counts = new Map();
  for (const word of words) counts.set(word, (counts.get(word) || 0) + 1);
  const topics = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);
  const topicText = topics.length ? topics.join(', ') : 'the main ideas in this file';
  return {
    summary: points.slice(0, 3).join(' '),
    explanation: `In simple terms, these notes focus on ${topicText}. Read each point step by step and connect it with a practical example.`,
    points,
    topics: topics.length ? topics : ['Main ideas'],
    tips: [
      `Revise the key topics: ${topicText}.`,
      'Write one definition and one example for each topic.',
      'Close the notes and explain the main ideas from memory.',
    ],
    examples: topics.slice(0, 3).map((topic) => `Example: Apply ${topic} to a simple real-world situation and identify the result.`),
    questions: topics.slice(0, 3).map((topic) => `Explain ${topic} in your own words and give one example.`),
  };
}

app.post('/api/summarize', upload.single('file'), async (request, response) => {
  try {
    if (!request.file) return response.status(400).json({ error: 'Please upload a note file.' });
    const text = (await extractText(request.file)).replace(/\s+/g, ' ').trim();
    if (!text) return response.status(422).json({ error: 'No readable text was found in this file.' });

    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_gemini_api_key_here') {
      return response.json(localStudyGuide(text));
    }

    const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        generationConfig: {
          temperature: 0.3,
          responseMimeType: 'application/json',
        },
        contents: [
          {
            role: 'user',
            parts: [{
              text: `You are StudyShare AI. Return only valid JSON with string fields summary and explanation, and string arrays points, tips, examples, questions, topics. Make it accurate, student-friendly, exam-focused, and based only on the provided notes.\n\nAnalyze these study notes:\n\n${text.slice(0, 100000)}`,
            }],
          },
        ],
      }),
      },
    );

    const payload = await geminiResponse.json();
    if (!geminiResponse.ok) {
      console.warn(`Gemini request failed: ${payload.error?.message || 'unknown error'}. Using local fallback.`);
      return response.json(localStudyGuide(text));
    }
    const content = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('');
    if (!content) return response.json(localStudyGuide(text));
    return response.json(JSON.parse(content.replace(/^```json\s*|\s*```$/g, '').trim()));
  } catch (error) {
    return response.status(500).json({ error: error.message || 'Unable to summarize this file.' });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log(`StudyShare AI backend running on http://localhost:${process.env.PORT || 3000}`);
});