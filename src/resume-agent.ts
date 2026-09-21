import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { renderLatex, type ResumeData } from './latex-resume.js';
import { applyEvidenceGate, reviewResumeEvidence } from './typesafe-review.js';
import { constrainSkills, type SkillProfile } from './skill-profile.js';

type Provider = 'openai' | 'anthropic' | 'opencode' | 'nvidia';
const system = `Você é um agente de adaptação de currículos. Use somente fatos comprovados no currículo-base e no perfil de competências explicitamente confirmado pelo usuário. Nunca invente competência, ferramenta, cargo, resultado, data, certificação ou experiência. O perfil de competências autoriza somente a inclusão da competência na seção de habilidades, nunca a criação de experiência ou resultados. Compare cada requisito da vaga com evidências explícitas. Retorne somente JSON com os campos: summary (string), confirmedKeywords (string[]), missingRequirements (string[]), resumeSections (objeto com name, city, email, linkedin, github, summary; experience: array de {company, location opcional, role, dates, bullets:string[]}; skills:string[]; languages:string[]; education: array de {institution, location opcional, course, dates}), atsReport (objeto com score e observações). O currículo deve ser direcionado à vaga, mas qualquer lacuna deve ser marcada como ausente. Não inclua dados de contato no resumo nem crie seções ou fatos não presentes nas fontes.`;

const resumeSectionsSchema = z.object({
  name: z.string().optional(), city: z.string().optional(), email: z.string().optional(), linkedin: z.string().optional(), github: z.string().optional(), summary: z.string().optional(),
  experience: z.array(z.object({ company: z.string(), location: z.string().optional(), role: z.string(), dates: z.string(), bullets: z.array(z.string()).default([]) })).default([]),
  skills: z.array(z.string()).default([]), languages: z.array(z.string()).default([]),
  education: z.array(z.object({ institution: z.string(), location: z.string().optional(), course: z.string(), dates: z.string() })).default([]),
}).passthrough();
const generationSchema = z.object({
  summary: z.string().default(''), confirmedKeywords: z.array(z.string()).default([]), missingRequirements: z.array(z.string()).default([]),
  resumeSections: resumeSectionsSchema.default({}), atsReport: z.unknown().optional(),
}).passthrough();

const selectedProvider = (): Provider => {
  const value = (process.env.AI_PROVIDER ?? 'openai').toLowerCase();
  return value === 'anthropic' || value === 'opencode' || value === 'nvidia' ? value : 'openai';
};
const input = (resume: string, job: string, profile: SkillProfile) => `CURRÍCULO-BASE:\n${resume}\n\nVAGA:\n${job}\n\nPERFIL DE COMPETÊNCIAS INFORMADO PELO USUÁRIO (única fonte para adicionar skills não escritas no currículo; nunca extrapole para experiência):\n${JSON.stringify(profile.skills)}`;

async function runOpenAI(resume: string, job: string, profile: SkillProfile) {
  const provider = selectedProvider();
  const compatible = provider === 'opencode' || provider === 'nvidia';
  const apiKey = provider === 'opencode' ? process.env.OPENCODE_API_KEY : provider === 'nvidia' ? process.env.NVIDIA_API_KEY : process.env.OPENAI_API_KEY;
  const baseURL = provider === 'opencode' ? process.env.OPENCODE_BASE_URL : provider === 'nvidia' ? process.env.NVIDIA_BASE_URL : undefined;
  const client = new OpenAI({ apiKey, ...(compatible ? { baseURL } : {}) });
  const model = provider === 'opencode' ? (process.env.OPENCODE_MODEL ?? 'opencode-default') : provider === 'nvidia' ? (process.env.NVIDIA_MODEL ?? 'meta/llama-3.1-70b-instruct') : (process.env.OPENAI_MODEL ?? 'gpt-5');
  const result = await client.chat.completions.create({ model, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, { role: 'user', content: input(resume, job, profile) }] });
  return generationSchema.parse(JSON.parse(result.choices[0]?.message.content ?? '{}'));
}

async function runAnthropic(resume: string, job: string, profile: SkillProfile) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const result = await client.messages.create({ model: process.env.ANTHROPIC_MODEL ?? 'claude-3-5-sonnet-latest', max_tokens: 5000, system, messages: [{ role: 'user', content: `${input(resume, job, profile)}\n\nRetorne somente JSON, sem markdown.` }] });
  const text = result.content.find(block => block.type === 'text')?.text ?? '{}';
  return generationSchema.parse(JSON.parse(text.replace(/^```json\s*/, '').replace(/\s*```$/, '')));
}

export async function adaptResume(resume: string, job: string, profile: SkillProfile = { skills: [] }) {
  const provider = selectedProvider();
  const key = provider === 'anthropic' ? process.env.ANTHROPIC_API_KEY : provider === 'opencode' ? process.env.OPENCODE_API_KEY : provider === 'nvidia' ? process.env.NVIDIA_API_KEY : process.env.OPENAI_API_KEY;
  if (!key) return { mode: 'demo', provider, summary: `Configure a chave do provedor ${provider} para ativar o agente.`, confirmedKeywords: [], missingRequirements: [], resumeSections: { source: resume }, atsReport: { score: null, note: 'Análise de demonstração.' } };
  const result = provider === 'anthropic' ? await runAnthropic(resume, job, profile) : await runOpenAI(resume, job, profile);
  const sourceResumeSections = constrainSkills(result.resumeSections as ResumeData, profile);
  const evidenceReview = await reviewResumeEvidence(resume, sourceResumeSections);
  const verifiedSections = applyEvidenceGate(sourceResumeSections, evidenceReview);
  const template = await readFile(new URL('../templates/pt-br/curriculo.tex', import.meta.url), 'utf8');
  return { ...result, resumeSections: verifiedSections, evidenceReview, template: 'celio-resume-template-pt-br', latex: renderLatex(verifiedSections, template) };
}
