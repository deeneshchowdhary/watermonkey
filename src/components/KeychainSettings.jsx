import React, { useMemo, useState } from 'react';
import { Check, ChevronRight, Lock, Save, ShieldCheck } from 'lucide-react';
import { storeLocalKeys } from '../lib/keychain';

const providerMeta = {
  aws: { name: 'Amazon Web Services', short: 'AWS', mark: 'AWS', color: 'text-amber-700 bg-amber-100', description: 'EC2 volumes and Elastic IPs', group: 'Cloud infrastructure' },
  gcp: { name: 'Google Cloud', short: 'Google Cloud', mark: 'G', color: 'text-blue-700 bg-blue-100', description: 'Disks and IP addresses', group: 'Cloud infrastructure' },
  azure: { name: 'Microsoft Azure', short: 'Azure', mark: 'AZ', color: 'text-sky-700 bg-sky-100', description: 'Compute and networking', group: 'Cloud infrastructure' },
  vercel: { name: 'Vercel', short: 'Vercel', mark: '▲', color: 'text-slate-700 bg-slate-100', description: 'Projects and deployments', group: 'Platforms' },
  supabase: { name: 'Supabase', short: 'Supabase', mark: 'S', color: 'text-emerald-700 bg-emerald-100', description: 'Projects and storage', group: 'Platforms' },
  openai: { name: 'OpenAI', short: 'OpenAI', mark: 'AI', color: 'text-violet-700 bg-violet-100', description: 'Organization usage costs', group: 'AI services' },
};

const providerGroups = ['Cloud infrastructure', 'Platforms', 'AI services'];

export default function KeychainSettings(props) {
  const [selectedProvider, setSelectedProvider] = useState('aws');
  const [savedStatus, setSavedStatus] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const providers = useMemo(() => ({
    aws: {
      values: [props.awsKeyId, props.awsSecretKey],
      fields: [
        { label: 'Access key ID', value: props.awsKeyId, setter: props.setAwsKeyId, placeholder: 'AKIA…', type: 'text' },
        { label: 'Secret access key', value: props.awsSecretKey, setter: props.setAwsSecretKey, placeholder: 'Enter secret key', type: 'password' },
      ],
    },
    vercel: { values: [props.vercelToken], fields: [{ label: 'Personal access token', value: props.vercelToken, setter: props.setVercelToken, placeholder: 'Enter Vercel token', type: 'password' }] },
    supabase: { values: [props.supabaseToken], fields: [{ label: 'Management access token', value: props.supabaseToken, setter: props.setSupabaseToken, placeholder: 'sbp_…', type: 'password' }] },
    openai: { values: [props.openAiKey], fields: [{ label: 'Organization admin key', value: props.openAiKey, setter: props.setOpenAiKey, placeholder: 'sk-admin-…', type: 'password', hint: 'An organization admin key is required to read cost data.' }] },
    gcp: { values: [props.gcpToken], fields: [{ label: 'Service account JSON or token', value: props.gcpToken, setter: props.setGcpToken, placeholder: 'Enter service account credential', type: 'password' }] },
    azure: {
      values: [props.azureSubscriptionId, props.azureToken],
      fields: [
        { label: 'Subscription ID', value: props.azureSubscriptionId, setter: props.setAzureSubscriptionId, placeholder: '00000000-0000-0000-0000-000000000000', type: 'text' },
        { label: 'Client secret or bearer token', value: props.azureToken, setter: props.setAzureToken, placeholder: 'Enter Azure credential', type: 'password' },
      ],
    },
  }), [props]);

  const current = providers[selectedProvider];
  const meta = providerMeta[selectedProvider];
  const isConfigured = (provider) => providers[provider].values.every(Boolean);
  const connectedCount = Object.keys(providerMeta).filter(isConfigured).length;

  const handleSave = async () => {
    const [keyId = '', secretKey = ''] = current.values;
    if (!keyId || (current.values.length > 1 && !secretKey)) {
      setSavedStatus('Complete all required fields before saving.');
      return;
    }
    setIsSaving(true);
    const saved = await storeLocalKeys(selectedProvider, keyId, secretKey);
    setSavedStatus(saved ? `${meta.short} credentials saved securely.` : 'Could not access the native keychain. Run the desktop app and try again.');
    setIsSaving(false);
  };

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between gap-4 mb-6 px-1">
        <div className="flex items-center gap-3">
          <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400"><Lock size={18} /></span>
          <div>
          <p className="text-sm font-semibold text-slate-800">Stored in your native OS keychain</p>
          <p className="text-xs text-slate-600 mt-0.5">Credentials stay on this device and are never sent to Water Monkey servers.</p>
          </div>
        </div>
        <span className="shrink-0 px-3 py-1.5 rounded-full bg-white border border-slate-200 text-xs text-slate-600"><strong className="text-slate-900 font-semibold">{connectedCount}</strong> of 6 connected</span>
      </div>

      <div className="grid min-h-[510px] bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm" style={{ gridTemplateColumns: '260px minmax(0, 1fr)' }}>
        <nav className="min-w-0 py-4 border-r border-slate-200 bg-slate-50/80" aria-label="Cloud providers">
          {providerGroups.map((group) => (
            <div key={group} className="mb-4 last:mb-0">
              <p className="px-5 mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-600">{group}</p>
              <div>
                {Object.entries(providerMeta).filter(([, provider]) => provider.group === group).map(([id, provider]) => {
                  const active = id === selectedProvider;
                  const connected = isConfigured(id);
                  return (
                    <button key={id} onClick={() => { setSelectedProvider(id); setSavedStatus(''); }} className={`relative w-full flex items-center gap-3 px-5 py-2.5 text-left transition ${active ? 'bg-indigo-50 text-indigo-900' : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950'}`}>
                      {active && <span className="absolute left-0 inset-y-1.5 w-0.5 rounded-r-full bg-indigo-400" />}
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold ${provider.color}`}>{provider.mark}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium truncate">{provider.short}</span>
                        <span className="block text-[10px] text-slate-600 truncate">{connected ? 'Connected' : 'Set up credentials'}</span>
                      </span>
                      {connected ? <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100"><Check size={12} className="text-emerald-600" /></span> : <ChevronRight size={13} className="text-slate-500" />}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <section className="min-w-0 p-8">
          <div className="flex items-start justify-between gap-4 pb-6 border-b border-slate-200 dark:border-white/[0.07]">
            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="text-lg font-semibold text-slate-950">{meta.name}</h3>
                {isConfigured(selectedProvider) && <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-semibold">Configured</span>}
              </div>
              <p className="text-sm text-slate-600 mt-1">{meta.description}</p>
            </div>
            <ShieldCheck size={20} className="text-indigo-400" />
          </div>

          <div className="max-w-xl pt-7 space-y-5">
            {current.fields.map((field) => (
              <label key={field.label} className="block">
                <span className="block text-xs font-semibold text-slate-700 mb-2">{field.label}</span>
                <input type={field.type} value={field.value} onChange={(event) => field.setter(event.target.value)} placeholder={field.placeholder} autoComplete="off" className="w-full px-3.5 py-3 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-950 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition" />
                {field.hint && <span className="block text-xs text-slate-500 mt-2">{field.hint}</span>}
              </label>
            ))}

            {savedStatus && <div className={`px-3.5 py-3 rounded-xl text-xs ${savedStatus.includes('saved securely') ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-300'}`}>{savedStatus}</div>}

            <button onClick={handleSave} disabled={isSaving} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold shadow-lg shadow-indigo-600/15 transition">
              <Save size={15} />
              <span>{isSaving ? 'Saving…' : `Save ${meta.short} credentials`}</span>
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
