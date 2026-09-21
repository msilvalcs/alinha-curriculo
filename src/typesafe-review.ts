import { choice, TypeSafeClient } from '@typesafe-ai/sdk';
import type { ResumeData } from './latex-resume.js';

export type ClaimReview = {
  id: string;
  claim: string;
  verdict: 'supported' | 'contradicted' | 'unsupported' | 'review';
  confidence: number | null;
  probabilities?: Record<string, number>;
};

const CONFIDENCE_FLOOR = 0.72;
const BATCH_SIZE = 20;

function claimsFromResume(data: ResumeData) {
  const claims: Array<{ id: string; claim: string }> = [];
  if (data.summary?.trim()) claims.push({ id: 'summary', claim: data.summary.trim() });
  (data.skills ?? []).forEach((skill, i) => claims.push({ id: `skill.${i}`, claim: `Competência: ${skill}` }));
  (data.languages ?? []).forEach((language, i) => claims.push({ id: `language.${i}`, claim: `Idioma: ${language}` }));
  (data.experience ?? []).forEach((experience, i) => {
    claims.push({ id: `experience.${i}.header`, claim: `Experiência: ${experience.role} na empresa ${experience.company}, período ${experience.dates}${experience.location ? `, local ${experience.location}` : ''}.` });
    experience.bullets.forEach((bullet, j) => claims.push({ id: `experience.${i}.bullet.${j}`, claim: bullet }));
  });
  (data.education ?? []).forEach((education, i) => claims.push({ id: `education.${i}`, claim: `Formação: ${education.course} em ${education.institution}, período ${education.dates}${education.location ? `, local ${education.location}` : ''}.` }));
  return claims;
}

export function removePersonalData(text: string, identifiers: string[] = []) {
  let safe = text
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email removido]')
    .replace(/(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,3}\)?[\s.-]?)?\d{4,5}[\s.-]?\d{4}\b/g, '[telefone removido]')
    .replace(/https?:\/\/\S*(?:linkedin\.com|github\.com)\S*/gi, '[link profissional removido]')
    .replace(/(?:endereço|address)\s*:\s*[^\n\r]+/gi, '[endereço removido]')
    .replace(/\b\d{1,2}\s+anos\b/gi, '[idade removida]')
    .replace(/\b(?:solteir[oa]|casad[oa]|divorciad[oa]|vi[uú]v[oa])\b/gi, '[estado civil removido]');
  for (const identifier of identifiers.filter(value => value.trim().length >= 3)) {
    safe = safe.replace(new RegExp(identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '[identificador pessoal removido]');
  }
  return safe;
}

export async function reviewClaimsWithClient(
  sourceResume: string,
  resumeData: ResumeData,
  client: TypeSafeClient,
) {
  const claims = claimsFromResume(resumeData);
  const safeSource = removePersonalData(sourceResume, [resumeData.name ?? '']).slice(0, 24_000);
  const reviews: ClaimReview[] = [];

  for (let start = 0; start < claims.length; start += BATCH_SIZE) {
    const batch = claims.slice(start, start + BATCH_SIZE);
    const safeBatch = batch.map(item => ({ ...item, claim: removePersonalData(item.claim, [resumeData.name ?? '']) }));
    const questions = Object.fromEntries(safeBatch.map((item, index) => [
      `claim_${index}`,
      choice(
        { question: 'A afirmação gerada para o currículo está sustentada pelo currículo-base?', claim: item.claim },
        {
          supported: 'Há evidência explícita ou paráfrase fiel no currículo-base, sem ampliar o nível de responsabilidade, domínio ou resultado.',
          contradicted: 'O currículo-base contém informação que contradiz a afirmação.',
          unsupported: 'O currículo-base não oferece evidência suficiente para a afirmação, ou ela acrescenta fato não informado.',
        },
      ),
    ]));
    const response = await client.systemOne({
      model: process.env.TYPESAFE_MODEL ?? 'jev-latest',
      state: { source_resume: safeSource, generated_claims: safeBatch.map((item, index) => ({ question_id: `claim_${index}`, claim: item.claim })) },
      questions,
    });
    batch.forEach((item, index) => {
      const answer = response.answers[`claim_${index}`] as { choice: string; confidence: number; probabilities: Record<string, number> };
      const confident = answer.confidence >= CONFIDENCE_FLOOR;
      reviews.push({ id: item.id, claim: safeBatch[index].claim, verdict: confident && ['supported', 'contradicted', 'unsupported'].includes(answer.choice) ? answer.choice as ClaimReview['verdict'] : 'review', confidence: answer.confidence, probabilities: answer.probabilities });
    });
  }

  return { status: 'completed' as const, provider: 'typesafe', model: process.env.TYPESAFE_MODEL ?? 'jev-latest', confidenceFloor: CONFIDENCE_FLOOR, claims: reviews };
}

export async function reviewResumeEvidence(sourceResume: string, resumeData: ResumeData) {
  if (!process.env.TYPESAFE_API_KEY) {
    return { status: 'not_configured' as const, provider: 'typesafe', message: 'TYPESAFE_API_KEY não configurada; afirmações aguardam revisão humana.', claims: claimsFromResume(resumeData).map(({ id, claim }) => ({ id, claim, verdict: 'review' as const, confidence: null })) };
  }
  const client = new TypeSafeClient({ apiKey: process.env.TYPESAFE_API_KEY, defaultModel: process.env.TYPESAFE_MODEL ?? 'jev-latest', timeout: 30_000, retry: { maxRetries: 1 } });
  try {
    return await reviewClaimsWithClient(sourceResume, resumeData, client);
  } catch (error) {
    return { status: 'unavailable' as const, provider: 'typesafe', message: error instanceof Error ? error.message : 'Falha na revisão de evidências.', claims: claimsFromResume(resumeData).map(({ id, claim }) => ({ id, claim, verdict: 'review' as const, confidence: null })) };
  }
}

export function applyEvidenceGate<T extends ResumeData>(data: T, review: Awaited<ReturnType<typeof reviewResumeEvidence>>): T {
  if (review.status !== 'completed') return data;
  const safe = structuredClone(data);
  const verdicts = new Map(review.claims.map(claim => [claim.id, claim.verdict]));
  if (verdicts.get('summary') !== 'supported') safe.summary = '';
  safe.skills = (safe.skills ?? []).filter((_, i) => verdicts.get(`skill.${i}`) === 'supported');
  safe.languages = (safe.languages ?? []).filter((_, i) => verdicts.get(`language.${i}`) === 'supported');
  safe.experience = (safe.experience ?? []).flatMap((experience, i) => {
    if (verdicts.get(`experience.${i}.header`) !== 'supported') return [];
    return [{ ...experience, bullets: experience.bullets.filter((_, j) => verdicts.get(`experience.${i}.bullet.${j}`) === 'supported') }];
  });
  safe.education = (safe.education ?? []).filter((_, i) => verdicts.get(`education.${i}`) === 'supported');
  return safe;
}
