import OpenAI from 'openai';

const client = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
const system = `Você é um agente de adaptação de currículos. Use somente fatos comprovados no currículo-base. Nunca invente competência, ferramenta, cargo, resultado, data, certificação ou experiência. Compare cada requisito da vaga com evidências explícitas. Retorne JSON com: summary, confirmedKeywords, missingRequirements, resumeSections, atsReport. O currículo deve ser direcionado à vaga, mas qualquer lacuna deve ser marcada como ausente.`;

export async function adaptResume(resume: string, job: string) {
  if (!client) return { mode: 'demo', summary: 'Configure OPENAI_API_KEY para ativar o agente.', confirmedKeywords: [], missingRequirements: [], resumeSections: { source: resume }, atsReport: { score: null, note: 'Análise de demonstração.' } };
  const response = await client.chat.completions.create({ model: 'gpt-5', response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, { role: 'user', content: `CURRÍCULO-BASE:\n${resume}\n\nVAGA:\n${job}` }] });
  return JSON.parse(response.choices[0]?.message.content ?? '{}');
}
