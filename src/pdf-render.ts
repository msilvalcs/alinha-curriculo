import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

export async function renderPdf(latex: string): Promise<Buffer> {
  if (latex.length > 500_000) throw new Error('Documento LaTeX excede o limite permitido.');
  const dir = await mkdtemp(path.join(tmpdir(), 'alinhacv-'));
  const source = path.join(dir, 'curriculo.tex');
  const output = path.join(dir, 'curriculo.pdf');
  try {
    await writeFile(source, latex, 'utf8');
    await new Promise<void>((resolve, reject) => {
      const child = spawn(process.env.TECTONIC_BIN ?? 'tectonic', ['--untrusted', '--outdir', dir, source], { cwd: dir, windowsHide: true });
      let stderr = ''; child.stderr.on('data', chunk => { stderr += chunk.toString(); });
      child.on('error', error => reject(new Error(`Tectonic não está instalado: ${error.message}`)));
      child.on('close', code => code === 0 ? resolve() : reject(new Error(stderr.slice(-2000) || `Tectonic terminou com código ${code}`)));
    });
    return await readFile(output);
  } finally { await rm(dir, { recursive: true, force: true }); }
}
