import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, ChevronRight, Lock, PlugZap, Save, ShieldCheck, Trash2 } from 'lucide-react';
import { deleteLocalKeys, storeLocalKeys } from '../lib/keychain';
import { PROBE_OUTCOMES, testProviderCredentials } from '../lib/credentialTester';

const providerMeta = {
  aws: { name: 'Amazon Web Services', short: 'AWS', mark: 'AWS', color: 'text-amber-700 bg-amber-100', description: 'EC2 volumes and Elastic IPs', group: 'Cloud infrastructure' },
  gcp: { name: 'Google Cloud', short: 'Google Cloud', mark: 'G', color: 'text-blue-700 bg-blue-100', description: 'Disks and IP addresses', group: 'Cloud infrastructure' },
  azure: { name: 'Microsoft Azure', short: 'Azure', mark: 'AZ', color: 'text-sky-700 bg-sky-100', description: 'Compute and networking', group: 'Cloud infrastructure' },
  vercel: { name: 'Vercel', short: 'Vercel', mark: '▲', color: 'text-slate-700 bg-slate-100', description: 'Projects and deployments', group: 'Platforms' },
  supabase: { name: 'Supabase', short: 'Supabase', mark: 'S', color: 'text-emerald-700 bg-emerald-100', description: 'Projects and storage', group: 'Platforms' },
  openai: { name: 'OpenAI', short: 'OpenAI', mark: 'AI', color: 'text-violet-700 bg-violet-100', description: 'Organization usage costs', group: 'AI services' },
};

const providerGroups = ['Cloud infrastructure', 'Platforms', 'AI services'];

const toneStyles = {
  success: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  warning: 'bg-amber-50 text-amber-800 border-amber-200',
  error: 'bg-red-50 text-red-800 border-red-200',
  neutral: 'bg-slate-50 text-slate-700 border-slate-200',
};

export default function KeychainSettings(props) {
  const [selectedProvider, setSelectedProvider] = useState('aws');
  const [savedStatus, setSavedStatus] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [removalTarget, setRemovalTarget] = useState(null);

  const { onClearProvider, onLogActivity } = props;

  const providers = useMemo(() => ({
    aws: {
      credentials: { keyId: props.awsKeyId, secretKey: props.awsSecretKey },
      fields: [
        { label: 'Access key ID', value: props.awsKeyId, setter: props.setAwsKeyId, placeholder: 'AKIA…', type: 'text' },
        { label: 'Secret access key', value: props.awsSecretKey, setter: props.setAwsSecretKey, placeholder: 'Enter secret key', type: 'password' },
      ],
      scope: 'Needs ec2:DescribeVolumes and ec2:DescribeAddresses. Add ec2:DeleteVolume and ec2:ReleaseAddress only if you want remediation.',
    },
    vercel: {
      credentials: { keyId: props.vercelToken },
      fields: [{ label: 'Personal access token', value: props.vercelToken, setter: props.setVercelToken, placeholder: 'Enter Vercel token', type: 'password' }],
      scope: 'Needs read access to projects. Project deletion requires a full-access token.',
    },
    supabase: {
      credentials: { keyId: props.supabaseToken },
      fields: [{ label: 'Management access token', value: props.supabaseToken, setter: props.setSupabaseToken, placeholder: 'sbp_…', type: 'password' }],
      scope: 'Needs permission to list projects. Supabase findings are review-only, so no write scope is required.',
    },
    openai: {
      credentials: { keyId: props.openAiKey },
      fields: [{ label: 'Organization admin key', value: props.openAiKey, setter: props.setOpenAiKey, placeholder: 'sk-admin-…', type: 'password', hint: 'An organization admin key is required to read cost data.' }],
      scope: 'Needs organization admin scope to read cost buckets. Findings are review-only.',
    },
    gcp: {
      credentials: { keyId: props.gcpToken },
      fields: [{ label: 'Service account JSON or token', value: props.gcpToken, setter: props.setGcpToken, placeholder: 'Enter service account credential', type: 'password' }],
      scope: 'Needs a Compute or cloud-platform read scope. GCP findings are review-only.',
    },
    azure: {
      credentials: { keyId: props.azureSubscriptionId, secretKey: props.azureToken },
      fields: [
        { label: 'Subscription ID', value: props.azureSubscriptionId, setter: props.setAzureSubscriptionId, placeholder: '00000000-0000-0000-0000-000000000000', type: 'text' },
        { label: 'Client secret or bearer token', value: props.azureToken, setter: props.setAzureToken, placeholder: 'Enter Azure credential', type: 'password' },
      ],
      scope: 'Needs the Reader role on the subscription. Azure findings are review-only.',
    },
  }), [props]);

  const current = providers[selectedProvider];
  const meta = providerMeta[selectedProvider];
  const requiredValues = (provider) => Object.values(providers[provider].credentials);
  const isConfigured = (provider) => requiredValues(provider).every((value) => Boolean(value && value.trim()));
  const connectedCount = Object.keys(providerMeta).filter(isConfigured).length;

  const selectProvider = (id) => {
    setSelectedProvider(id);
    setSavedStatus(null);
    setTestResult(null);
  };

  const handleSave = async () => {
    if (!isConfigured(selectedProvider)) {
      setSavedStatus({ tone: 'error', message: 'Complete all required fields before saving.' });
      return;
    }
    setIsSaving(true);
    const { keyId, secretKey = '' } = current.credentials;
    const saved = await storeLocalKeys(selectedProvider, keyId, secretKey);
    setSavedStatus(saved
      ? { tone: 'success', message: `${meta.short} credentials saved securely.` }
      : { tone: 'error', message: 'Could not access the native keychain. Run the desktop app and try again.' });
    setIsSaving(false);
  };

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    setSavedStatus(null);
    // Messages come back already redacted, so they are safe to render and log.
    const result = await testProviderCredentials(selectedProvider, current.credentials);
    setTestResult(result);
    setIsTesting(false);
    onLogActivity?.({
      category: 'credential',
      status: result.outcome === 'valid' ? 'success' : result.outcome === 'not_configured' ? 'info' : 'warning',
      provider: meta.short,
      title: `Connection test — ${PROBE_OUTCOMES[result.outcome]?.label || result.outcome}`,
      message: result.message,
    });
  };

  const handleRemove = async () => {
    const providerId = removalTarget;
    if (!providerId) return;
    setIsRemoving(true);
    const removed = await deleteLocalKeys(providerId);
    setIsRemoving(false);
    setRemovalTarget(null);

    if (!removed.success) {
      setSavedStatus({ tone: 'error', message: removed.message });
      return;
    }
    // Clearing in-memory state is what actually stops the next scan from
    // reaching this provider.
    onClearProvider?.(providerId);
    setTestResult(null);
    setSavedStatus({ tone: 'success', message: `${providerMeta[providerId].short} credentials removed from this device. It will be skipped on the next scan.` });
    onLogActivity?.({
      category: 'credential',
      status: 'info',
      provider: providerMeta[providerId].short,
      title: 'Credentials removed',
      message: `Keychain entries for ${providerMeta[providerId].name} were deleted. The provider will be skipped until new credentials are saved.`,
    });
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
                    <button key={id} onClick={() => selectProvider(id)} className={`relative w-full flex items-center gap-3 px-5 py-2.5 text-left transition ${active ? 'bg-indigo-50 text-indigo-900' : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950'}`}>
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
                <input type={field.type} value={field.value} onChange={(event) => { field.setter(event.target.value); setTestResult(null); }} placeholder={field.placeholder} autoComplete="off" className="w-full px-3.5 py-3 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-950 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition" />
                {field.hint && <span className="block text-xs text-slate-500 mt-2">{field.hint}</span>}
              </label>
            ))}

            <p className="flex gap-2 text-xs text-slate-500 leading-relaxed">
              <ShieldCheck size={14} className="mt-0.5 shrink-0 text-slate-400" />
              <span><strong className="font-semibold text-slate-600">Least privilege:</strong> {current.scope}</span>
            </p>

            {savedStatus && (
              <div role="status" className={`px-3.5 py-3 rounded-xl border text-xs ${toneStyles[savedStatus.tone]}`}>{savedStatus.message}</div>
            )}

            {testResult && (
              <div role="status" className={`px-3.5 py-3 rounded-xl border text-xs ${toneStyles[PROBE_OUTCOMES[testResult.outcome]?.tone || 'neutral']}`}>
                <strong className="font-semibold">{PROBE_OUTCOMES[testResult.outcome]?.label || 'Result'}</strong>
                <span className="block mt-0.5">{testResult.message}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <button onClick={handleSave} disabled={isSaving || isTesting} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold shadow-lg shadow-indigo-600/15 transition">
                <Save size={15} />
                <span>{isSaving ? 'Saving…' : `Save ${meta.short} credentials`}</span>
              </button>

              <button onClick={handleTest} disabled={isTesting || isSaving || !isConfigured(selectedProvider)} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 text-slate-700 text-sm font-semibold transition">
                <PlugZap size={15} />
                <span>{isTesting ? 'Testing…' : 'Test connection'}</span>
              </button>

              {isConfigured(selectedProvider) && (
                <button onClick={() => setRemovalTarget(selectedProvider)} disabled={isTesting || isSaving} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-red-600 hover:bg-red-50 disabled:opacity-50 text-sm font-semibold transition ml-auto">
                  <Trash2 size={15} />
                  <span>Remove credentials</span>
                </button>
              )}
            </div>
          </div>
        </section>
      </div>

      {removalTarget && (
        <RemovalDialog
          provider={providerMeta[removalTarget]}
          isRemoving={isRemoving}
          onCancel={() => setRemovalTarget(null)}
          onConfirm={handleRemove}
        />
      )}
    </div>
  );
}

function RemovalDialog({ provider, isRemoving, onCancel, onConfirm }) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !isRemoving) onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isRemoving, onCancel]);

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div role="dialog" aria-modal="true" aria-labelledby="remove-credentials-title" className="bg-white border border-slate-200 rounded-2xl p-6 max-w-md w-full shadow-2xl">
        <div className="flex items-center gap-3 mb-4 text-red-600">
          <AlertTriangle size={26} />
          <h4 id="remove-credentials-title" className="text-lg font-semibold text-slate-900">Remove {provider.short} credentials?</h4>
        </div>
        <p className="text-sm text-slate-600 leading-relaxed mb-4">
          Both keychain entries for {provider.name} will be deleted from this device. {provider.short} will be skipped on the next scan until you save new credentials.
        </p>
        <p className="text-xs text-slate-500 mb-6">Nothing changes in your {provider.short} account — only the copy stored locally is removed.</p>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} disabled={isRemoving} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 font-medium rounded-lg text-sm transition">Cancel</button>
          <button onClick={onConfirm} disabled={isRemoving} className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-bold rounded-lg text-sm transition">
            {isRemoving ? 'Removing…' : 'Remove credentials'}
          </button>
        </div>
      </div>
    </div>
  );
}
