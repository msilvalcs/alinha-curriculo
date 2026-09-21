import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { constrainSkills, loadSkillProfile, saveSkillProfile } from '../src/skill-profile.js';

test('only user-confirmed experienced skills are allowed into the resume', () => {
  const result = constrainSkills({ skills: ['React', 'SQL', 'Kubernetes'] }, { skills: [
    { skill: 'React', status: 'experienced', evidence: 'Uso profissional' },
    { skill: 'SQL', status: 'learning' },
    { skill: 'Kubernetes', status: 'none' },
  ] });
  assert.deepEqual(result.skills, ['React']);
});

test('profile is persisted and loaded from the configured local path', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'alinhacv-profile-'));
  const original = process.env.SKILL_PROFILE_PATH;
  process.env.SKILL_PROFILE_PATH = path.join(dir, 'profile.json');
  try {
    const saved = await saveSkillProfile({ skills: [{ skill: 'TypeScript', status: 'experienced', level: 'intermediate', evidence: 'Projetos e estágio' }] });
    assert.deepEqual(await loadSkillProfile(), saved);
    assert.match(await readFile(process.env.SKILL_PROFILE_PATH, 'utf8'), /TypeScript/);
    await assert.rejects(() => saveSkillProfile({ skills: [{ skill: '', status: 'maybe' }] }));
  } finally {
    if (original === undefined) delete process.env.SKILL_PROFILE_PATH;
    else process.env.SKILL_PROFILE_PATH = original;
    await rm(dir, { recursive: true, force: true });
  }
});
