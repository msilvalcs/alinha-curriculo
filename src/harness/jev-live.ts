import 'dotenv/config';
import { TypeSafeClient, choice } from '@typesafe-ai/sdk';

if (!process.env.TYPESAFE_API_KEY) {
  console.log('Jev live harness skipped: configure TYPESAFE_API_KEY in .env to run a live API check.');
} else {
  const client = new TypeSafeClient({ apiKey: process.env.TYPESAFE_API_KEY, defaultModel: process.env.TYPESAFE_MODEL ?? 'jev-latest' });
  const response = await client.systemOne({
    state: { source: 'Built reusable React and TypeScript components documented in Storybook.', claim: 'Created reusable React components and documented them with Storybook.' },
    questions: { evidence: choice('Does the source explicitly support this resume claim without adding facts?', { supported: 'The source directly states the claim or a faithful paraphrase.', contradicted: 'The source conflicts with the claim.', unsupported: 'The source does not provide enough evidence for the claim.' }) },
  });
  console.log(JSON.stringify({ model: response.model, answer: response.answers.evidence, usage: response.usage }, null, 2));
}
