'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from '@/components/ui/card';
import { FileSpreadsheet, CheckCircle2, RefreshCw, Link2, Trash2, Plus, ExternalLink, User } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '@/hooks/use-language';

interface GoogleAccount {
  id: string;
  email: string;
  name: string;
  avatar_url: string;
  connected: boolean;
}

interface LinkedSpreadsheet {
  id: string;
  google_account_id: string;
  spreadsheet_id: string;
  title: string;
  url: string;
  created_at: string;
}

export function GoogleSheetsPanel() {
  const { language } = useLanguage();
  const [accounts, setAccounts] = useState<GoogleAccount[]>([]);
  const [sheets, setSheets] = useState<LinkedSpreadsheet[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filtering & Selected states
  const [selectedAccountId, setSelectedAccountId] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'create' | 'link' | null>(null);

  // Form values
  const [linkAccountId, setLinkAccountId] = useState('');
  const [sheetUrl, setSheetUrl] = useState('');
  const [sheetTitle, setSheetTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/google-sheets/config');
      const data = await res.json();
      if (res.ok) {
        setAccounts(data.accounts || []);
        setSheets(data.sheets || []);
        if (data.accounts?.length > 0) {
          setLinkAccountId(data.accounts[0].id);
        }
      }
    } catch (err) {
      toast.error('Failed to load configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = () => {
    window.location.href = '/api/oauth/google';
  };

  const handleUnlinkAccount = async (googleAccountId: string) => {
    if (!confirm('Are you sure you want to unlink this Google account? All linked spreadsheets for this account will be removed.')) return;
    try {
      const res = await fetch('/api/google-sheets/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unlink_account', googleAccountId }),
      });
      if (res.ok) {
        toast.success('Account unlinked successfully');
        loadConfig();
      } else {
        toast.error('Failed to unlink account');
      }
    } catch (err) {
      toast.error('Error unlinking account');
    }
  };

  const handleAddExisting = async () => {
    if (!sheetUrl || !linkAccountId) {
      toast.error('Please fill in all fields');
      return;
    }
    try {
      setSubmitting(true);
      const res = await fetch('/api/google-sheets/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'link_existing',
          urlOrId: sheetUrl,
          googleAccountId: linkAccountId
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('Spreadsheet linked successfully!');
        setSheetUrl('');
        setActiveTab(null);
        loadConfig();
      } else {
        toast.error(data.error || 'Failed to link spreadsheet');
      }
    } catch (err) {
      toast.error('Error linking spreadsheet');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateNew = async () => {
    if (!sheetTitle || !linkAccountId) {
      toast.error('Please enter a sheet title');
      return;
    }
    try {
      setSubmitting(true);
      const res = await fetch('/api/google-sheets/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_new',
          title: sheetTitle,
          googleAccountId: linkAccountId
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('New spreadsheet created and linked!');
        setSheetTitle('');
        setActiveTab(null);
        loadConfig();
      } else {
        toast.error(data.error || 'Failed to create spreadsheet');
      }
    } catch (err) {
      toast.error('Error creating spreadsheet');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUnlinkSheet = async (sheetId: string) => {
    if (!confirm('Are you sure you want to unlink this spreadsheet?')) return;
    try {
      const res = await fetch('/api/google-sheets/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unlink_sheet', sheetId }),
      });
      if (res.ok) {
        toast.success('Spreadsheet unlinked');
        loadConfig();
      } else {
        toast.error('Failed to unlink spreadsheet');
      }
    } catch (err) {
      toast.error('Error unlinking spreadsheet');
    }
  };

  const filteredSheets = selectedAccountId === 'all'
    ? sheets
    : sheets.filter(s => s.google_account_id === selectedAccountId);

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-slate-800 bg-slate-900/50 backdrop-blur-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="text-white flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-emerald-400" />
              {language === 'ar' ? 'حسابات جوجل المتصلة' : 'Connected Google Accounts'}
            </CardTitle>
            <CardDescription className="text-xs text-slate-400">
              {language === 'ar' ? 'إدارة حسابات جوجل المتصلة وجداول البيانات المرتبطة بها.' : 'Manage your connected Google accounts and linked spreadsheets.'}
            </CardDescription>
          </div>
          <Button
            onClick={handleConnect}
            className="flex items-center gap-2 text-xs"
          >
            <Link2 className="h-3.5 w-3.5" />
            {language === 'ar' ? 'ربط حساب جوجل' : 'Sign in with Google'}
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Accounts Grid */}
          {accounts.length === 0 ? (
            <div className="text-center py-8 border border-dashed border-slate-800 rounded-xl bg-slate-950/20 text-slate-400 text-xs">
              {language === 'ar' ? 'لا توجد حسابات جوجل مرتبطة بعد. اضغط على الزر أعلاه لربط حسابك الأول.' : 'No Google accounts linked yet. Click the button above to link your first account.'}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {accounts.map((acc) => (
                <div key={acc.id} className="flex items-center justify-between p-4 rounded-xl border border-slate-800 bg-slate-950/40">
                  <div className="flex items-center gap-3">
                    {acc.avatar_url ? (
                      <img src={acc.avatar_url} alt={acc.name} className="h-10 w-10 rounded-full border border-slate-700" />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                        <User className="h-5 w-5" />
                      </div>
                    )}
                    <div>
                      <h4 className="text-xs font-semibold text-slate-200">{acc.name}</h4>
                      <p className="text-[10px] text-slate-400">{acc.email}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleConnect}
                      className="text-[10px] h-7 px-2 hover:bg-slate-800 text-slate-300"
                    >
                      {language === 'ar' ? 'مزامنة' : 'Resync'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleUnlinkAccount(acc.id)}
                      className="text-[10px] h-7 px-2 text-rose-400 hover:text-rose-300 hover:bg-rose-950/20"
                    >
                      {language === 'ar' ? 'إلغاء الربط' : 'Unlink'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Action Tabs Trigger */}
          {accounts.length > 0 && (
            <div className="space-y-4">
              <div className="flex gap-3">
                <Button
                  variant={activeTab === 'create' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setActiveTab(activeTab === 'create' ? null : 'create')}
                  className="flex items-center gap-1.5 text-xs"
                >
                  <Plus className="h-4 w-4" />
                  {language === 'ar' ? 'إنشاء جدول جديد' : 'Create New Sheet'}
                </Button>
                <Button
                  variant={activeTab === 'link' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setActiveTab(activeTab === 'link' ? null : 'link')}
                  className="flex items-center gap-1.5 text-xs"
                >
                  <Link2 className="h-4 w-4" />
                  {language === 'ar' ? 'ربط جدول موجود' : 'Add Existing Sheet'}
                </Button>
              </div>

              {/* Create Sheet Form */}
              {activeTab === 'create' && (
                <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/60 space-y-4 max-w-md">
                  <h3 className="text-xs font-bold text-slate-200">
                    {language === 'ar' ? 'إنشاء جدول بيانات جديد في جوجل' : 'Create New Spreadsheet'}
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-1">
                        {language === 'ar' ? 'الحساب المتصل المستهدف' : 'Target Google Account'}
                      </label>
                      <select
                        value={linkAccountId}
                        onChange={(e) => setLinkAccountId(e.target.value)}
                        className="w-full rounded border border-slate-700 bg-slate-900 p-1.5 text-xs text-white"
                      >
                        {accounts.map(a => (
                          <option key={a.id} value={a.id}>{a.email}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-1">
                        {language === 'ar' ? 'عنوان الجدول' : 'Spreadsheet Title'}
                      </label>
                      <Input
                        placeholder={language === 'ar' ? 'مثال: عملاء الواتساب المكتملين' : 'e.g. Leads Export'}
                        value={sheetTitle}
                        onChange={(e) => setSheetTitle(e.target.value)}
                        className="bg-slate-900 border-slate-800 text-xs text-white"
                      />
                    </div>
                    <Button
                      onClick={handleCreateNew}
                      disabled={submitting}
                      className="w-full text-xs"
                    >
                      {submitting 
                        ? (language === 'ar' ? 'جاري الإنشاء...' : 'Creating...') 
                        : (language === 'ar' ? 'إنشاء جدول البيانات' : 'Create Spreadsheet')}
                    </Button>
                  </div>
                </div>
              )}

              {/* Link Existing Sheet Form */}
              {activeTab === 'link' && (
                <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/60 space-y-4 max-w-md">
                  <h3 className="text-xs font-bold text-slate-200">
                    {language === 'ar' ? 'ربط جدول بيانات موجود حالياً' : 'Link Existing Spreadsheet'}
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-1">
                        {language === 'ar' ? 'الحساب المتصل المستهدف' : 'Target Google Account'}
                      </label>
                      <select
                        value={linkAccountId}
                        onChange={(e) => setLinkAccountId(e.target.value)}
                        className="w-full rounded border border-slate-700 bg-slate-900 p-1.5 text-xs text-white"
                      >
                        {accounts.map(a => (
                          <option key={a.id} value={a.id}>{a.email}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-1">
                        {language === 'ar' ? 'رابط الجدول أو الـ ID' : 'Spreadsheet Link or ID'}
                      </label>
                      <Input
                        placeholder="https://docs.google.com/spreadsheets/d/your-id/edit"
                        value={sheetUrl}
                        onChange={(e) => setSheetUrl(e.target.value)}
                        className="bg-slate-900 border-slate-800 text-xs text-white"
                      />
                    </div>
                    <Button
                      onClick={handleAddExisting}
                      disabled={submitting}
                      className="w-full text-xs"
                    >
                      {submitting 
                        ? (language === 'ar' ? 'جاري الربط...' : 'Linking...') 
                        : (language === 'ar' ? 'ربط جدول البيانات' : 'Link Spreadsheet')}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Linked Sheets Table Section */}
          {sheets.length > 0 && (
            <div className="space-y-4 pt-4 border-t border-slate-800">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">
                  {language === 'ar' ? 'جداول البيانات المرتبطة' : 'Linked Spreadsheets'}
                </h3>
                <div className="flex items-center gap-2">
                  <label className="text-[10px] text-slate-400 font-medium">
                    {language === 'ar' ? 'تصفية حسب الحساب:' : 'Filter Account:'}
                  </label>
                  <select
                    value={selectedAccountId}
                    onChange={(e) => setSelectedAccountId(e.target.value)}
                    className="rounded border border-slate-700 bg-slate-950 p-1 text-[11px] text-white"
                  >
                    <option value="all">{language === 'ar' ? 'جميع الحسابات' : 'All Accounts'}</option>
                    {accounts.map(a => (
                      <option key={a.id} value={a.id}>{a.email}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/20">
                <table className="w-full border-collapse text-left text-xs" style={{ direction: language === 'ar' ? 'rtl' : 'ltr' }}>
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400 font-medium">
                      <th className={`p-3 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                        {language === 'ar' ? 'العنوان' : 'Title'}
                      </th>
                      <th className={`p-3 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                        {language === 'ar' ? 'معرف الجدول (ID)' : 'Spreadsheet ID'}
                      </th>
                      <th className={`p-3 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                        {language === 'ar' ? 'تاريخ الربط' : 'Linked At'}
                      </th>
                      <th className={`p-3 ${language === 'ar' ? 'text-left' : 'text-right'}`}>
                        {language === 'ar' ? 'الإجراءات' : 'Actions'}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    {filteredSheets.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-900/30">
                        <td className={`p-3 font-medium text-slate-200 ${language === 'ar' ? 'text-right' : 'text-left'}`}>{s.title}</td>
                        <td className={`p-3 font-mono text-[10px] text-slate-400 ${language === 'ar' ? 'text-right' : 'text-left'}`}>{s.spreadsheet_id}</td>
                        <td className={`p-3 text-slate-400 ${language === 'ar' ? 'text-right' : 'text-left'}`}>{new Date(s.created_at).toLocaleDateString()}</td>
                        <td className={`p-3 flex gap-2 ${language === 'ar' ? 'justify-start' : 'justify-end'}`}>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => window.open(s.url, '_blank')}
                            className="h-8 w-8 text-sky-400 hover:text-sky-300 hover:bg-sky-950/20"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleUnlinkSheet(s.id)}
                            className="h-8 w-8 text-rose-400 hover:text-rose-350 hover:bg-rose-950/20"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
