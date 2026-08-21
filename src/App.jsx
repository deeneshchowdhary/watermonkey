import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import WasteTable from './components/WasteTable';
import ProviderTabs from './components/ProviderTabs';
import WasteDistribution from './components/WasteDistribution';
import KeychainSettings from './components/KeychainSettings';
import AiInsights from './components/AiInsights';
import ActivityLog from './components/ActivityLog';
import ProviderStatusStrip from './components/ProviderStatusStrip';
import { scanAwsWaste } from './lib/awsScanner';
import { scanVercelWaste } from './lib/vercelScanner';
import { scanSupabaseWaste } from './lib/supabaseScanner';
import { scanGcpWaste } from './lib/gcpScanner';
import { scanAzureWaste } from './lib/azureScanner';
import { scanOpenAiWaste } from './lib/openaiScanner';
import { deleteResource } from './lib/deleter';
import { retrieveLocalKeys } from './lib/keychain';
import { loadScanSettings, saveScanSettings } from './lib/scanSettings';
import { loadReport, saveReport, reconcile, activeRecords, markAcknowledged, markResolved } from './lib/findingsStore';
import { loadActivity, saveActivity } from './lib/activityStore';
import { computeSeverity } from './lib/severity';
import { useTheme } from './lib/theme';
import { RefreshCw, TrendingDown, ShieldCheck, Cloud } from 'lucide-react';

const PROVIDER_IDS = ['AWS', 'Vercel', 'Supabase', 'GCP', 'Azure', 'OpenAI'];
const idleProviderStatus = () => Object.fromEntries(PROVIDER_IDS.map((p) => [p, { state: 'idle', message: '' }]));

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedProvider, setSelectedProvider] = useState('ALL');
  const [theme, setTheme] = useTheme();

  // Credentials State
  const [awsKeyId, setAwsKeyId] = useState('');
  const [awsSecretKey, setAwsSecretKey] = useState('');
  const [vercelToken, setVercelToken] = useState('');
  const [supabaseToken, setSupabaseToken] = useState('');
  const [gcpProjectId, setGcpProjectId] = useState('');
  const [gcpCredential, setGcpCredential] = useState('');
  const [azureSubscriptionId, setAzureSubscriptionId] = useState('');
  const [azureTenantId, setAzureTenantId] = useState('');
  const [azureClientId, setAzureClientId] = useState('');
  const [azureClientSecret, setAzureClientSecret] = useState('');
  const [openAiKey, setOpenAiKey] = useState('');
  // Snapshots of credential values as of the last successful keychain save
  // and the last successful ("valid") connection test, keyed by provider.
  // A provider only counts as connected when both snapshots still match the
  // values currently shown in the form — see isConnected in KeychainSettings.
  const [savedCredentials, setSavedCredentials] = useState({});
  const [verifiedCredentials, setVerifiedCredentials] = useState({});
  const [scanSettings, setScanSettings] = useState(loadScanSettings);
  const [scanMessage, setScanMessage] = useState('');
  const [providerStatus, setProviderStatus] = useState(idleProviderStatus);
  const [report, setReport] = useState(loadReport);
  const [activityEvents, setActivityEvents] = useState(loadActivity);

  const isScanning = Object.values(providerStatus).some((p) => p.state === 'scanning');

  useEffect(() => {
    saveActivity(activityEvents);
  }, [activityEvents]);

  useEffect(() => {
    saveScanSettings(scanSettings);
  }, [scanSettings]);

  const updateScanSettings = (provider, partial) => {
    setScanSettings((current) => ({ ...current, [provider]: { ...current[provider], ...partial } }));
  };

  const addActivity = (event) => {
    setActivityEvents((current) => [{
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      ...event,
    }, ...current].slice(0, 250));
  };

  useEffect(() => {
    const restoreCredentials = async () => {
      const providers = await Promise.all(
        ['aws', 'vercel', 'supabase', 'gcp', 'azure', 'openai'].map(retrieveLocalKeys),
      );
      const [aws, vercel, supabase, gcp, azure, openai] = providers;
      const restored = {};
      if (aws) { setAwsKeyId(aws.keyId); setAwsSecretKey(aws.secretKey); restored.aws = { keyId: aws.keyId, secretKey: aws.secretKey || '' }; }
      if (vercel) { setVercelToken(vercel.keyId); restored.vercel = { keyId: vercel.keyId, secretKey: '' }; }
      if (supabase) { setSupabaseToken(supabase.keyId); restored.supabase = { keyId: supabase.keyId, secretKey: '' }; }
      if (gcp) { setGcpProjectId(gcp.keyId); setGcpCredential(gcp.secretKey || ''); restored.gcp = { keyId: gcp.keyId, secretKey: gcp.secretKey || '' }; }
      if (azure) {
        setAzureSubscriptionId(azure.keyId);
        // Older saved Azure secrets (a raw bearer token) predate this JSON
        // packing and won't parse — that's fine, Azure never had a working
        // scanner before, so this is a one-time re-entry, not data loss.
        try {
          const parsed = JSON.parse(azure.secretKey || '{}');
          setAzureTenantId(parsed.tenantId || '');
          setAzureClientId(parsed.clientId || '');
          setAzureClientSecret(parsed.clientSecret || '');
          restored.azure = { keyId: azure.keyId, secretKey: azure.secretKey || '' };
        } catch {
          restored.azure = { keyId: azure.keyId, secretKey: '' };
        }
      }
      if (openai) { setOpenAiKey(openai.keyId); restored.openai = { keyId: openai.keyId, secretKey: '' }; }
      // Credentials restored from the keychain are known-saved but not
      // known-valid this session, so only the saved snapshot is seeded here;
      // the connected badge stays off until the user re-runs a test.
      setSavedCredentials(restored);
    };
    restoreCredentials();
  }, []);

  // Clearing in-memory credentials is what stops the next scan from reaching a
  // provider, so it runs alongside deleting the keychain entries.
  const clearProviderCredentials = (provider) => {
    const clearers = {
      aws: () => { setAwsKeyId(''); setAwsSecretKey(''); },
      vercel: () => setVercelToken(''),
      supabase: () => setSupabaseToken(''),
      gcp: () => { setGcpProjectId(''); setGcpCredential(''); },
      azure: () => { setAzureSubscriptionId(''); setAzureTenantId(''); setAzureClientId(''); setAzureClientSecret(''); },
      openai: () => setOpenAiKey(''),
    };
    clearers[provider]?.();
    setSavedCredentials((current) => ({ ...current, [provider]: undefined }));
    setVerifiedCredentials((current) => ({ ...current, [provider]: undefined }));
  };

  const handleCredentialsSaved = (provider, keyId, secretKey) => {
    setSavedCredentials((current) => ({ ...current, [provider]: { keyId, secretKey: secretKey || '' } }));
  };

  const handleCredentialsVerified = (provider, keyId, secretKey, isValid) => {
    setVerifiedCredentials((current) => ({
      ...current,
      [provider]: isValid ? { keyId, secretKey: secretKey || '' } : undefined,
    }));
  };

  const activeItems = activeRecords(report.records).map((r) => ({ ...r, severity: computeSeverity(r.monthlyLoss) }));
  const totalMonthlyLoss = activeItems.reduce((acc, i) => acc + i.monthlyLoss, 0);

  const filteredRecords = (selectedProvider === 'ALL'
    ? report.records
    : report.records.filter((item) => item.provider === selectedProvider)
  ).map((r) => ({ ...r, severity: computeSeverity(r.monthlyLoss) }));

  // Each entry either resolves to { status: 'succeeded', findings } or
  // { status: 'skipped', findings: [] } — scan/network errors are caught
  // here so one provider's failure never stops the others (§2.4).
  const providerScanners = {
    AWS: async () => {
      if (!(awsKeyId && awsSecretKey && scanSettings.aws.regions.length > 0)) return { status: 'skipped', findings: [] };
      const findings = await scanAwsWaste(scanSettings.aws.regions, awsKeyId, awsSecretKey, scanSettings.aws);
      return { status: 'succeeded', findings, warning: formatRegionErrors(findings.regionErrors) };
    },
    Vercel: async () => {
      if (!vercelToken) return { status: 'skipped', findings: [] };
      return { status: 'succeeded', findings: await scanVercelWaste(vercelToken, scanSettings.vercel) };
    },
    Supabase: async () => {
      if (!supabaseToken) return { status: 'skipped', findings: [] };
      return { status: 'succeeded', findings: await scanSupabaseWaste(supabaseToken, scanSettings.supabase) };
    },
    GCP: async () => {
      if (!(gcpProjectId && gcpCredential && scanSettings.gcp.zones.length > 0)) return { status: 'skipped', findings: [] };
      const findings = await scanGcpWaste(gcpProjectId, gcpCredential, scanSettings.gcp.zones);
      return { status: 'succeeded', findings, warning: formatRegionErrors(findings.regionErrors) };
    },
    Azure: async () => {
      if (!(azureSubscriptionId && azureTenantId && azureClientId && azureClientSecret)) return { status: 'skipped', findings: [] };
      const findings = await scanAzureWaste(azureSubscriptionId, { tenantId: azureTenantId, clientId: azureClientId, clientSecret: azureClientSecret });
      return { status: 'succeeded', findings, warning: formatRegionErrors(findings.regionErrors) };
    },
    OpenAI: async () => {
      if (!openAiKey) return { status: 'skipped', findings: [] };
      return { status: 'succeeded', findings: await scanOpenAiWaste(openAiKey, scanSettings.openai) };
    },
  };

  function formatRegionErrors(regionErrors) {
    if (!regionErrors || !regionErrors.length) return null;
    return `Skipped ${regionErrors.map((e) => e.region).join(', ')} (${regionErrors[0].message})`;
  }

  const runProviderScan = async (providerId) => {
    setProviderStatus((current) => ({ ...current, [providerId]: { state: 'scanning', message: '' } }));
    try {
      const result = await providerScanners[providerId]();
      setProviderStatus((current) => ({ ...current, [providerId]: { state: result.status, message: result.warning || '' } }));
      return { provider: providerId, ...result };
    } catch (err) {
      const message = err?.message || String(err);
      setProviderStatus((current) => ({ ...current, [providerId]: { state: 'failed', message } }));
      return { provider: providerId, status: 'failed', findings: [], error: message };
    }
  };

  const runScan = async (providerIds) => {
    const isFullScan = providerIds.length === PROVIDER_IDS.length;
    addActivity({
      category: 'scan',
      status: 'info',
      title: isFullScan ? 'Fleet scan started' : `${providerIds[0]} scan started`,
      message: isFullScan ? 'Checking all configured providers for potential cloud waste.' : `Re-checking ${providerIds[0]} after a previous failure.`,
    });
    setScanMessage('');

    const results = await Promise.all(providerIds.map(runProviderScan));
    const resultsByProvider = Object.fromEntries(results.map((r) => [r.provider, r]));
    const now = new Date().toISOString();
    const nextRecords = reconcile(report.records, resultsByProvider, now);
    const nextReport = saveReport({ records: nextRecords, lastScanAt: now });
    setReport(nextReport);

    const succeeded = results.filter((r) => r.status === 'succeeded');
    const failed = results.filter((r) => r.status === 'failed');
    const skipped = results.filter((r) => r.status === 'skipped');
    const warnings = succeeded.filter((r) => r.warning);
    const newFindingCount = succeeded.reduce((sum, r) => sum + (r.findings?.length || 0), 0);
    const newFindingLoss = succeeded.reduce((sum, r) => sum + (r.findings || []).reduce((s, f) => s + f.monthlyLoss, 0), 0);

    const hasWarnings = failed.length > 0 || warnings.length > 0;
    const parts = [];
    failed.forEach((r) => parts.push(`${r.provider}: ${r.error}`));
    warnings.forEach((r) => parts.push(`${r.provider}: ${r.warning}`));

    setScanMessage(hasWarnings
      ? `Scan completed with warnings. ${parts.join(' ')}`
      : skipped.length
        ? `Scan completed. Skipped unconfigured providers: ${skipped.map((r) => r.provider).join(', ')}.`
        : isFullScan ? 'Fleet audit completed.' : `${providerIds[0]} scan completed.`);

    addActivity({
      category: 'scan',
      status: hasWarnings ? 'warning' : 'success',
      title: hasWarnings ? 'Scan completed with warnings' : (isFullScan ? 'Fleet scan completed' : `${providerIds[0]} scan completed`),
      message: `${newFindingCount} finding${newFindingCount === 1 ? '' : 's'} reported with $${newFindingLoss.toFixed(2)}/month in potential savings.${parts.length ? ` ${parts.join(' ')}` : ''}${skipped.length ? ` Skipped: ${skipped.map((r) => r.provider).join(', ')}.` : ''}`,
    });
  };

  const handleRunScan = () => runScan(PROVIDER_IDS);
  const handleRetryProvider = (providerId) => runScan([providerId]);

  const handleKillResource = async (item) => {
    const now = new Date().toISOString();
    const result = item.remediable !== true
      ? { success: true, message: 'Finding acknowledged.' }
      : await deleteResource(item, { awsKeyId, awsSecretKey, vercelToken, supabaseToken });
    if (!result.success) {
      addActivity({ category: 'remediation', status: 'error', provider: item.provider, title: 'Remediation failed', message: `${item.resource}: ${result.message}` });
      throw new Error(result.message);
    }
    const nextRecords = item.remediable !== true
      ? markAcknowledged(report.records, item.provider, item.id, now)
      : markResolved(report.records, item.provider, item.id, now);
    setReport(saveReport({ ...report, records: nextRecords }));
    setScanMessage(result.message);
    addActivity({
      category: 'remediation',
      status: 'success',
      provider: item.provider,
      title: item.remediable !== true ? 'Finding acknowledged' : 'Resource resolved',
      message: `${item.resource} (${item.id}) — ${result.message}`,
    });
  };

  const pageCopy = {
    dashboard: ['Cloud overview', 'A focused view of waste across your connected providers.'],
    activity: ['Activity', 'A local history of scans, findings, and remediation actions.'],
    settings: ['Connections', 'Manage credentials stored securely on this device.'],
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden font-sans bg-[#f7f8fc] dark:bg-[#080b14] text-slate-900 dark:text-slate-100 transition-colors duration-300">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} theme={theme} setTheme={setTheme} />

      <main className="app-grid flex-1 overflow-y-auto">
        <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8 py-7">
        <header className="flex flex-wrap justify-between items-center gap-4 mb-8">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">
              {pageCopy[activeTab][0]}
            </h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
              {pageCopy[activeTab][1]}
            </p>
          </div>

          {activeTab === 'dashboard' && (
            <button
              onClick={handleRunScan}
              disabled={isScanning}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold shadow-lg shadow-indigo-600/20 transition-all disabled:opacity-50 flex items-center gap-2"
            >
              <RefreshCw size={15} className={isScanning ? "animate-spin" : ""} />
              <span>{isScanning ? "Scanning…" : "Run scan"}</span>
            </button>
          )}
        </header>

        {activeTab === 'settings' ? (
          <KeychainSettings
            awsKeyId={awsKeyId} setAwsKeyId={setAwsKeyId}
            awsSecretKey={awsSecretKey} setAwsSecretKey={setAwsSecretKey}
            vercelToken={vercelToken} setVercelToken={setVercelToken}
            supabaseToken={supabaseToken} setSupabaseToken={setSupabaseToken}
            gcpProjectId={gcpProjectId} setGcpProjectId={setGcpProjectId}
            gcpCredential={gcpCredential} setGcpCredential={setGcpCredential}
            azureSubscriptionId={azureSubscriptionId} setAzureSubscriptionId={setAzureSubscriptionId}
            azureTenantId={azureTenantId} setAzureTenantId={setAzureTenantId}
            azureClientId={azureClientId} setAzureClientId={setAzureClientId}
            azureClientSecret={azureClientSecret} setAzureClientSecret={setAzureClientSecret}
            openAiKey={openAiKey} setOpenAiKey={setOpenAiKey}
            savedCredentials={savedCredentials}
            verifiedCredentials={verifiedCredentials}
            onCredentialsSaved={handleCredentialsSaved}
            onCredentialsVerified={handleCredentialsVerified}
            onClearProvider={clearProviderCredentials}
            onLogActivity={addActivity}
            scanSettings={scanSettings}
            onUpdateScanSettings={updateScanSettings}
          />
        ) : activeTab === 'activity' ? (
          <ActivityLog events={activityEvents} onClear={() => setActivityEvents([])} />
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr_1fr] gap-4 mb-6">
              <div className="relative overflow-hidden bg-gradient-to-br from-indigo-600 to-violet-600 p-6 rounded-2xl text-white shadow-xl shadow-indigo-600/10">
                <div className="absolute -right-10 -top-14 h-40 w-40 rounded-full border-[24px] border-white/[0.06]" />
                <div className="flex items-center gap-2 text-indigo-100 text-xs font-medium"><TrendingDown size={15} /><span>Potential monthly savings</span></div>
                <div className="text-4xl font-semibold tracking-tight mt-3">
                  ${totalMonthlyLoss.toFixed(2)}
                  <span className="text-sm font-normal text-indigo-200"> / month</span>
                </div>
                <p className="text-xs text-indigo-200 mt-2">${(totalMonthlyLoss * 12).toFixed(0)} projected annually</p>
              </div>

              <div className="bg-white dark:bg-white/[0.035] p-5 rounded-2xl border border-slate-200 dark:border-white/[0.07]">
                <ShieldCheck size={18} className="text-emerald-500 mb-5" />
                <div className="text-2xl font-semibold text-slate-900 dark:text-white">{activeItems.length}</div>
                <span className="text-slate-500 dark:text-slate-400 text-xs">Findings to review</span>
                </div>

              <div className="bg-white dark:bg-white/[0.035] p-5 rounded-2xl border border-slate-200 dark:border-white/[0.07]">
                <Cloud size={18} className="text-indigo-500 mb-5" />
                <div className="text-2xl font-semibold text-slate-900 dark:text-white">{new Set(activeItems.map((item) => item.provider)).size}</div>
                <span className="text-slate-500 dark:text-slate-400 text-xs">Providers with findings</span>
              </div>
            </div>

            <ProviderStatusStrip providerStatus={providerStatus} onRetry={handleRetryProvider} isScanning={isScanning} />

            <WasteDistribution wasteItems={activeItems} />

            {scanMessage && <div className="mb-6 px-4 py-3 rounded-xl border border-indigo-200 dark:border-indigo-500/20 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 text-sm">{scanMessage}</div>}

            <AiInsights wasteItems={activeItems} />

            <ProviderTabs
              selectedProvider={selectedProvider}
              setSelectedProvider={setSelectedProvider}
              wasteItems={activeItems}
            />

            <WasteTable wasteItems={filteredRecords} onKillResource={handleKillResource} />
          </>
        )}
        </div>
      </main>
    </div>
  );
}
