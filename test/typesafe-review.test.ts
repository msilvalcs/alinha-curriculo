import test from 'node:test';
import assert from 'node:assert/strict';
import { TypeSafeClient } from '@typesafe-ai/sdk';
import { applyEvidenceGate, removePersonalData, reviewClaimsWithClient } from '../src/typesafe-review.js';
import type { ResumeData } from '../src/latex-resume.js';

test('redacts personal contact data before sending resume evidence', () => {
  const safe = removePersonalData('Lucas Silva\nE-mail: lucas@example.com\nTelefone: (31) 9 9999-1234\nEndereço: Rua Exemplo, 10\nLinkedIn: https://linkedin.com/in/lucas', ['Lucas Silva']);
  assert.doesNotMatch(safe, /Lucas Silva|lucas@example\.com|9999-1234|Rua Exemplo|linkedin\.com/i);
  assert.match(safe, /removido/);
});

test('sends typed claim questions to Jev and gates unsupported claims', async () => {
  let sentState = '';
  let sentQuestionIds: string[] = [];
  const client = new TypeSafeClient({ apiKey: 'test-key', fetch: async (_input, init) => {
    const request = JSON.parse(String(init?.body)); sentState = JSON.stringify(request.state); sentQuestionIds = Object.keys(request.questions);
    const answers = Object.fromEntries(sentQuestionIds.map((id, i) => [id, { type: 'choice', choice: i === 2 ? 'unsupported' : 'supported', confidence: 0.94, probabilities: { supported: i === 2 ? 0.02 : 0.94, contradicted: 0.04, unsupported: i === 2 ? 0.94 : 0.02 } }]));
    return Response.json({ model: 'jev-test', answers, usage: { input_tokens: 10, output_tokens: 5 } });
  } });
  const data: ResumeData = { name: 'Lucas Silva', email: 'lucas@example.com', summary: 'Frontend developer with React experience.', skills: ['React', 'Kubernetes'], experience: [{ company: 'Acme', role: 'Developer', dates: '2024-present', bullets: ['Built React components'] }] };
  const review = await reviewClaimsWithClient('Lucas Silva\nlucas@example.com\nReact and component library experience.', data, client);
  assert.equal(review.status, 'completed'); assert.deepEqual(sentQuestionIds, ['claim_0', 'claim_1', 'claim_2', 'claim_3', 'claim_4']);
  assert.doesNotMatch(sentState, /Lucas Silva|lucas@example\.com/);
  const filtered = applyEvidenceGate(data, review);
  assert.deepEqual(filtered.skills, ['React']); assert.equal(filtered.summary, 'Frontend developer with React experience.'); assert.equal(filtered.experience?.length, 1);
});

test('routes low-confidence judgments to review instead of trusting them', async () => {
  const client = new TypeSafeClient({ apiKey: 'test-key', fetch: async () => Response.json({ model: 'jev-test', answers: { claim_0: { type: 'choice', choice: 'supported', confidence: 0.51, probabilities: { supported: 0.51, contradicted: 0.24, unsupported: 0.25 } } }, usage: { input_tokens: 5, output_tokens: 3 } }) });
  const review = await reviewClaimsWithClient('React experience', { summary: 'React developer' }, client);
  assert.equal(review.claims[0].verdict, 'review'); assert.equal(applyEvidenceGate({ summary: 'React developer' }, review).summary, '');
});
