// Settings › Writex AI: on-device models (install, choose, remove), memory,
// storage, speed, privacy and conversation history.
import React, { useState, useEffect } from '../react.js';
import { Icon } from '../icons.jsx';
import { Seg, ConfirmDialog } from './ui.jsx';
import * as local from '../localAI.js';
import * as engine from '../aiEngine.js';
import * as db from '../db.js';
import { storage } from '../util.js';
import { tr, trn } from '../i18n.js';

const fmtBytes = (n) => (n >= 1073741824 ? (n / 1073741824).toFixed(1) + ' GB' : Math.round(n / 1048576) + ' MB');

export function AISettings({ toast }) {
  const [dev, setDev] = useState(null);
  const [dl, setDl] = useState(null);          // {id, received, total, state}
  const [active, setActiveState] = useState(local.activeId());
  const [lang, setLang] = useState(storage.get('writex.aiLang', 'auto'));
  const [jobs, setJobs] = useState(0);
  const [chats, setChats] = useState(0);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState('');

  const refresh = async () => {
    if (!local.supported) return;
    try { setDev(await local.device()); } catch (e) { toast(e.message, 'error'); }
    setActiveState(local.activeId());
    engine.listJobs().then((l) => setJobs(l.length));
    db.getAll('aichats').then((l) => setChats(l.length)).catch(() => {});
  };
  useEffect(() => {
    refresh();
    const off = local.onDownload((ev) => { setDl(ev); if (ev.state !== 'downloading') refresh(); });
    return off;
  }, []);

  if (!local.supported) {
    return (
      <section className="set-group">
        <h2>{tr('Writex AI')}</h2>
        <div className="set-card"><div className="set-row"><span className="set-label">{tr('Available in the Android app')}<small>{tr('Writex AI runs on your Android phone with a model stored on the device. Install the Writex app to use it.')}</small></span><Icon name="Smartphone" size={20} /></div></div>
      </section>
    );
  }
  if (!dev) return <section className="set-group"><h2>{tr('Writex AI')}</h2><div className="set-card"><div className="set-row"><span className="spin" /></div></div></section>;

  const installed = local.installedSet(dev);
  const rec = local.recommended(dev);
  const current = local.MODELS.find((m) => m.id === active && installed.has(m.id)) || local.MODELS.slice().reverse().find((m) => installed.has(m.id));
  const speed = local.speed();
  const usedBytes = (dev.files || []).reduce((n, f) => n + f.size, 0);

  const install = async (m) => {
    setBusy(m.id);
    setDl({ id: m.id, received: 0, total: m.size, state: 'downloading' });
    try {
      await local.install(m.id);
      local.setActive(m.id); setActiveState(m.id);
      toast(tr('{0} installed. Writex AI now works offline.', m.name));
    } catch (e) { if (e.code !== 'cancelled') toast(e.message, 'error'); }
    setBusy(''); setDl(null); refresh();
  };
  const use = async (m) => { local.setActive(m.id); setActiveState(m.id); await local.unload(); toast(tr('Writex AI will use {0}.', m.name)); };
  const removeModel = async (m) => { await local.remove(m.id); toast(tr('{0} removed.', m.name)); refresh(); };
  const clearHistory = async () => {
    for (const c of await db.getAll('aichats')) await db.del('aichats', c.id);
    await engine.clearJobs();
    toast(tr('Writex AI conversations and tasks deleted.'));
    refresh();
  };

  return (
    <>
      <section className="set-group">
        <h2>{tr('Writex AI')}</h2>
        <div className="set-card">
          <div className="set-row">
            <span className="set-label">{current ? tr('Ready · {0}', current.name) : tr('No model installed')}
              <small>{current ? tr('{0} runs on this phone and works offline.', current.model) : tr('Install a model once (internet needed for the download). After that, Writex AI works without internet.')}</small></span>
            <Icon name={current ? 'CircleCheck' : 'Download'} size={20} style={{ color: current ? 'var(--ok)' : 'var(--muted)' }} />
          </div>
          <div className="set-row"><span className="set-label">{tr('Privacy')}<small>{tr('Everything runs on this phone. Documents, prompts and conversations are never sent anywhere. The internet is only used to download a model.')}</small></span><Icon name="ShieldCheck" size={20} style={{ color: 'var(--ok)' }} /></div>
          {!dev.engine && <div className="set-row"><span className="set-label">{tr('The Writex AI engine could not start on this device.')}<small dir="ltr">{dev.engineError || ''}</small></span><Icon name="TriangleAlert" size={20} /></div>}
        </div>
      </section>

      <section className="set-group">
        <h2>{tr('Models')}</h2>
        <div className="set-card">
          {local.MODELS.map((m) => {
            const isIn = installed.has(m.id);
            const ok = local.fits(m, dev);
            const downloading = dl && dl.id === m.id && dl.state === 'downloading';
            return (
              <div key={m.id} className="set-row col model-card">
                <span className="set-label">
                  <span><b>{m.name}</b> · {m.model}
                    {rec && rec.id === m.id && <span className="model-tag">{tr('Recommended for this phone')}</span>}
                    {current && current.id === m.id && <span className="model-tag">{tr('In use')}</span>}
                    {!ok && <span className="model-tag warn">{tr('Too large for this phone')}</span>}
                  </span>
                  <small>{m.note}</small>
                  <small>{tr('Download {0} · needs {1} of memory · licence: {2}', fmtBytes(m.size), fmtBytes(m.minRam), m.license)}</small>
                  {!ok && <small>{tr('This phone has {0} of memory. Use a smaller model.', fmtBytes(dev.totalMem))}</small>}
                </span>
                {downloading && (
                  <div className="form-stack" style={{ gap: 6 }}>
                    <div className="rv-bar"><i style={{ width: Math.round((dl.received / (dl.total || m.size)) * 100) + '%' }} /></div>
                    <small className="hint tnum">{tr('{0} of {1}', fmtBytes(dl.received), fmtBytes(dl.total || m.size))}</small>
                  </div>
                )}
                <div className="model-actions">
                  {!isIn && !downloading && <button type="button" className="btn sm primary" data-model={m.id} disabled={!ok || !!busy} onClick={() => install(m)}><Icon name="Download" size={14} />{tr('Download and install')}</button>}
                  {downloading && <button type="button" className="btn sm" onClick={() => local.cancelInstall()}><Icon name="Square" size={14} />{tr('Cancel')}</button>}
                  {isIn && (!current || current.id !== m.id) && <button type="button" className="btn sm" onClick={() => use(m)}><Icon name="Check" size={14} />{tr('Use this model')}</button>}
                  {isIn && <button type="button" className="btn sm ghost danger-text" onClick={() => setConfirm({ kind: 'model', m })}><Icon name="Trash2" size={14} />{tr('Remove')}</button>}
                </div>
              </div>
            );
          })}
        </div>
        <p className="hint" style={{ margin: '0 4px' }}>{tr('Writex AI picks the strongest model this phone can run. A model that needs more memory than the phone has cannot be installed.')}</p>
      </section>

      <section className="set-group">
        <h2>{tr('This phone')}</h2>
        <div className="set-card">
          <div className="set-row"><span className="set-label">{tr('Memory')}<small>{tr('{0} free of {1}', fmtBytes(dev.availMem), fmtBytes(dev.totalMem))}</small></span><Icon name="MemoryStick" size={18} /></div>
          <div className="set-row"><span className="set-label">{tr('Storage')}<small>{tr('Models use {0} · {1} free', fmtBytes(usedBytes), fmtBytes(dev.freeStorage))}</small></span><Icon name="HardDrive" size={18} /></div>
          <div className="set-row"><span className="set-label">{tr('Processor')}<small>{tr('{0} cores · Writex AI uses {1}', dev.cores, dev.threads)} · {dev.abi}</small></span><Icon name="Cpu" size={18} /></div>
          <div className="set-row"><span className="set-label">{tr('Speed')}<small>{speed ? tr('{0} words per second (measured on the last answer)', Math.round(speed.tokensPerSecond * 0.75 * 10) / 10) : tr('Measured after the first answer.')}</small></span><Icon name="Gauge" size={18} /></div>
          <button type="button" className="set-row btn-row" onClick={async () => { await local.unload(); toast(tr('Model unloaded from memory.')); refresh(); }}>
            <span className="set-label">{tr('Free memory now')}<small>{dev.loadedFile ? tr('The model is loaded. It also unloads by itself after a few idle minutes.') : tr('The model is not loaded.')}</small></span><Icon name="PowerOff" size={18} />
          </button>
        </div>
      </section>

      <section className="set-group">
        <h2>{tr('AI preferences')}</h2>
        <div className="set-card">
          <div className="set-row col">
            <span className="set-label">{tr('Answer language')}<small>{tr('Automatic follows the language you write in and your documents.')}</small></span>
            <Seg label={tr('Answer language')} value={lang} onChange={(v) => { setLang(v); storage.set('writex.aiLang', v); }} options={[{ value: 'auto', label: tr('Automatic') }, { value: 'ar', label: 'العربية' }, { value: 'en', label: 'English' }]} />
          </div>
          <button type="button" className="set-row btn-row" onClick={() => window.dispatchEvent(new CustomEvent('writex:navigate', { detail: { section: 'think', tab: 'tasks' } }))}>
            <span className="set-label">{tr('Task history')}<small>{trn(jobs, '{0} task on this device', '{0} tasks on this device')}</small></span><Icon name="ListTodo" size={18} />
          </button>
          <button type="button" className="set-row btn-row" onClick={() => setConfirm({ kind: 'history' })}>
            <span className="set-label danger-text">{tr('Delete all conversations and tasks')}<small>{trn(chats, '{0} conversation', '{0} conversations')}</small></span><Icon name="Trash2" size={18} />
          </button>
        </div>
      </section>

      {confirm && confirm.kind === 'model' && (
        <ConfirmDialog title={tr('Remove {0}?', confirm.m.name)} message={tr('The model file ({0}) is deleted from this phone. You can download it again later.', fmtBytes(confirm.m.size))}
          confirmLabel={tr('Remove')} onConfirm={() => removeModel(confirm.m)} onClose={() => setConfirm(null)} />
      )}
      {confirm && confirm.kind === 'history' && (
        <ConfirmDialog title={tr('Delete all Writex AI history?')} message={tr('All Writex AI conversations and task results on this phone are deleted. Your documents are not affected.')}
          onConfirm={clearHistory} onClose={() => setConfirm(null)} />
      )}
    </>
  );
}
