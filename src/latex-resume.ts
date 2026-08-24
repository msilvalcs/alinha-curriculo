export type ResumeData = {
  name?: string;
  city?: string;
  email?: string;
  linkedin?: string;
  github?: string;
  summary?: string;
  experience?: Array<{ company: string; location?: string; role: string; dates: string; bullets: string[] }>;
  skills?: string[];
  languages?: string[];
  education?: Array<{ institution: string; location?: string; course: string; dates: string }>;
};

function tex(value = '') {
  return String(value).replace(/[&%$#_{}~^\\]/g, char => ({ '&':'\\&','%':'\\%','$':'\\$','#':'\\#','_':'\\_','{':'\\{','}':'\\}','~':'\\textasciitilde{}','^':'\\textasciicircum{}','\\':'\\textbackslash{}' }[char] ?? char));
}

function bullets(items: string[] = []) { return items.map(item => `            \\item ${tex(item)}`).join('\n'); }
function entry(item: { company: string; location?: string; role: string; dates: string; bullets: string[] }) {
  return `    \\cventry{${tex(item.company)}}{${tex(item.location)}}{${tex(item.role)}}{${tex(item.dates)}}\n        \\begin{itemize}\n${bullets(item.bullets)}\n        \\end{itemize}`;
}

export function renderLatex(data: ResumeData, template: string) {
  const experience = (data.experience ?? []).map(entry).join('\n\n');
  const education = (data.education ?? []).map(item => `    \\cventry{${tex(item.institution)}}{${tex(item.location)}}{${tex(item.course)}}{${tex(item.dates)}}`).join('\n');
  const skills = (data.skills ?? []).map(item => `        \\item ${tex(item)}`).join('\n');
  const languages = (data.languages ?? []).join(', ');
  return template
    .replace(/Nome Completo/g, tex(data.name ?? 'Nome Completo'))
    .replace(/Cidade, Estado/g, tex(data.city ?? 'Cidade, Estado'))
    .replace(/seu\.email@exemplo\.com/g, tex(data.email ?? 'seu.email@exemplo.com'))
    .replace(/linkedin\.com\/in\/usuario/g, tex(data.linkedin ?? 'linkedin.com/in/usuario'))
    .replace(/github\.com\/usuario/g, tex(data.github ?? 'github.com/usuario'))
    .replace(/% --- SEÇÕES ---[\s\S]*?\\end\{document\}/, `\\section{Perfil}\n${tex(data.summary)}\n\n\\section{Experiência}\n${experience}\n\n\\section{Habilidades}\n    \\begin{itemize}\n${skills}\n        \\item \\textbf{Idiomas:} ${tex(languages)}\n    \\end{itemize}\n\n\\section{Educação}\n${education}\n\n\\end{document}`);
}
