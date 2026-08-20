import React, { useMemo, useState } from 'react';
import { AlertTriangle, Check, ChevronRight, Lock, PlugZap, Save, ShieldCheck, Trash2 } from 'lucide-react';
import { deleteLocalKeys, storeLocalKeys } from '../lib/keychain';
import { PROBE_OUTCOMES, testProviderCredentials } from '../lib/credentialTester';
import { AWS_REGIONS } from '../lib/awsScanner';
import { GCP_ZONES } from '../lib/gcpScanner';
import { useDialogA11y } from '../lib/useDialogA11y';

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
  success: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/20',
  warning: 'bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-500/20',
  error: 'bg-red-50 dark:bg-red-500/10 text-red-800 dark:text-red-300 border-red-200 dark:border-red-500/20',
  neutral: 'bg-slate-50 dark:bg-white/[0.04] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-white/[0.08]',
};

// A snapshot only still applies if it matches what's currently typed —
// editing a field after a save or test invalidates that snapshot.
function credentialsMatch(snapshot, credentials) {
  if (!snapshot) return false;
  return snapshot.keyId === (credentials.keyId || '') && (snapshot.secretKey || '') === (credentials.secretKey || '');
}

export default function KeychainSettings(props) {
  const [selectedProvider, setSelectedProvider] = useState('aws');
  const [savedStatus, setSavedStatus] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [removalTarget, setRemovalTarget] = useState(null);

  const {
    onClearProvider, onLogActivity, onCredentialsSaved, onCredentialsVerified,
    savedCredentials = {}, verifiedCredentials = {},
    scanSettings, onUpdateScanSettings,
  } = props;

  const providers = useMemo(() => {
    // Azure packs tenantId/clientId/clientSecret into the credential's
    // secretKey as JSON — the generic keychain commands only have two slots
    // (key_id, secret_key), so this keeps Rust and keychain.js unchanged
    // while still capturing all three fields a client-credentials flow
    // needs (SPEC §6.5 — a defined identity model, not a raw bearer token).
    const azureSecretKey = JSON.stringify({
      tenantId: props.azureTenantId,
      clientId: props.azureClientId,
      clientSecret: props.azureClientSecret,
    });

    return {
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
        scope: 'Needs permission to list projects. Findings are review-only, so no write scope is required.',
      },
      openai: {
        credentials: { keyId: props.openAiKey },
        fields: [{ label: 'Organization admin key', value: props.openAiKey, setter: props.setOpenAiKey, placeholder: 'sk-admin-…', type: 'password', hint: 'An organization admin key is required to read cost data.' }],
        scope: 'Needs organization admin scope to read cost buckets. Findings are review-only.',
      },
      gcp: {
        credentials: { keyId: props.gcpProjectId, secretKey: props.gcpCredential },
        fields: [
          { label: 'Project ID', value: props.gcpProjectId, setter: props.setGcpProjectId, placeholder: 'my-project-id', type: 'text' },
          { label: 'Service account JSON or OAuth access token', value: props.gcpCredential, setter: props.setGcpCredential, placeholder: 'Paste a service account key JSON or an access token', type: 'password' },
        ],
        scope: 'Needs roles/compute.viewer (or broader) on the project. Findings are review-only.',
      },
      azure: {
        credentials: { keyId: props.azureSubscriptionId, secretKey: azureSecretKey },
        requiredFieldValues: [props.azureSubscriptionId, props.azureTenantId, props.azureClientId, props.azureClientSecret],
        fields: [
          { label: 'Subscription ID', value: props.azureSubscriptionId, setter: props.setAzureSubscriptionId, placeholder: '00000000-0000-0000-0000-000000000000', type: 'text' },
          { label: 'Tenant ID', value: props.azureTenantId, setter: props.setAzureTenantId, placeholder: '00000000-0000-0000-0000-000000000000', type: 'text' },
          { label: 'Client ID', value: props.azureClientId, setter: props.setAzureClientId, placeholder: 'App registration (client) ID', type: 'text' },
          { label: 'Client secret', value: props.azureClientSecret, setter: props.setAzureClientSecret, placeholder: 'Enter client secret', type: 'password', hint: 'From an Azure AD app registration granted the Reader role on this subscription.' },
        ],
        scope: 'Needs the Reader role on the subscription, granted to an app registration (service principal). Findings are review-only.',
      },
    };
  }, [props]);

  const current = providers[selectedProvider];
  const meta = providerMeta[selectedProvider];
  const requiredValues = (provider) => providers[provider].requiredFieldValues || Object.values(providers[provider].credentials);
  const isConfigured = (provider) => requiredValues(provider).every((value) => Boolean(value && value.trim()));
  // "Saved" means the fields on screen match what's actually in the keychain.
  // "Connected" additionally requires those exact values to have passed a
  // connection test — typing alone, or editing after a save/test, never
  // qualifies on its own.
  const isSaved = (provider) => credentialsMatch(savedCredentials[provider], providers[provider].credentials);
  const isConnected = (provider) => isSaved(provider) && credentialsMatch(verifiedCredentials[provider], providers[provider].credentials);
  const connectedCount = Object.keys(providerMeta).filter(isConnected).length;

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
    if (saved) {
      onCredentialsSaved?.(selectedProvider, keyId, secretKey);
    }
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
    const { keyId, secretKey = '' } = current.credentials;
    const result = await testProviderCredentials(selectedProvider, current.credentials);
    setTestResult(result);
    setIsTesting(false);
    onCredentialsVerified?.(selectedProvider, keyId, secretKey, result.outcome === 'valid');
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
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Stored in your native OS keychain</p>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">Credentials stay on this device and are never sent to Water Monkey servers.</p>
          </div>
        </div>
        <span className="shrink-0 px-3 py-1.5 rounded-full bg-white dark:bg-white/[0.05] border border-slate-200 dark:border-white/[0.07] text-xs text-slate-600 dark:text-slate-300"><strong className="text-slate-900 dark:text-white font-semibold">{connectedCount}</strong> of 6 connected</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[260px_minmax(0,1fr)] min-h-[510px] bg-white dark:bg-[#0c101c] border border-slate-200 dark:border-white/[0.07] rounded-2xl overflow-hidden shadow-sm">
        <nav className="min-w-0 py-4 border-r border-slate-200 dark:border-white/[0.07] bg-slate-50/80 dark:bg-white/[0.02] md:overflow-y-auto" aria-label="Cloud providers">
          {providerGroups.map((group) => (
            <div key={group} className="mb-4 last:mb-0">
              <p className="px-5 mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-600 dark:text-slate-400">{group}</p>
              <div>
                {Object.entries(providerMeta).filter(([, provider]) => provider.group === group).map(([id, provider]) => {
                  const active = id === selectedProvider;
                  const connected = isConnected(id);
                  const configured = isConfigured(id);
                  const statusLabel = connected ? 'Connected' : configured ? 'Not verified' : 'Set up credentials';
                  return (
                    <button key={id} onClick={() => selectProvider(id)} className={`relative w-full flex items-center gap-3 px-5 py-2.5 text-left transition ${active ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-900 dark:text-indigo-200' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.05] hover:text-slate-950 dark:hover:text-white'}`}>
                      {active && <span className="absolute left-0 inset-y-1.5 w-0.5 rounded-r-full bg-indigo-400" />}
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold ${provider.color}`}>{provider.mark}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium truncate">{provider.short}</span>
                        <span className="block text-[10px] text-slate-600 dark:text-slate-400 truncate">{statusLabel}</span>
                      </span>
                      {connected ? <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/20"><Check size={12} className="text-emerald-600 dark:text-emerald-400" /></span> : <ChevronRight size={13} className="text-slate-500 dark:text-slate-500" />}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <section className="min-w-0 p-5 sm:p-8">
          <div className="flex items-start justify-between gap-4 pb-6 border-b border-slate-200 dark:border-white/[0.07]">
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className="text-lg font-semibold text-slate-950 dark:text-white">{meta.name}</h3>
                {isConnected(selectedProvider) ? (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[10px] font-semibold">Connected</span>
                ) : isSaved(selectedProvider) ? (
                  <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/[0.07] text-slate-600 dark:text-slate-300 text-[10px] font-semibold">Saved, not tested</span>
                ) : null}
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{meta.description}</p>
            </div>
            <ShieldCheck size={20} className="text-indigo-400 dark:text-indigo-300 shrink-0" />
          </div>

          <div className="max-w-xl pt-7 space-y-5">
            {current.fields.map((field) => (
              <label key={field.label} className="block">
                <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">{field.label}</span>
                <input type={field.type} value={field.value} onChange={(event) => { field.setter(event.target.value); setTestResult(null); }} placeholder={field.placeholder} autoComplete="off" className="w-full px-3.5 py-3 bg-slate-50 dark:bg-white/[0.03] border border-slate-300 dark:border-white/[0.1] rounded-xl text-sm text-slate-950 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition" />
                {field.hint && <span className="block text-xs text-slate-500 dark:text-slate-400 mt-2">{field.hint}</span>}
              </label>
            ))}

            <p className="flex gap-2 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              <ShieldCheck size={14} className="mt-0.5 shrink-0 text-slate-400 dark:text-slate-500" />
              <span><strong className="font-semibold text-slate-600 dark:text-slate-300">Least privilege:</strong> {current.scope}</span>
            </p>

            {scanSettings && (
              <ScanScopeSection provider={selectedProvider} scanSettings={scanSettings} onUpdateScanSettings={onUpdateScanSettings} />
            )}

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

              <button onClick={handleTest} disabled={isTesting || isSaving || !isConfigured(selectedProvider)} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-white/10 bg-white dark:bg-white/[0.03] hover:bg-slate-50 dark:hover:bg-white/[0.06] disabled:opacity-50 text-slate-700 dark:text-slate-200 text-sm font-semibold transition">
                <PlugZap size={15} />
                <span>{isTesting ? 'Testing…' : 'Test connection'}</span>
              </button>

              {isConfigured(selectedProvider) && (
                <button onClick={() => setRemovalTarget(selectedProvider)} disabled={isTesting || isSaving} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-50 text-sm font-semibold transition sm:ml-auto">
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

function NumberField({ label, value, onChange, min = 0, step = 1, prefix, suffix }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">{label}</span>
      <div className="flex items-center gap-2 px-3.5 py-2.5 bg-slate-50 dark:bg-white/[0.03] border border-slate-300 dark:border-white/[0.1] rounded-xl focus-within:ring-2 focus-within:ring-indigo-500/30 focus-within:border-indigo-500 transition">
        {prefix && <span className="text-sm text-slate-500 dark:text-slate-400">{prefix}</span>}
        <input
          type="number"
          value={value}
          min={min}
          step={step}
          onChange={(event) => {
            const parsed = Number(event.target.value);
            if (Number.isFinite(parsed)) onChange(parsed);
          }}
          className="w-full bg-transparent text-sm text-slate-950 dark:text-slate-100 outline-none"
        />
        {suffix && <span className="text-sm text-slate-500 dark:text-slate-400">{suffix}</span>}
      </div>
    </label>
  );
}

// Scan scope and pricing assumptions live per provider, right alongside its
// credential fields, since that's where a user decides what to scan and how
// findings for that provider should be estimated.
function ScanScopeSection({ provider, scanSettings, onUpdateScanSettings }) {
  if (provider === 'aws') {
    const aws = scanSettings.aws;
    const toggleRegion = (regionId) => {
      const active = aws.regions.includes(regionId);
      const regions = active ? aws.regions.filter((id) => id !== regionId) : [...aws.regions, regionId];
      onUpdateScanSettings('aws', { regions });
    };
    return (
      <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] p-4 space-y-4">
        <div>
          <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">Regions to scan</span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
            {AWS_REGIONS.map((region) => (
              <label key={region.id} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                <input type="checkbox" checked={aws.regions.includes(region.id)} onChange={() => toggleRegion(region.id)} className="rounded border-slate-300 dark:border-white/20 text-indigo-600 focus:ring-indigo-500/40" />
                <span className="truncate">{region.label}</span>
              </label>
            ))}
          </div>
          {aws.regions.length === 0 && (
            <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">Select at least one region — AWS will be skipped on the next scan otherwise.</p>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <NumberField label="EBS estimate" prefix="$" suffix="/GB-month" value={aws.ebsPricePerGbMonth} min={0} step={0.01} onChange={(value) => onUpdateScanSettings('aws', { ebsPricePerGbMonth: value })} />
          <NumberField label="Elastic IP estimate" prefix="$" suffix="/month" value={aws.elasticIpPricePerMonth} min={0} step={0.01} onChange={(value) => onUpdateScanSettings('aws', { elasticIpPricePerMonth: value })} />
        </div>
      </div>
    );
  }

  if (provider === 'vercel') {
    const vercel = scanSettings.vercel;
    return (
      <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <NumberField label="Inactivity threshold" suffix="days" value={vercel.inactivityDays} min={1} step={1} onChange={(value) => onUpdateScanSettings('vercel', { inactivityDays: value })} />
        <NumberField label="Estimate per project" prefix="$" suffix="/month" value={vercel.monthlyEstimate} min={0} step={0.5} onChange={(value) => onUpdateScanSettings('vercel', { monthlyEstimate: value })} />
      </div>
    );
  }

  if (provider === 'supabase') {
    const supabase = scanSettings.supabase;
    return (
      <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] p-4">
        <NumberField label="Estimate per idle project" prefix="$" suffix="/month" value={supabase.monthlyEstimate} min={0} step={0.5} onChange={(value) => onUpdateScanSettings('supabase', { monthlyEstimate: value })} />
      </div>
    );
  }

  if (provider === 'openai') {
    const openai = scanSettings.openai;
    return (
      <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <NumberField label="Baseline window" suffix="days" value={openai.days} min={2} step={1} onChange={(value) => onUpdateScanSettings('openai', { days: value })} />
        <NumberField label="Spike multiplier" suffix="x baseline" value={openai.spikeMultiplier} min={1.1} step={0.1} onChange={(value) => onUpdateScanSettings('openai', { spikeMultiplier: value })} />
      </div>
    );
  }

  if (provider === 'gcp') {
    const gcp = scanSettings.gcp;
    const toggleZone = (zoneId) => {
      const active = gcp.zones.includes(zoneId);
      const zones = active ? gcp.zones.filter((id) => id !== zoneId) : [...gcp.zones, zoneId];
      onUpdateScanSettings('gcp', { zones });
    };
    return (
      <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] p-4">
        <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">Zones to scan</span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
          {GCP_ZONES.map((zone) => (
            <label key={zone.id} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={gcp.zones.includes(zone.id)} onChange={() => toggleZone(zone.id)} className="rounded border-slate-300 dark:border-white/20 text-indigo-600 focus:ring-indigo-500/40" />
              <span className="truncate">{zone.label}</span>
            </label>
          ))}
        </div>
        {gcp.zones.length === 0 && (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">Select at least one zone — GCP will be skipped on the next scan otherwise.</p>
        )}
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Disk and IP pricing use a documented fixed rate; see each finding's estimate details.</p>
      </div>
    );
  }

  return null;
}

function RemovalDialog({ provider, isRemoving, onCancel, onConfirm }) {
  const dialogRef = useDialogA11y(true, onCancel);

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="remove-credentials-title" className="bg-white dark:bg-[#111624] border border-slate-200 dark:border-white/10 rounded-2xl p-6 max-w-md w-full shadow-2xl outline-none">
        <div className="flex items-center gap-3 mb-4 text-red-600 dark:text-red-400">
          <AlertTriangle size={26} />
          <h4 id="remove-credentials-title" className="text-lg font-semibold text-slate-900 dark:text-white">Remove {provider.short} credentials?</h4>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
          Both keychain entries for {provider.name} will be deleted from this device. {provider.short} will be skipped on the next scan until you save new credentials.
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">Nothing changes in your {provider.short} account — only the copy stored locally is removed.</p>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} disabled={isRemoving} className="px-4 py-2 bg-slate-100 dark:bg-white/[0.06] hover:bg-slate-200 dark:hover:bg-white/[0.1] disabled:opacity-50 text-slate-700 dark:text-slate-300 font-medium rounded-lg text-sm transition">Cancel</button>
          <button onClick={onConfirm} disabled={isRemoving} className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-bold rounded-lg text-sm transition">
            {isRemoving ? 'Removing…' : 'Remove credentials'}
          </button>
        </div>
      </div>
    </div>
  );
}
