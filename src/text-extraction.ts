import path from 'node:path';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

export async function extractDocumentText(filename: string, buffer: Buffer): Promise<string> {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.txt') return buffer.toString('utf8');
  if (ext === '.pdf') return (await pdfParse(buffer)).text;
  if (ext === '.docx') return (await mammoth.extractRawText({ buffer })).value;
  throw new Error(`Formato não suportado: ${ext}`);
}
