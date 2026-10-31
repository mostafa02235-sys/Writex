// The Writex AI task catalogue. Each task says which model tier it needs, how to
// read long sources in stages ("map"), and how to produce the final answer.
// The app sends a task type plus its input; prompts live here, on the server.

const LANG = (pref) => (pref === 'ar' ? 'Write the answer in Arabic.'
  : pref === 'en' ? 'Write the answer in English.'
    : 'Write the answer in the same language as the user\'s request, or the documents\' language if the request has none. Arabic and English may both appear; keep each term in its original script.');

export const SYSTEM = `You are Writex AI, the assistant built into the Writex writing, reading and study app.
Be accurate and well organised. When documents are provided, rely on them and say clearly when something is not in them; never invent quotes, facts or sources.
Use plain text with simple Markdown (headings with #, lists with -, **bold**) unless JSON is requested.`;

const docs = 'the documents';
// Notes extracted from one part of a long document during the "analyzing" stage
const mapNotes = (goal) => `You are reading one part of a longer document set. Extract only what is needed for this goal: ${goal}
Write compact notes: key facts, names, numbers, definitions, arguments and short exact quotes where useful. Mark which document each note comes from. If this part has nothing relevant, reply "(nothing relevant)".`;

export const TASKS = {
  // Generic prompt used by the app's built-in tools (writing assistant, studio, learn, companion)
  prompt: { tier: (i) => (i.quality === 'best' || (i.prompt || '').length > 30000 ? 'smart' : 'fast'), direct: true },
  chat: { tier: (i) => (i.hasImages ? 'vision' : 'smart'), chat: true, goal: (i) => `answer the user's latest message: "${lastUser(i)}"` },

  // Writing
  write: { tier: () => 'smart', final: (i) => `Write a complete, well-structured document.\nBrief: ${i.brief}\n${i.length ? 'Length: ' + i.length + '\n' : ''}${i.tone ? 'Tone: ' + i.tone + '\n' : ''}Use headings and paragraphs. ${LANG(i.lang)}` },
  continue: { tier: () => 'fast', final: (i) => `Continue the text below naturally from where it stops, in the same language, voice and formatting. Write about ${i.paragraphs || 2} paragraphs. Reply with only the continuation.\n\nText:\n"""\n${i.text}\n"""` },
  organize: { tier: () => 'smart', final: (i) => `Reorganise the text below into a clear structure: logical order, headings where useful, merged duplicates, smooth transitions. Keep all information and the original language. Reply with only the reorganised text.\n\nText:\n"""\n${i.text}\n"""` },

  // Document intelligence
  summarize: { tier: (i, n) => (n > 40000 ? 'smart' : 'fast'), goal: () => 'a faithful summary of the main points', final: (i) => `Summarise ${docs}. Length: ${i.length || 'medium'} (short = 3-4 sentences, medium = a paragraph and 5-7 key points, detailed = section by section). ${LANG(i.lang)}` },
  analyze: { tier: () => 'smart', goal: (i) => `answering this question: ${i.question}`, final: (i) => `Answer this question using only ${docs}: ${i.question}\nQuote the supporting passages briefly. If the answer is not in them, say so. ${LANG(i.lang)}` },
  compare: { tier: () => 'smart', minSources: 2, goal: (i) => `comparing the documents${i.focus ? ' on: ' + i.focus : ''}: claims, data, structure, agreements and contradictions`, final: (i) => `Compare ${docs}${i.focus ? ' with focus on: ' + i.focus : ''}. Cover: what each covers, key similarities, key differences, contradictions or inconsistencies (cite which document), and a short conclusion. Use a table where it helps. ${LANG(i.lang)}` },
  inconsistencies: { tier: () => 'smart', goal: () => 'finding statements, numbers, dates or names that contradict each other', final: (i) => `List inconsistencies and contradictions found in ${docs}: for each, quote both statements and say where they are. If there are none, say so. ${LANG(i.lang)}` },
  extract: { tier: (i, n) => (n > 40000 ? 'smart' : 'fast'), goal: (i) => `extracting ${i.what || 'key information, names, dates, numbers and tables'}`, final: (i) => `Extract ${i.what || 'the key information (people, organisations, dates, numbers, definitions) and every table'} from ${docs}. Present tables as Markdown tables. Do not add anything that is not in the documents. ${LANG(i.lang)}` },

  // Study
  study_guide: { tier: () => 'smart', goal: () => 'building a study guide: concepts, definitions, formulas, examples', final: (i) => `Create a complete study guide from ${docs}: overview, chapters/sections with key concepts, definitions, formulas or rules, worked examples from the text, common mistakes, and a final checklist. ${LANG(i.lang)}` },
  quiz: { tier: () => 'smart', json: true, goal: () => 'writing exam questions (facts, concepts and their relations)', final: (i) => `Write a ${i.difficulty || 'hard'} quiz of ${i.count || 10} questions from ${docs} only. Mix multiple choice (4 options), true/false and short answer. Every question must be answerable from the documents. Reply with only JSON: {"title":"","questions":[{"type":"mcq|tf|short","q":"","options":[""],"answer":"","explanation":"","quote":"exact short phrase from the documents"}]}. ${LANG(i.lang)}` },
  flashcards: { tier: () => 'fast', json: true, goal: () => 'listing terms, definitions and facts worth memorising', final: (i) => `Create ${i.count || 20} flashcards from ${docs} only. Reply with only JSON: {"cards":[{"front":"","back":"","quote":"exact short phrase from the documents"}]}. ${LANG(i.lang)}` },
  revision_plan: { tier: () => 'smart', goal: () => 'listing the topics and their difficulty', final: (i) => `Create a ${i.days || 7}-day revision plan for ${docs}${i.examDate ? ' (exam on ' + i.examDate + ')' : ''}: daily topics, active-recall tasks, practice, and review days. ${LANG(i.lang)}` },
  chapters: { tier: () => 'smart', goal: () => 'identifying lessons, topics and their order', final: (i) => `Organise the material in ${docs} into chapters and lessons: give each a title, the topics it covers and learning objectives, in a sensible teaching order. ${LANG(i.lang)}` },
  explain: { tier: () => 'smart', goal: (i) => `explaining: ${i.topic || 'the main subject'}`, final: (i) => `Explain ${i.topic ? '"' + i.topic + '"' : 'the subject of ' + docs} clearly for a student: start simple, then go deeper, with examples and analogies, and define every technical term. ${LANG(i.lang)}` },

  // Research
  research_outline: { tier: () => 'smart', goal: () => 'collecting arguments, evidence and gaps for a research outline', final: (i) => `Create a research outline${i.topic ? ' on "' + i.topic + '"' : ''}${i.hasSources ? ' using the supplied sources' : ''}: research question, hypotheses or aims, sections with the points and evidence for each${i.hasSources ? ' (cite which source)' : ''}, methodology ideas, and open questions. ${LANG(i.lang)}` },
  sources_review: { tier: () => 'smart', minSources: 1, goal: () => 'recording each source\'s claim, method, evidence and limits', final: (i) => `Review the supplied sources one by one: main claim, method, key evidence, strengths, limitations. Then compare them and suggest how to organise them as references. ${LANG(i.lang)}` },
};

function lastUser(i) {
  const m = [...(i.messages || [])].reverse().find((x) => x.role === 'user');
  return m ? String(typeof m.content === 'string' ? m.content : '').slice(0, 500) : '';
}

export { mapNotes };
