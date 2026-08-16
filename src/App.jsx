import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import WasteTable from './components/WasteTable';
import ProviderTabs from './components/ProviderTabs';
import WasteDistribution from './components/WasteDistribution';
import KeychainSettings from './components/KeychainSettings';
import AiInsights from './components/AiInsights';
import ActivityLog from './components/ActivityLog';
import { scanAwsWaste } from './lib/awsScanner';
import { scanVercelWaste } from './lib/vercelScanner';
import { scanSupabaseWaste } from './lib/supabaseScanner';
import { scanGcpWaste } from './lib/gcpScanner';
import { scanAzureWaste } from './lib/azureScanner';
import { scanOpenAiWaste } from './lib/openaiScanner';
import { deleteResource } from './lib/deleter';
import { retrieveLocalKeys } from './lib/keychain';
import { RefreshCw, TrendingDown, ShieldCheck, Cloud } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isScanning, setIsScanning] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState('ALL');

  // Credentials State
  const [awsKeyId, setAwsKeyId] = useState('');
  const [awsSecretKey, setAwsSecretKey] = useState('');
  const [vercelToken, setVercelToken] = useState('');
  const [supabaseToken, setSupabaseToken] = useState('');
  const [gcpToken, setGcpToken] = useState('');
  const [azureSubscriptionId, setAzureSubscriptionId] = useState('');
  const [azureToken, setAzureToken] = useState('');
  const [openAiKey, setOpenAiKey] = useState('');
  const [scanMessage, setScanMessage] = useState('');
  const [activityEvents, setActivityEvents] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('watermonkey-activity') || '[]');
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('watermonkey-activity', JSON.stringify(activityEvents.slice(0, 250)));
  }, [activityEvents]);

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
      if (aws) { setAwsKeyId(aws.keyId); setAwsSecretKey(aws.secretKey); }
      if (vercel) setVercelToken(vercel.keyId);
      if (supabase) setSupabaseToken(supabase.keyId);
      if (gcp) setGcpToken(gcp.keyId);
      if (azure) { setAzureSubscriptionId(azure.keyId); setAzureToken(azure.secretKey); }
      if (openai) setOpenAiKey(openai.keyId);
    };
    restoreCredentials();
  }, []);

  const [wasteItems, setWasteItems] = useState([]);

  const totalMonthlyLoss = wasteItems.reduce((acc, i) => acc + i.monthlyLoss, 0);

  const filteredItems = selectedProvider === 'ALL'
    ? wasteItems
    : wasteItems.filter(item => item.provider === selectedProvider);

  const handleRunScan = async () => {
    setIsScanning(true);
    addActivity({ category: 'scan', status: 'info', title: 'Fleet scan started', message: 'Checking all configured providers for potential cloud waste.' });
    try {
      setScanMessage('');
      const scans = [
        ['AWS', awsKeyId && awsSecretKey ? scanAwsWaste("us-east-1", awsKeyId, awsSecretKey) : Promise.resolve([])],
        ['Vercel', scanVercelWaste(vercelToken)],
        ['Supabase', scanSupabaseWaste(supabaseToken)],
        ['GCP', scanGcpWaste(gcpToken)],
        ['Azure', scanAzureWaste(azureToken)],
        ['OpenAI', scanOpenAiWaste(openAiKey)],
      ];
      const results = await Promise.allSettled(scans.map(([, scan]) => scan));
      const combinedWaste = results.flatMap((result) => result.status === 'fulfilled' ? result.value : []).filter(item => item.monthlyLoss > 0);
      const failed = results.flatMap((result, index) => result.status === 'rejected' ? [scans[index][0]] : []);
      const failureDetails = results.flatMap((result, index) => result.status === 'rejected'
        ? [`${scans[index][0]}: ${result.reason?.message || String(result.reason)}`]
        : []);
      const skipped = [
        !awsKeyId || !awsSecretKey ? 'AWS' : null,
        !vercelToken ? 'Vercel' : null,
        !supabaseToken ? 'Supabase' : null,
        !gcpToken ? 'GCP' : null,
        !azureToken ? 'Azure' : null,
        !openAiKey ? 'OpenAI' : null,
      ].filter(Boolean);
      setWasteItems(combinedWaste);
      setScanMessage(failed.length
        ? `Scan completed with warnings. ${failureDetails.join(' ')}`
        : skipped.length
          ? `Scan completed. Skipped unconfigured providers: ${skipped.join(', ')}.`
          : 'Fleet audit completed.');
      addActivity({
        category: 'scan',
        status: failed.length ? 'warning' : 'success',
        title: failed.length ? 'Scan completed with warnings' : 'Fleet scan completed',
        message: `${combinedWaste.length} finding${combinedWaste.length === 1 ? '' : 's'} detected with $${combinedWaste.reduce((sum, item) => sum + item.monthlyLoss, 0).toFixed(2)}/month in potential savings.${failureDetails.length ? ` ${failureDetails.join(' ')}` : ''}${skipped.length ? ` Skipped: ${skipped.join(', ')}.` : ''}`,
      });
    } catch (err) {
      console.error("Scan error:", err);
      addActivity({ category: 'scan', status: 'error', title: 'Fleet scan failed', message: err.message || String(err) });
    } finally {
      setIsScanning(false);
    }
  };

  const handleKillResource = async (item) => {
    const result = item.remediable === false
      ? { success: true, message: 'Finding acknowledged.' }
      : await deleteResource(item, { awsKeyId, awsSecretKey, vercelToken, supabaseToken, gcpToken, azureToken });
    if (!result.success) {
      addActivity({ category: 'remediation', status: 'error', provider: item.provider, title: 'Remediation failed', message: `${item.resource}: ${result.message}` });
      throw new Error(result.message);
    }
    setWasteItems((current) => current.filter((entry) => entry.id !== item.id));
    setScanMessage(result.message);
    addActivity({
      category: 'remediation',
      status: 'success',
      provider: item.provider,
      title: item.remediable === false ? 'Finding acknowledged' : 'Resource resolved',
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
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      <main className="app-grid flex-1 overflow-y-auto">
        <div className="max-w-[1320px] mx-auto px-8 py-7">
        <header className="flex justify-between items-center mb-8">
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
            gcpToken={gcpToken} setGcpToken={setGcpToken}
            azureSubscriptionId={azureSubscriptionId} setAzureSubscriptionId={setAzureSubscriptionId}
            azureToken={azureToken} setAzureToken={setAzureToken}
            openAiKey={openAiKey} setOpenAiKey={setOpenAiKey}
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
                <div className="text-2xl font-semibold text-slate-900 dark:text-white">{wasteItems.length}</div>
                <span className="text-slate-500 dark:text-slate-400 text-xs">Findings to review</span>
                </div>

              <div className="bg-white dark:bg-white/[0.035] p-5 rounded-2xl border border-slate-200 dark:border-white/[0.07]">
                <Cloud size={18} className="text-indigo-500 mb-5" />
                <div className="text-2xl font-semibold text-slate-900 dark:text-white">{new Set(wasteItems.map((item) => item.provider)).size}</div>
                <span className="text-slate-500 dark:text-slate-400 text-xs">Providers with findings</span>
              </div>
            </div>

            <WasteDistribution wasteItems={wasteItems} />

            {scanMessage && <div className="mb-6 px-4 py-3 rounded-xl border border-indigo-200 dark:border-indigo-500/20 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 text-sm">{scanMessage}</div>}

            <AiInsights wasteItems={wasteItems} />

            <ProviderTabs
              selectedProvider={selectedProvider}
              setSelectedProvider={setSelectedProvider}
              wasteItems={wasteItems}
            />

            <WasteTable wasteItems={filteredItems} onKillResource={handleKillResource} />
          </>
        )}
        </div>
      </main>
    </div>
  );
}
