import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { readFile } from 'node:fs/promises';
import { renderLatex, type ResumeData } from './latex-resume.js';

type Provider = 'openai' | 'anthropic' | 'opencode' | 'nvidia';
const system = `Você é um agente de adaptação de currículos. Use somente fatos comprovados no currículo-base. Nunca invente competência, ferramenta, cargo, resultado, data, certificação ou experiência. Compare cada requisito da vaga com evidências explícitas. Retorne JSON com: summary, confirmedKeywords, missingRequirements, resumeSections, atsReport. O currículo deve ser direcionado à vaga, mas qualquer lacuna deve ser marcada como ausente.`;

const selectedProvider = (): Provider => {
  const value = (process.env.AI_PROVIDER ?? 'openai').toLowerCase();
  return value === 'anthropic' || value === 'opencode' || value === 'nvidia' ? value : 'openai';
};
const input = (resume: string, job: string) => `CURRÍCULO-BASE:\n${resume}\n\nVAGA:\n${job}`;

async function runOpenAI(resume: string, job: string) {
  const provider = selectedProvider();
  const compatible = provider === 'opencode' || provider === 'nvidia';
  const apiKey = provider === 'opencode' ? process.env.OPENCODE_API_KEY : provider === 'nvidia' ? process.env.NVIDIA_API_KEY : process.env.OPENAI_API_KEY;
  const baseURL = provider === 'opencode' ? process.env.OPENCODE_BASE_URL : provider === 'nvidia' ? process.env.NVIDIA_BASE_URL : undefined;
  const client = new OpenAI({ apiKey, ...(compatible ? { baseURL } : {}) });
  const model = provider === 'opencode' ? (process.env.OPENCODE_MODEL ?? 'opencode-default') : provider === 'nvidia' ? (process.env.NVIDIA_MODEL ?? 'meta/llama-3.1-70b-instruct') : (process.env.OPENAI_MODEL ?? 'gpt-5');
  const result = await client.chat.completions.create({ model, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, { role: 'user', content: input(resume, job) }] });
  return JSON.parse(result.choices[0]?.message.content ?? '{}');
}

async function runAnthropic(resume: string, job: string) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const result = await client.messages.create({ model: process.env.ANTHROPIC_MODEL ?? 'claude-3-5-sonnet-latest', max_tokens: 5000, system, messages: [{ role: 'user', content: `${input(resume, job)}\n\nRetorne somente JSON, sem markdown.` }] });
  const text = result.content.find(block => block.type === 'text')?.text ?? '{}';
  return JSON.parse(text.replace(/^```json\s*/, '').replace(/\s*```$/, ''));
}

export async function adaptResume(resume: string, job: string) {
  const provider = selectedProvider();
  const key = provider === 'anthropic' ? process.env.ANTHROPIC_API_KEY : provider === 'opencode' ? process.env.OPENCODE_API_KEY : provider === 'nvidia' ? process.env.NVIDIA_API_KEY : process.env.OPENAI_API_KEY;
  if (!key) return { mode: 'demo', provider, summary: `Configure a chave do provedor ${provider} para ativar o agente.`, confirmedKeywords: [], missingRequirements: [], resumeSections: { source: resume }, atsReport: { score: null, note: 'Análise de demonstração.' } };
  const result = provider === 'anthropic' ? await runAnthropic(resume, job) : await runOpenAI(resume, job);
  const template = await readFile(new URL('../templates/pt-br/curriculo.tex', import.meta.url), 'utf8');
  return { ...result, template: 'celio-resume-template-pt-br', latex: renderLatex((result.resumeSections ?? {}) as ResumeData, template) };
}
