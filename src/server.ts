import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractDocumentText } from './text-extraction.js';
import { adaptResume } from './resume-agent.js';
import { renderPdf } from './pdf-render.js';

const app = Fastify({ logger: true });
await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });
await app.register(fastifyStatic, { root: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'outputs'), index: 'index.html' });

app.get('/health', async () => ({ ok: true, service: 'alinhacv' }));

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
  for await (const part of parts) {
    if (part.type === 'file') {
      const buffer = await part.toBuffer();
      const text = await extractDocumentText(part.filename, buffer);
      if (part.fieldname === 'resumeFile') resume = text;
      if (part.fieldname === 'jobFile') job = text;
    } else if (part.fieldname === 'resumeText') resume = String(part.value);
    else if (part.fieldname === 'jobText') job = String(part.value);
  }
  if (!resume.trim() || !job.trim()) return reply.code(400).send({ error: 'Currículo e descrição da vaga são obrigatórios.' });
  return { ...(await adaptResume(resume, job)), resumeText: resume, jobText: job };
});

app.listen({ port: Number(process.env.PORT ?? 3000), host: '127.0.0.1' });
