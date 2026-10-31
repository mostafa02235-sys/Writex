// Settings › Writex AI: connection, models, usage, task history, preferences, privacy.
import React, { useState, useEffect } from '../react.js';
import { Icon } from '../icons.jsx';
import { Seg } from './ui.jsx';
import * as wx from '../writexAI.js';
import { getAIConfig, setAIConfig } from '../ai.js';
import { tr, trn } from '../i18n.js';

const TIER = { fast: tr('Everyday tasks'), smart: tr('Long and demanding tasks'), vision: tr('Images') };

export function AISettings({ toast }) {
  const [st, setSt] = useState({ phase: 'checking' });
  const [usage, setUsage] = useState(null);
  const [jobs, setJobs] = useState(0);
  const [lang, setLang] = useState(wx.answerLang());
  const [server, setServer] = useState(wx.serverUrl());
  const [showServer, setShowServer] = useState(false);

  const check = async () => {
    setSt({ phase: 'checking' });
    if (!wx.configured()) { setSt({ phase: 'not_deployed' }); return; }
    const h = await wx.health();
    if (!h.ok) { setSt({ phase: 'offline' }); return; }
    try {
      const s = await wx.status();
      setSt({ phase: s.ready ? 'ready' : 'no_model', status: s, version: h.version });
      setUsage(s.usage && s.usage.today);
    } catch (e) { setSt({ phase: 'error', message: e.message }); }
  };
  useEffect(() => { check(); wx.localJobs().then((l) => setJobs(l.length)).catch(() => {}); }, []);

  const saveServer = () => {
    wx.setServerUrl(server);
    const c = getAIConfig(); setAIConfig({ ...c, provider: 'writex' });
    toast(tr('Saved'));
    check();
  };

  const line = {
    checking: [tr('Checking the connection…'), null],
    ready: [tr('Connected'), 'ok'],
    not_deployed: [tr('Not connected to a server yet'), 'warn'],
    offline: [tr('Can’t reach Writex AI'), 'warn'],
    no_model: [tr('Server running, no AI model connected'), 'warn'],
    error: [st.message || tr('Something went wrong.'), 'warn'],
  }[st.phase];
  const detail = {
    ready: tr('Writex AI is ready across the app: the writing assistant, Studio, Learn, the document companion and Writex AI conversations.'),
    not_deployed: tr('Everything in the app is ready for Writex AI, but this build is not linked to a Writex AI server. The server is part of the Writex project (server/ folder) and needs to be deployed once with a model provider key; then every copy of the app connects automatically. Other features work without it.'),
    offline: tr('Check your internet connection. Your documents and all other features keep working offline.'),
    no_model: tr('The server needs a model provider key (OpenAI, Gemini or a self-hosted model) in its settings.'),
  }[st.phase];

  return (
    <>
      <section className="set-group">
        <h2>{tr('Writex AI')}</h2>
        <div className="set-card">
          <div className="set-row">
            <span className="set-label">{line[0]}{detail && <small>{detail}</small>}</span>
            {st.phase === 'checking' ? <span className="spin" /> : <Icon name={line[1] === 'ok' ? 'CircleCheck' : 'TriangleAlert'} size={20} style={{ color: line[1] === 'ok' ? 'var(--ok)' : 'var(--warn)' }} />}
          </div>
          {st.status && st.status.models && st.status.models.map((m) => (
            <div key={m.tier} className="set-row">
              <span className="set-label">{TIER[m.tier] || m.tier}<small>{m.available ? tr('Available') : tr('Not available')}</small></span>
              <Icon name={m.available ? 'Check' : 'Minus'} size={18} />
            </div>
          ))}
          <button type="button" className="set-row btn-row" onClick={check}><span className="set-label">{tr('Check again')}</span><Icon name="RefreshCw" size={18} /></button>
        </div>
      </section>

      {usage && (
        <section className="set-group">
          <h2>{tr('Usage today')}</h2>
          <div className="set-card">
            <div className="set-row"><span className="set-label">{tr('Text sent to Writex AI')}<small>{tr('{0} of {1} characters a day', usage.inputChars.toLocaleString(), st.status.limits.dailyChars.toLocaleString())}</small></span><span className="tnum">{Math.min(100, Math.round((usage.inputChars / st.status.limits.dailyChars) * 100))}%</span></div>
            <div className="set-row"><span className="set-label">{tr('Model requests')}</span><span className="tnum">{usage.modelCalls}</span></div>
          </div>
        </section>
      )}

      <section className="set-group">
        <h2>{tr('AI preferences')}</h2>
        <div className="set-card">
          <div className="set-row col">
            <span className="set-label">{tr('Answer language')}<small>{tr('Automatic follows the language you write in and your documents.')}</small></span>
            <Seg label={tr('Answer language')} value={lang} onChange={(v) => { setLang(v); wx.setAnswerLang(v); }} options={[{ value: 'auto', label: tr('Automatic') }, { value: 'ar', label: 'العربية' }, { value: 'en', label: 'English' }]} />
          </div>
          <button type="button" className="set-row btn-row" onClick={() => window.dispatchEvent(new CustomEvent('writex:navigate', { detail: { section: 'think', tab: 'tasks' } }))}>
            <span className="set-label">{tr('Task history')}<small>{trn(jobs, '{0} task on this device', '{0} tasks on this device')}</small></span><Icon name="ListTodo" size={18} />
          </button>
          <button type="button" className="set-row btn-row" onClick={() => setShowServer((v) => !v)}>
            <span className="set-label">{tr('Server address')}<small dir="ltr">{wx.serverUrl() || tr('Not set')}</small></span><Icon name={showServer ? 'ChevronUp' : 'ChevronDown'} size={18} />
          </button>
          {showServer && (
            <div className="set-row col">
              <input id="wx-server" className="text-input" dir="ltr" type="url" inputMode="url" placeholder="https://ai.example.com" value={server} onChange={(e) => setServer(e.target.value)} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn primary sm" onClick={saveServer}>{tr('Save')}</button>
                {wx.builtInServer() && <button type="button" className="btn sm" onClick={() => { setServer(wx.builtInServer()); wx.setServerUrl(''); check(); }}>{tr('Use the built-in server')}</button>}
              </div>
              <small className="hint">{tr('Only change this if you run your own Writex AI server.')}</small>
            </div>
          )}
        </div>
      </section>

      <section className="set-group">
        <h2>{tr('Privacy')}</h2>
        <div className="set-card">
          <div className="set-row"><span className="set-label">{tr('What is sent')}<small>{tr('Only the text, files and images you use in an AI request are sent to the Writex AI server, which passes them to its AI model to produce the answer. Nothing is sent in the background. This device is identified by a random code, not by your name or account.')}</small></span></div>
          <div className="set-row"><span className="set-label">{tr('API keys')}<small>{tr('AI provider keys live only on the Writex AI server, never in the app. Advanced users can still connect their own server from the writing assistant’s settings inside a document.')}</small></span></div>
        </div>
      </section>
    </>
  );
}
