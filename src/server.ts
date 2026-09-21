import 'dotenv/config';
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractDocumentText } from './text-extraction.js';
import { adaptResume, extractJobRequirements } from './resume-agent.js';
import { renderPdf } from './pdf-render.js';
import { loadSkillProfile, saveSkillProfile, skillProfileSchema } from './skill-profile.js';
import { verifyJobSkills } from './typesafe-review.js';

const app = Fastify({ logger: true });
await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });
await app.register(fastifyStatic, { root: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'outputs'), index: 'index.html' });

app.get('/health', async () => ({ ok: true, service: 'alinhacv' }));
app.get('/api/profile', async () => loadSkillProfile());
app.put('/api/profile', async (request, reply) => {
  const parsed = skillProfileSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: 'Perfil de competências inválido.', details: parsed.error.flatten() });
  return saveSkillProfile(parsed.data);
});

app.post('/api/job-skills', async (request, reply) => {
  try {
    const parts = request.parts();
    let job = '';
    for await (const part of parts) {
      if (part.type === 'file' && part.fieldname === 'jobFile') job = await extractDocumentText(part.filename, await part.toBuffer());
      else if (part.type === 'field' && part.fieldname === 'jobText') job = String(part.value);
    }
    if (job.trim().length < 20) return reply.code(400).send({ error: 'A descrição da vaga precisa ter pelo menos 20 caracteres.' });
    let extracted;
    try { extracted = await extractJobRequirements(job); }
    catch (error) { extracted = { mode: 'fallback' as const, provider: 'literal', requirements: literalJobRequirements(job), message: error instanceof Error ? error.message : 'O provedor não respondeu.' }; }
    if (extracted.mode !== 'ai') {
      const requirements = extracted.requirements.length ? extracted.requirements : literalJobRequirements(job);
      const candidates = requirements.map(item => item.skill);
      return { skills: candidates, contexts: Object.fromEntries(requirements.map(item => [item.skill.toLocaleLowerCase(), item.context])), extractionProvider: 'literal', reviewStatus: 'manual_required', requiresManualReview: true, fallbackReason: extracted.message };
    }
    const candidates = extracted.requirements.map(item => item.skill);
    const review = await verifyJobSkills(job, candidates);
    return { skills: review.status === 'completed' ? review.skills.filter((item: { verdict: string }) => item.verdict === 'present').map((item: { skill: string }) => item.skill) : candidates, contexts: Object.fromEntries(extracted.requirements.map(item => [item.skill.toLocaleLowerCase(), item.context])), extractionProvider: extracted.provider, reviewStatus: review.status, review, requiresManualReview: review.status !== 'completed' };
  } catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : 'Falha ao ler a descrição da vaga.' }); }
});

function literalJobRequirements(job: string) {
  const knownTerms = ['JavaScript', 'TypeScript', 'React', 'Vue', 'Angular', 'HTML', 'CSS', 'responsive design', 'component-based architecture', 'Storybook', 'Node.js', 'Python', 'Java', 'C#', '.NET', 'ASP.NET Core', 'SQL', 'MySQL', 'PostgreSQL', 'MongoDB', 'Git', 'Docker', 'Kubernetes', 'AWS', 'Azure', 'GCP', 'REST API', 'GraphQL', 'Scrum', 'Kanban', 'Agile', 'Figma', 'Excel', 'Power BI', 'Tableau', 'English', 'Português', 'Inglês', 'Espanhol'];
  return knownTerms.filter(term => new RegExp(`(^|[^\\p{L}\\p{N}])${term.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}([^\\p{L}\\p{N}]|$)`, 'iu').test(job)).map(skill => ({ skill, context: 'Encontrada literalmente na descrição da vaga.' }));
}

app.post('/api/render-pdf', async (request, reply) => {
  try {
    const body = request.body as { latex?: string };
    if (!body?.latex?.trim()) return reply.code(400).send({ error: 'LaTeX é obrigatório.' });
    const pdf = await renderPdf(body.latex);
    return { mimeType: 'application/pdf', data: pdf.toString('base64') };
  } catch (error) { return reply.code(503).send({ error: error instanceof Error ? error.message : 'Falha ao compilar PDF.' }); }
});

app.post('/api/analyze', async (request, reply) => {
  const parts = request.parts();
  let resume = '';
  let job = '';
  let profile = { skills: [] as Array<{ skill: string; status: 'experienced' | 'learning' | 'none'; level?: 'basic' | 'intermediate' | 'advanced'; evidence?: string }> };
  for await (const part of parts) {
    if (part.type === 'file') {
      const buffer = await part.toBuffer();
      const text = await extractDocumentText(part.filename, buffer);
      if (part.fieldname === 'resumeFile') resume = text;
      if (part.fieldname === 'jobFile') job = text;
    } else if (part.fieldname === 'resumeText') resume = String(part.value);
    else if (part.fieldname === 'jobText') job = String(part.value);
    else if (part.fieldname === 'skillProfile') {
      try { profile = skillProfileSchema.parse(JSON.parse(String(part.value))); } catch { return reply.code(400).send({ error: 'Confirme o perfil de competências novamente.' }); }
    }
  }
  if (!resume.trim() || !job.trim()) return reply.code(400).send({ error: 'Currículo e descrição da vaga são obrigatórios.' });
  return { ...(await adaptResume(resume, job, profile)), resumeText: resume, jobText: job };
});

app.listen({ port: Number(process.env.PORT ?? 3000), host: '127.0.0.1' });
