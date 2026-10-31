// Ready-made documents, expressed as Quill deltas.
import { DEFAULT_SETTINGS, FONTS } from './constants.js';
import { tr } from './i18n.js';

const font = (n) => FONTS.find((f) => f.name === n).stack;

function build(lines) {
  const ops = [];
  for (const line of lines) {
    if (line.embed) { ops.push({ insert: { [line.embed]: line.value === undefined ? true : line.value } }); continue; }
    const runs = typeof line.t === 'string' ? [[line.t]] : line.t || [['']];
    for (const [text, attrs] of runs) {
      if (!text) continue;
      ops.push(attrs ? { insert: text, attributes: attrs } : { insert: text });
    }
    ops.push({ insert: '\n', attributes: { dir: 'auto', ...(line.a || {}) } });
  }
  return { ops };
}
const p = (t, a) => ({ t, a });
const h = (lvl, t, a) => ({ t, a: { header: lvl, ...(a || {}) } });
const li = (t, kind = 'bullet', a) => ({ t, a: { list: kind, ...(a || {}) } });
const br = () => ({ embed: 'pagebreak' });
const hr = () => ({ embed: 'divider' });
function table(rows, headerBold = true) {
  const out = [];
  rows.forEach((cells, r) => {
    const id = 'row-' + Math.random().toString(36).slice(2, 6);
    cells.forEach((c) => {
      if (c) out.push({ t: [[c, headerBold && r === 0 ? { bold: true } : undefined]], a: { table: id } });
      else out.push({ t: [['']], a: { table: id } });
    });
  });
  // table lines must not carry dir attr
  return out.map((l) => ({ ...l, tableLine: true }));
}
function buildWithTables(lines) {
  const flat = [];
  lines.forEach((l) => (Array.isArray(l) ? flat.push(...l) : flat.push(l)));
  const d = build(flat);
  // strip dir from table lines
  d.ops.forEach((op) => { if (op.attributes && op.attributes.table) delete op.attributes.dir; });
  return d;
}

const S = (over) => ({ ...DEFAULT_SETTINGS, ...over, margins: { ...DEFAULT_SETTINGS.margins, ...(over && over.margins) } });

export const TEMPLATES = [
  {
    id: 'blank', name: tr('Blank document'), lang: 'EN', desc: tr('A clean A4 page.'),
    settings: () => S(), delta: () => ({ ops: [{ insert: '\n', attributes: { dir: 'auto' } }] }),
  },
  {
    id: 'blank-ar', name: 'مستند فارغ', lang: 'AR', desc: tr('Right-to-left page with an Arabic font.'),
    settings: () => S({ dir: 'rtl', font: font('Noto Naskh Arabic'), fontSize: 14, lineHeight: 1.5 }),
    delta: () => ({ ops: [{ insert: '\n', attributes: { dir: 'auto' } }] }),
  },
  {
    id: 'school-research', name: 'بحث مدرسي', lang: 'AR', desc: tr('Cover page, introduction, sections and references.'),
    settings: () => S({
      dir: 'rtl', font: font('Noto Naskh Arabic'), fontSize: 14, lineHeight: 1.6,
      header: { text: 'بحث مدرسي · {title}', align: 'center' },
      pageNumbers: { on: true, where: 'footer', align: 'center', format: 'ar' }, firstPageDifferent: true,
    }),
    delta: () => build([
      p([['وزارة التربية والتعليم', { bold: true }]], { align: 'center' }),
      p('مدرسة النور الثانوية', { align: 'center' }),
      p('', {}), p('', {}), p('', {}),
      h(1, [['أثر التكنولوجيا على التعليم', { size: '28pt', color: '#1D4ED8' }]], { align: 'center' }),
      p([['بحث مقدَّم لمادة العلوم الاجتماعية', { italic: true }]], { align: 'center' }),
      p('', {}), p('', {}),
      p([['إعداد الطالب: ', { bold: true }], ['اكتب اسمك هنا']], { align: 'center' }),
      p([['الصف: ', { bold: true }], ['العاشر']], { align: 'center' }),
      p([['إشراف: ', { bold: true }], ['الأستاذ/ة …']], { align: 'center' }),
      p([['العام الدراسي 2026 / 2027']], { align: 'center' }),
      br(),
      h(2, 'المقدمة'),
      p('تشهد مدارسنا اليوم تحولًا واسعًا في أساليب التعلم بفضل الحواسيب والأجهزة اللوحية والإنترنت. يتناول هذا البحث أبرز آثار التكنولوجيا على الطالب والمعلم، ويعرض فوائدها وتحدياتها، ثم يقترح طرقًا لاستخدامها بشكل متوازن.', { align: 'justify' }),
      h(2, 'أهداف البحث'),
      li('التعرف على أدوات التعليم الرقمي الأكثر انتشارًا.', 'ordered'),
      li('بيان أثر التكنولوجيا على التحصيل الدراسي.', 'ordered'),
      li('اقتراح توصيات لاستخدام آمن ومفيد.', 'ordered'),
      h(2, 'أولًا: فوائد التكنولوجيا في التعليم'),
      p('تتيح التكنولوجيا الوصول السريع إلى المعلومات، وتجعل الدروس أكثر تفاعلًا من خلال الصور ومقاطع الفيديو والتجارب الافتراضية. كما تساعد الطالب على التعلم وفق سرعته الخاصة.', { align: 'justify' }),
      li('مصادر تعلم متنوعة ومتاحة في أي وقت.'),
      li('تواصل أسهل بين الطالب والمعلم وولي الأمر.'),
      li('تنمية مهارات البحث والتفكير الناقد.'),
      h(2, 'ثانيًا: التحديات'),
      p('من أبرز التحديات: تشتت الانتباه، والاعتماد الزائد على الشاشات، وعدم تكافؤ فرص الوصول إلى الأجهزة والإنترنت بين الطلاب.', { align: 'justify' }),
      h(2, 'الخاتمة والتوصيات'),
      p('التكنولوجيا وسيلة قوية إذا أُحسن استخدامها. نوصي بتحديد أوقات للاستخدام، وتدريب المعلمين، وتوفير الأجهزة للطلاب المحتاجين.', { align: 'justify' }),
      h(2, 'المراجع'),
      li('اسم المؤلف، عنوان الكتاب، دار النشر، سنة النشر.', 'ordered'),
      li('عنوان المقال، اسم الموقع، تاريخ الزيارة.', 'ordered'),
    ]),
  },
  {
    id: 'academic-report', name: tr('Academic Report'), lang: 'EN', desc: tr('Abstract, numbered sections, a results table.'),
    settings: () => S({
      font: font('Source Serif 4'), fontSize: 11, lineHeight: 1.5,
      header: { text: '{title}', align: 'right' },
      pageNumbers: { on: true, where: 'footer', align: 'center', format: 'n' }, firstPageDifferent: true,
    }),
    delta: () => buildWithTables([
      h(1, [['Remote Learning and Student Outcomes', { size: '24pt' }]], { align: 'center' }),
      p([['A study of 412 secondary-school students, 2025–2026', { italic: true, color: '#3A3F4B' }]], { align: 'center' }),
      p([['Your Name · Department of Education · October 2026']], { align: 'center' }),
      hr(),
      h(3, 'Abstract'),
      p('This report examines how structured remote learning affected attendance, assignment completion and end-of-term grades. Students who followed a fixed weekly schedule completed 18% more assignments than those who did not. We discuss limitations and recommend practices for schools adopting blended learning.', { align: 'justify' }),
      h(2, '1. Introduction'),
      p('Blended learning is now common in secondary education. Yet evidence on which practices help students most is mixed. This study asks a narrow question: does a predictable weekly structure improve outcomes?', { align: 'justify' }),
      h(2, '2. Method'),
      p('We surveyed 412 students across six schools and collected anonymised records for one academic term. Students were grouped by whether their school published a fixed weekly timetable for online sessions.', { align: 'justify' }),
      h(2, '3. Results'),
      table([
        ['Measure', 'Fixed schedule', 'Flexible schedule'],
        ['Attendance', '94%', '87%'],
        ['Assignments completed', '88%', '70%'],
        ['Average grade', '78 / 100', '71 / 100'],
      ]),
      p([['Table 1. ', { bold: true }], ['Outcomes by schedule type (n = 412).', { italic: true }]]),
      h(2, '4. Discussion'),
      p('A fixed schedule appears to support completion more than attendance. Schools should publish timetables early and keep them stable across the term.', { align: 'justify' }),
      h(2, 'References'),
      li('Author, A. (2025). Title of the work. Publisher.', 'ordered'),
      li('Author, B., & Author, C. (2024). Article title. Journal Name, 12(3), 45–67.', 'ordered'),
    ]),
  },
  {
    id: 'personal-notes', name: tr('Personal Notes'), lang: 'EN', desc: tr('Dated notes, to-dos and ideas in both languages.'),
    settings: () => S({ font: font('Lato'), fontSize: 12, lineHeight: 1.4, margins: { t: 72, b: 72, l: 72, r: 72 }, marginPreset: 'custom' }),
    delta: () => build([
      h(1, 'Notes'),
      p([['Saturday, 31 October 2026', { color: '#6B7280' }]]),
      h(3, 'Today'),
      li('Finish the history summary before 6 pm'),
      li('Call the bookshop about the order'),
      li('Review chapter 4 notes', 'bullet', { indent: 1 }),
      h(3, 'Ideas'),
      p('A short video about how calligraphers cut a qalam (reed pen) — film close-ups of the nib.'),
      p([['ملاحظة: ', { bold: true }], ['تذكّر شراء دفتر جديد للخط العربي.']]),
      { t: [['Small steps every day add up.', { italic: true }]], a: { blockquote: true } },
    ]),
  },
  {
    id: 'story', name: 'كتابة قصة', lang: 'AR', desc: tr('Chapter layout with generous spacing for fiction.'),
    settings: () => S({
      dir: 'rtl', font: font('Amiri'), fontSize: 16, lineHeight: 1.9,
      margins: { t: 110, b: 110, l: 110, r: 110 }, marginPreset: 'custom',
      pageNumbers: { on: true, where: 'footer', align: 'center', format: 'dash' },
    }),
    delta: () => build([
      p([['الفصل الأول', { color: '#6B7280', size: '13pt' }]], { align: 'center' }),
      h(1, [['ليلة المطر', { size: '30pt' }]], { align: 'center' }),
      p([['❖', { color: '#9CA3AF' }]], { align: 'center' }),
      p('كان المطر يطرق النافذة بإيقاع هادئ، وكانت المدينة قد أطفأت أنوارها واحدًا تلو الآخر. جلستُ أمام الدفتر المفتوح، والقلم بين أصابعي، أنتظر أن تأتي الجملة الأولى.', { align: 'justify' }),
      p('في تلك الليلة لم تكن الكلمات تأتي كعادتها. كانت تقف عند حافة الورقة، تتردّد، ثم تعود إلى الظل. قلتُ لنفسي: سأكتب ما أراه فقط. الضوء الأصفر، صوت الماء، ورائحة الشاي الذي برد منذ ساعة.', { align: 'justify' }),
      p('ثم سمعتُ الطرق على الباب.', { align: 'justify' }),
      p([['❖', { color: '#9CA3AF' }]], { align: 'center' }),
      p('اكمل القصة من هنا…', { align: 'justify' }),
    ]),
  },
  {
    id: 'letter', name: tr('Professional Letter'), lang: 'EN', desc: tr('Sender block, date, subject line and sign-off.'),
    settings: () => S({ font: font('Open Sans'), fontSize: 11, lineHeight: 1.4 }),
    delta: () => build([
      p([['Your Name', { bold: true }]], { align: 'right' }),
      p('12 Garden Street, Apt 4', { align: 'right' }),
      p('your.email@example.com', { align: 'right' }),
      p(''),
      p('31 October 2026'),
      p(''),
      p('Ms. Layla Haddad'),
      p('Hiring Manager, Northwind Publishing'),
      p('48 Harbour Road'),
      p(''),
      p([['Subject: Application for the Junior Editor position', { bold: true }]]),
      p(''),
      p('Dear Ms. Haddad,'),
      p('I am writing to apply for the Junior Editor position advertised on your website. I have three years of experience editing school publications and bilingual (Arabic–English) content, and I would welcome the chance to bring that experience to Northwind.', { align: 'justify', spaceafter: '8px' }),
      p('In my current role I edit around twenty articles a month, manage a style guide, and coordinate with designers on layout. I am confident I can support your team from the first week.', { align: 'justify', spaceafter: '8px' }),
      p('Thank you for your time and consideration. I look forward to hearing from you.', { align: 'justify', spaceafter: '8px' }),
      p(''),
      p('Sincerely,'),
      p(''),
      p([['Your Name', { bold: true }]]),
    ]),
  },
];

export const WELCOME = {
  title: 'Welcome to Writex',
  settings: () => S({ pageNumbers: { on: true, where: 'footer', align: 'center', format: 'pageof' }, header: { text: 'Writex · Getting started', align: 'left' } }),
  delta: () => buildWithTables([
    p([['Example document', { color: '#6B7280', size: '10pt' }]]),
    h(1, 'Welcome to Writex'),
    p('This is a real document. Edit anything — your changes save automatically in this browser. Use the ribbon above: Home for text and paragraphs, Insert for tables, images and page breaks, Layout for page size and margins, Review for word count and find & replace, and View for zoom and dark mode.'),
    h(2, 'Arabic and English together'),
    p('Each paragraph picks its own direction from its first letters, so you can mix languages freely.'),
    p('هذه فقرة باللغة العربية تُكتب من اليمين إلى اليسار تلقائيًا، ويمكن أن تحتوي على كلمات English داخلها دون أي مشكلة في علامات الترقيم.'),
    p([['Tip: ', { bold: true }], ['use the direction buttons in Home → Paragraph to force a paragraph RTL or LTR.']]),
    h(2, 'Formatting'),
    li([['Bold', { bold: true }], [', '], ['italic', { italic: true }], [', '], ['underline', { underline: true }], [', '], ['strikethrough', { strike: true }], [', '], ['colour', { color: '#1D4ED8' }], [' and '], ['highlight', { background: '#FFF3A3' }], ['.']]),
    li('Bulleted and numbered lists with Tab to nest:'),
    li('Nested item', 'bullet', { indent: 1 }),
    li('Line spacing, paragraph spacing and indentation.'),
    h(2, 'Tables'),
    table([
      ['Shortcut', 'Action'],
      ['Ctrl + Enter', 'Insert page break'],
      ['Ctrl + F', 'Find'],
      ['Ctrl + H', 'Replace'],
    ]),
    p(''),
    p('The next part sits on a new page because of a manual page break.'),
    br(),
    h(2, 'Exporting'),
    p('Open the File menu or the Export button to save this document as PDF or Word (.docx). You can also import an existing .docx from the library.'),
  ]),
};

/* ---------- study templates ---------- */
const todayStr = () => new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
export const STUDY_TEMPLATES = [
  {
    id: 'study-class-notes', name: tr('Class Notes'), lang: 'EN', studyType: 'notes', desc: tr('Cornell layout: cues, notes and a summary.'),
    settings: () => S({ font: font('Lato'), fontSize: 11, lineHeight: 1.4, margins: { t: 72, b: 72, l: 72, r: 72 }, marginPreset: 'custom' }),
    delta: () => buildWithTables([
      h(1, 'Lesson title'),
      p([['Date: ', { bold: true }], [todayStr()], ['   ·   Teacher: ', { bold: true }], ['…']]),
      table([
        ['Questions & cues', 'Notes'],
        ['What is the main idea?', 'Write notes during class here.'],
        ['Key term', 'Definition and example.'],
        ['', ''],
      ]),
      h(3, 'Summary'),
      p('After class, sum up the lesson in three or four sentences.'),
    ]),
  },
  {
    id: 'study-class-notes-ar', name: 'ملاحظات الحصة', lang: 'AR', studyType: 'notes', desc: tr('Cornell layout in Arabic.'),
    settings: () => S({ dir: 'rtl', font: font('IBM Plex Sans Arabic'), fontSize: 12, lineHeight: 1.6, margins: { t: 72, b: 72, l: 72, r: 72 }, marginPreset: 'custom' }),
    delta: () => buildWithTables([
      h(1, 'عنوان الدرس'),
      p([['التاريخ: ', { bold: true }], [todayStr()], ['   ·   المعلم: ', { bold: true }], ['…']]),
      table([
        ['أسئلة وكلمات مفتاحية', 'الملاحظات'],
        ['ما الفكرة الرئيسية؟', 'اكتب ملاحظاتك أثناء الحصة هنا.'],
        ['مصطلح مهم', 'التعريف ومثال عليه.'],
        ['', ''],
      ]),
      h(3, 'الخلاصة'),
      p('بعد الحصة، لخّص الدرس في ثلاث أو أربع جمل.'),
    ]),
  },
  {
    id: 'study-summary', name: tr('Chapter Summary'), lang: 'EN', studyType: 'summary', desc: tr('Key ideas, terms and one-line takeaways.'),
    settings: () => S({ font: font('Source Serif 4'), fontSize: 11.5, lineHeight: 1.45 }),
    delta: () => build([
      h(1, 'Chapter summary'),
      p([['Source: ', { bold: true }], ['Book or lecture, chapter, pages']]),
      h(2, 'Key ideas'),
      li('First main idea in your own words.', 'ordered'),
      li('Second main idea.', 'ordered'),
      li('Third main idea.', 'ordered'),
      h(2, 'Important terms'),
      li([['Term', { bold: true }], [' — short definition.']]),
      li([['Term', { bold: true }], [' — short definition.']]),
      h(2, 'One-sentence takeaway'),
      { t: [['Write the single most important point here.', { italic: true }]], a: { blockquote: true } },
    ]),
  },
  {
    id: 'study-revision', name: tr('Revision Sheet'), lang: 'EN', studyType: 'revision', desc: tr('Terms table, formulas and practice questions.'),
    settings: () => S({ font: font('Lato'), fontSize: 11, lineHeight: 1.35, margins: { t: 60, b: 60, l: 60, r: 60 }, marginPreset: 'custom' }),
    delta: () => buildWithTables([
      h(1, 'Revision: topic'),
      h(3, 'Must-know terms'),
      table([
        ['Term', 'Meaning', 'Example'],
        ['', '', ''],
        ['', '', ''],
      ]),
      h(3, 'Formulas & rules'),
      li('Rule or formula, with when to use it.'),
      h(3, 'Practice questions'),
      li('Question 1', 'ordered'),
      li('Question 2', 'ordered'),
      h(3, 'Mistakes I usually make'),
      li('…'),
    ]),
  },
  {
    id: 'study-assignment', name: tr('Assignment'), lang: 'EN', studyType: 'assignment', desc: tr('Task, requirements checklist, plan and submission.'),
    settings: () => S({ font: font('Open Sans'), fontSize: 11, lineHeight: 1.4, pageNumbers: { on: true, where: 'footer', align: 'center', format: 'n' } }),
    delta: () => build([
      h(1, 'Assignment title'),
      p([['Course: ', { bold: true }], ['…'], ['   ·   Due: ', { bold: true }], ['…']]),
      h(2, 'The task'),
      p('Copy the assignment brief here so everything is in one place.'),
      h(2, 'Requirements'),
      li('Requirement one', 'unchecked'),
      li('Requirement two', 'unchecked'),
      li('Word limit / format', 'unchecked'),
      h(2, 'Plan'),
      li('Research', 'ordered'), li('First draft', 'ordered'), li('Edit and check sources', 'ordered'), li('Submit', 'ordered'),
      h(2, 'Draft'),
      p('Start writing here.'),
    ]),
  },
  {
    id: 'study-exam', name: tr('Exam Preparation'), lang: 'EN', studyType: 'exam', desc: tr('Topics with confidence levels and a study schedule.'),
    settings: () => S({ font: font('Lato'), fontSize: 11, lineHeight: 1.35 }),
    delta: () => buildWithTables([
      h(1, 'Exam preparation'),
      p([['Exam: ', { bold: true }], ['Subject · date · room']]),
      h(2, 'Topics'),
      table([
        ['Topic', 'Confidence (1–5)', 'Next step'],
        ['', '', ''],
        ['', '', ''],
        ['', '', ''],
      ]),
      h(2, 'Schedule'),
      li([['Day 1: ', { bold: true }], ['review notes for topic A']]),
      li([['Day 2: ', { bold: true }], ['practice questions']]),
      li([['Day 3: ', { bold: true }], ['past paper under timed conditions']]),
      h(2, 'On the day'),
      li('Pens, calculator, ID', 'unchecked'),
    ]),
  },
  {
    id: 'study-research', name: tr('Research Notes'), lang: 'EN', studyType: 'research', desc: tr('Question, sources, findings and conclusion.'),
    settings: () => S({ font: font('Source Serif 4'), fontSize: 11.5, lineHeight: 1.5, pageNumbers: { on: true, where: 'footer', align: 'center', format: 'n' } }),
    delta: () => build([
      h(1, 'Research question'),
      p('What exactly are you trying to find out?'),
      h(2, 'Sources'),
      li('Author (year). Title. Where it was published.', 'ordered'),
      h(2, 'Findings'),
      p('What each source says, and how they agree or disagree.'),
      h(2, 'Conclusion'),
      p('Your answer to the question, with the strongest evidence.'),
    ]),
  },
];

export const STUDY_TYPES = [
  { id: 'notes', label: 'Class notes', icon: 'NotebookPen' },
  { id: 'research', label: 'Research', icon: 'Microscope' },
  { id: 'summary', label: 'Summaries', icon: 'ListChecks' },
  { id: 'revision', label: 'Revision', icon: 'Repeat' },
  { id: 'assignment', label: 'Assignments', icon: 'ClipboardList' },
  { id: 'exam', label: 'Exam prep', icon: 'GraduationCap' },
];

export const allTemplates = () => [...TEMPLATES, ...STUDY_TEMPLATES];

/* ---------- cover pages ---------- */
// Returns ops for a cover page followed by a page break; text is fully editable.
export function coverOps(style, { title, subtitle, author, date, rtl }) {
  const T = title || (rtl ? 'عنوان المستند' : 'Document title');
  const Sub = subtitle || (rtl ? 'العنوان الفرعي' : 'Subtitle');
  const A = author || (rtl ? 'اسم الكاتب' : 'Author name');
  const D = date || todayStr();
  const ink = '#1D4ED8';
  let lines;
  if (style === 'classic') {
    lines = [p(''), p(''), p(''), p(''),
      h(1, [[T, { size: '34pt' }]], { align: 'center' }),
      p([[Sub, { size: '15pt', italic: true, color: '#3A3F4B' }]], { align: 'center' }),
      p(''), p([['❖', { color: '#9CA3AF' }]], { align: 'center' }), p(''), p(''), p(''), p(''), p(''),
      p([[A, { bold: true }]], { align: 'center' }),
      p([[D, { color: '#6B7280' }]], { align: 'center' })];
  } else if (style === 'bold') {
    lines = [p(''), p(''),
      p([[(rtl ? 'تقرير' : 'REPORT'), { bold: true, color: ink, size: '12pt' }]]),
      h(1, [[T, { size: '44pt', color: '#111827' }]]),
      { embed: 'divider' },
      p([[Sub, { size: '16pt', color: '#3A3F4B' }]]),
      p(''), p(''), p(''), p(''), p(''), p(''), p(''), p(''),
      p([[A, { bold: true, size: '13pt' }]]),
      p([[D, { color: '#6B7280' }]])];
  } else {
    lines = [p(''), p(''), p(''), p(''), p(''), p(''),
      h(1, [[T, { size: '30pt' }]]),
      p([[Sub, { color: '#6B7280', size: '13pt' }]]),
      p(''), p(''), p(''), p(''), p(''), p(''), p(''), p(''), p(''),
      p([[A + ' · ' + D, { size: '10.5pt', color: '#6B7280' }]])];
  }
  const d = build([...lines, br()]);
  return d.ops;
}
