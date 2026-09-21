import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const skillSchema = z.object({
  skill: z.string().trim().min(1).max(80),
  status: z.enum(['experienced', 'learning', 'none']),
  level: z.enum(['basic', 'intermediate', 'advanced']).optional(),
  evidence: z.string().trim().max(500).optional(),
});
export const skillProfileSchema = z.object({ skills: z.array(skillSchema).max(100) });
export type SkillProfile = z.infer<typeof skillProfileSchema>;

function getProfilePath() {
  return process.env.SKILL_PROFILE_PATH ?? fileURLToPath(new URL('../data/skill-profile.json', import.meta.url));
}

export async function loadSkillProfile(): Promise<SkillProfile> {
  try {
    return skillProfileSchema.parse(JSON.parse(await readFile(getProfilePath(), 'utf8')));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { skills: [] };
    throw error;
  }
}

export async function saveSkillProfile(value: unknown): Promise<SkillProfile> {
  const profile = skillProfileSchema.parse(value);
  const profilePath = getProfilePath();
  const dir = path.dirname(profilePath);
  await mkdir(dir, { recursive: true });
  const tempPath = `${profilePath}.${process.pid}.tmp`;
  await writeFile(tempPath, JSON.stringify(profile, null, 2), { encoding: 'utf8', mode: 0o600 });
  await rename(tempPath, profilePath);
  return profile;
}

export function constrainSkills<T extends { skills?: string[] }>(data: T, profile: SkillProfile): T {
  const confirmed = new Set(profile.skills.filter(item => item.status === 'experienced').map(item => item.skill.toLowerCase()));
  return { ...data, skills: (data.skills ?? []).filter(skill => confirmed.has(skill.toLowerCase())) };
}
