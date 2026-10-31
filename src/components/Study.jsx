import React, { useState, useMemo } from '../react.js';
import { Icon } from '../icons.jsx';
import { Modal, Sheet, ConfirmDialog } from './ui.jsx';
import { STUDY_TEMPLATES, STUDY_TYPES } from '../templates.js';
import { fmtDate } from '../util.js';
import * as store from '../store.js';

const nd = (e) => e.preventDefault();
export const SUBJECT_COLORS = ['#5B7CFA', '#22A06B', '#E5484D', '#F5A524', '#9B5DE5', '#12A4B5'];
const SUGGEST = ['Mathematics', 'Physics', 'History', 'English', 'العربية', 'Biology'];

const dayDiff = (iso) => {
  if (!iso) return null;
  const d = new Date(iso + 'T00:00:00');
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.round((d - now) / 86400000);
};
export const dueText = (iso) => {
  const n = dayDiff(iso);
  if (n == null) return '';
  if (n < -1) return `${-n} days overdue`;
  if (n === -1) return 'Due yesterday';
  if (n === 0) return 'Due today';
  if (n === 1) return 'Due tomorrow';
  return `Due in ${n} days`;
};

export function SubjectDialog({ initial, onSave, onClose }) {
  const [name, setName] = useState(initial ? initial.name : '');
  const [color, setColor] = useState(initial ? initial.color : SUBJECT_COLORS[0]);
  const [exam, setExam] = useState(initial ? initial.examDate || '' : '');
  return (
    <Modal title={initial ? 'Edit subject' : 'New subject'} onClose={onClose} width={420} footer={
      <><button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
        <button type="button" className="btn primary" disabled={!name.trim()} onClick={() => { onSave({ ...(initial || {}), name: name.trim(), color, examDate: exam || null }); onClose(); }}>{initial ? 'Save' : 'Create'}</button></>
    }>
      <div className="form-stack">
        <label className="field"><span>Subject name</span><input id="sub-name" autoFocus dir="auto" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Physics · الفيزياء" /></label>
        {!initial && <div className="mchips">{SUGGEST.map((s) => <button type="button" key={s} className="mchip" onClick={() => setName(s)}>{s}</button>)}</div>}
        <div className="field"><span>Colour</span>
          <div className="mswatches">{SUBJECT_COLORS.map((c) => <button type="button" key={c} className={'msw' + (color === c ? ' on' : '')} style={{ background: c }} aria-label={'Colour ' + c} onClick={() => setColor(c)} />)}</div>
        </div>
        <label className="field"><span>Exam date (optional)</span><input id="sub-exam" type="date" value={exam} onChange={(e) => setExam(e.target.value)} /></label>
      </div>
    </Modal>
  );
}

export function Study({ docs, subjects, refresh, openDoc, toast, renderRow }) {
  const [current, setCurrent] = useState(null);
  const [type, setType] = useState('all');
  const [dialog, setDialog] = useState(null);
  const [newSheet, setNewSheet] = useState(false);

  const studyDocs = useMemo(() => (docs || []).filter((d) => d.subjectId), [docs]);
  const subject = subjects.find((s) => s.id === current) || null;
  const due = studyDocs.filter((d) => d.studyType === 'assignment' && d.dueDate && !d.done).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const exams = subjects.filter((s) => s.examDate && dayDiff(s.examDate) >= 0).sort((a, b) => a.examDate.localeCompare(b.examDate));

  const create = async (tpl) => {
    setNewSheet(false);
    const extra = { subjectId: subject.id, studyType: tpl.studyType };
    if (tpl.studyType === 'assignment') { const d = new Date(); d.setDate(d.getDate() + 7); extra.dueDate = d.toISOString().slice(0, 10); }
    try { const d = await store.fromTemplate(tpl.id, null, extra); openDoc(d.id); } catch (e) { toast(e.message, 'error'); }
  };
  const update = async (d, patch) => { await store.updateDoc(d.id, { ...patch, updatedAt: d.updatedAt }); refresh(); };

  const subjCount = (id) => studyDocs.filter((d) => d.subjectId === id).length;
  const subjName = (id) => (subjects.find((s) => s.id === id) || {}).name;

  const assignmentRow = (d) => (
    <div key={d.id} className={'due-row' + (d.done ? ' done' : '')}>
      <input type="checkbox" className="due-check" checked={!!d.done} aria-label={'Mark ' + d.title + ' as done'} onChange={(e) => update(d, { done: e.target.checked })} />
      <button type="button" className="due-main" onClick={() => openDoc(d)}>
        <span className="due-title" dir="auto">{d.title}</span>
        <span className={'due-when' + (dayDiff(d.dueDate) < 0 && !d.done ? ' late' : '')}>{d.done ? 'Done' : dueText(d.dueDate)}{!current && subjName(d.subjectId) ? ' · ' + subjName(d.subjectId) : ''}</span>
      </button>
      <input type="date" className="due-date" aria-label={'Due date for ' + d.title} value={d.dueDate || ''} onChange={(e) => update(d, { dueDate: e.target.value || null })} />
    </div>
  );

  if (subject) {
    const list = studyDocs.filter((d) => d.subjectId === subject.id && (type === 'all' || d.studyType === type)).sort((a, b) => b.updatedAt - a.updatedAt);
    const assignments = list.filter((d) => d.studyType === 'assignment');
    const others = type === 'assignment' ? [] : list.filter((d) => d.studyType !== 'assignment');
    const examIn = subject.examDate ? dayDiff(subject.examDate) : null;
    return (
      <>
        <header className="sec-top">
          <button type="button" className="tb lg" aria-label="All subjects" onClick={() => { setCurrent(null); setType('all'); }}><Icon name="ChevronLeft" size={24} /></button>
          <h1 className="subj-h1" dir="auto"><span className="subj-dot" style={{ background: subject.color }} />{subject.name}</h1>
          <div className="sec-top-actions">
            <button type="button" className="tb lg" aria-label="Edit subject" onClick={() => setDialog({ kind: 'edit', s: subject })}><Icon name="Pencil" size={19} /></button>
            <button type="button" className="tb lg accent" aria-label="New study document" onClick={() => setNewSheet(true)}><Icon name="Plus" size={22} /></button>
          </div>
        </header>
        {examIn != null && examIn >= 0 && (
          <div className="exam-card" style={{ '--sc': subject.color }}>
            <Icon name="GraduationCap" size={22} />
            <div><b className="tnum">{examIn === 0 ? 'Exam today' : `${examIn} ${examIn === 1 ? 'day' : 'days'} to the exam`}</b><span>{new Date(subject.examDate + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</span></div>
          </div>
        )}
        <div className="fchips">
          <button type="button" className={'fchip' + (type === 'all' ? ' on' : '')} onClick={() => setType('all')}>All <em>{subjCount(subject.id)}</em></button>
          {STUDY_TYPES.map((t) => {
            const n = studyDocs.filter((d) => d.subjectId === subject.id && d.studyType === t.id).length;
            return <button type="button" key={t.id} className={'fchip' + (type === t.id ? ' on' : '')} onClick={() => setType(t.id)}><Icon name={t.icon} size={14} />{t.label} {n ? <em>{n}</em> : null}</button>;
          })}
        </div>
        {assignments.length > 0 && (
          <section className="sec"><div className="sec-head"><h2>Assignments</h2></div><div className="due-list">{assignments.map(assignmentRow)}</div></section>
        )}
        {others.length > 0 && <section className="sec"><div className="sec-head"><h2>{type === 'all' ? 'Notebook' : STUDY_TYPES.find((t) => t.id === type).label}</h2></div><div className="drows">{others.map(renderRow)}</div></section>}
        {!list.length && (
          <div className="empty">
            <Icon name="NotebookPen" size={28} />
            <p>Nothing here yet. Start class notes, a summary, a revision sheet, an assignment or an exam plan for {subject.name}.</p>
            <button type="button" className="btn primary" onClick={() => setNewSheet(true)}><Icon name="Plus" size={18} />New study document</button>
          </div>
        )}
        <Sheet open={newSheet} onClose={() => setNewSheet(false)} title={'New in ' + subject.name}>
          <div className="mlist">
            {STUDY_TEMPLATES.filter((t) => type === 'all' || t.studyType === type).map((t) => (
              <button type="button" key={t.id} className="mrow" onMouseDown={nd} onClick={() => create(t)}>
                <span className="mrow-ico"><Icon name={(STUDY_TYPES.find((x) => x.id === t.studyType) || {}).icon || 'FileText'} size={19} /></span>
                <span className="mrow-label"><span dir="auto">{t.name}</span><small>{t.desc}</small></span>
                <span className="mrow-val">{t.lang}</span>
              </button>
            ))}
          </div>
        </Sheet>
        {dialog && dialog.kind === 'edit' && <SubjectDialog initial={dialog.s} onClose={() => setDialog(null)} onSave={async (v) => { await store.saveSubject(v); refresh(); }} />}
        <div className="subj-foot"><button type="button" className="link-btn danger-text" onClick={() => setDialog({ kind: 'delete', s: subject })}><Icon name="Trash2" size={14} />Delete subject</button></div>
        {dialog && dialog.kind === 'delete' && <ConfirmDialog title="Delete subject?" message={`“${subject.name}” will be removed. Its documents stay in Documents.`} onClose={() => setDialog(null)} onConfirm={async () => { await store.deleteSubject(subject.id); setCurrent(null); refresh(); }} />}
      </>
    );
  }

  return (
    <>
      <header className="sec-top">
        <h1>Study</h1>
        <div className="sec-top-actions">
          <button type="button" className="tb lg accent" aria-label="New subject" onClick={() => setDialog({ kind: 'new' })}><Icon name="Plus" size={22} /></button>
        </div>
      </header>
      {!subjects.length ? (
        <div className="empty">
          <Icon name="GraduationCap" size={30} />
          <p>Organise notes, research, summaries, revision, assignments and exam prep by subject. Start by adding your first subject.</p>
          <button type="button" className="btn primary" onClick={() => setDialog({ kind: 'new' })}><Icon name="Plus" size={18} />Add a subject</button>
        </div>
      ) : (
        <>
          <div className="study-stats">
            <div><b className="tnum">{subjects.length}</b><span>subjects</span></div>
            <div><b className="tnum">{studyDocs.length}</b><span>study docs</span></div>
            <div><b className="tnum">{due.length}</b><span>to do</span></div>
          </div>
          {exams.length > 0 && (
            <section className="sec">
              <div className="sec-head"><h2>Upcoming exams</h2></div>
              <div className="exam-row">
                {exams.map((s) => { const n = dayDiff(s.examDate); return (
                  <button type="button" key={s.id} className="exam-chip" style={{ '--sc': s.color }} onClick={() => setCurrent(s.id)}>
                    <b className="tnum">{n === 0 ? 'Today' : n}</b><span>{n === 0 ? '' : n === 1 ? 'day' : 'days'}</span><em dir="auto">{s.name}</em>
                  </button>
                ); })}
              </div>
            </section>
          )}
          {due.length > 0 && (
            <section className="sec"><div className="sec-head"><h2>Due soon</h2></div><div className="due-list">{due.slice(0, 6).map(assignmentRow)}</div></section>
          )}
          <section className="sec">
            <div className="sec-head"><h2>Subjects</h2></div>
            <div className="subj-grid">
              {subjects.map((s) => {
                const next = due.find((d) => d.subjectId === s.id);
                return (
                  <button type="button" key={s.id} className="subj-card" style={{ '--sc': s.color }} onClick={() => setCurrent(s.id)}>
                    <span className="subj-bar" />
                    <span className="subj-name" dir="auto">{s.name}</span>
                    <span className="subj-meta">{subjCount(s.id)} {subjCount(s.id) === 1 ? 'document' : 'documents'}</span>
                    <span className="subj-next">{next ? dueText(next.dueDate) + ': ' + next.title : s.examDate && dayDiff(s.examDate) >= 0 ? 'Exam on ' + new Date(s.examDate + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : 'Nothing due'}</span>
                  </button>
                );
              })}
            </div>
          </section>
        </>
      )}
      {dialog && dialog.kind === 'new' && <SubjectDialog onClose={() => setDialog(null)} onSave={async (v) => { const s = await store.saveSubject(v); await refresh(); setCurrent(s.id); }} />}
    </>
  );
}
