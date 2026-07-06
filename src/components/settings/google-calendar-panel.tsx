'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from '@/components/ui/card';
import { Calendar, CheckCircle2, RefreshCw, Link2, User, Save } from 'lucide-react';
import { toast } from 'sonner';

interface GoogleAccount {
  id: string;
  email: string;
  name: string;
  avatar_url: string;
  connected: boolean;
  calendar_id?: string;
}

interface CalendarListItem {
  id: string;
  summary: string;
  primary: boolean;
}

export function GoogleCalendarPanel() {
  const [accounts, setAccounts] = useState<GoogleAccount[]>([]);
  const [calendarsMap, setCalendarsMap] = useState<Record<string, CalendarListItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [loadingCalendars, setLoadingCalendars] = useState<Record<string, boolean>>({});
  const [selectedCalendarMap, setSelectedCalendarMap] = useState<Record<string, string>>({});
  const [savingMap, setSavingMap] = useState<Record<string, boolean>>({});

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
        
        // Auto-load calendars for all accounts
        const accountsList = data.accounts || [];
        accountsList.forEach((acc: GoogleAccount) => {
          loadCalendarsForAccount(acc.id, acc.calendar_id || 'primary');
        });
      }
    } catch (err) {
      toast.error('Failed to load configuration');
    } finally {
      setLoading(false);
    }
  };

  const loadCalendarsForAccount = async (accountId: string, currentCalendarId: string) => {
    try {
      setLoadingCalendars(prev => ({ ...prev, [accountId]: true }));
      const res = await fetch(`/api/google-calendar/list?googleAccountId=${accountId}`);
      const data = await res.json();
      if (res.ok) {
        setCalendarsMap(prev => ({ ...prev, [accountId]: data.calendars || [] }));
        setSelectedCalendarMap(prev => ({ ...prev, [accountId]: currentCalendarId }));
      } else {
        console.error(`Failed to fetch calendars for account ${accountId}:`, data.error);
      }
    } catch (err) {
      console.error('Error loading calendars:', err);
    } finally {
      setLoadingCalendars(prev => ({ ...prev, [accountId]: false }));
    }
  };

  const handleConnect = () => {
    window.location.href = '/api/oauth/google';
  };

  const handleSaveCalendar = async (googleAccountId: string) => {
    const calendarId = selectedCalendarMap[googleAccountId];
    if (!calendarId) return;

    try {
      setSavingMap(prev => ({ ...prev, [googleAccountId]: true }));
      const res = await fetch('/api/google-sheets/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_calendar_id',
          googleAccountId,
          calendarId,
        }),
      });

      if (res.ok) {
        toast.success('Google Calendar linked successfully!');
        loadConfig();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to link Google Calendar');
      }
    } catch (err) {
      toast.error('Error saving Google Calendar configuration');
    } finally {
      setSavingMap(prev => ({ ...prev, [googleAccountId]: false }));
    }
  };

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
              <Calendar className="h-5 w-5 text-blue-400" />
              Google Calendar Settings
            </CardTitle>
            <CardDescription className="text-xs text-slate-400">
              Configure which Google Calendar to use for automated WhatsApp appointment bookings.
            </CardDescription>
          </div>
          <Button
            onClick={handleConnect}
            className="flex items-center gap-2 text-xs"
          >
            <Link2 className="h-3.5 w-3.5" />
            Connect Google Account
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          {accounts.length === 0 ? (
            <div className="text-center py-8 border border-dashed border-slate-800 rounded-xl bg-slate-950/20 text-slate-400 text-xs">
              No Google accounts linked yet. Click the button above to link your account.
            </div>
          ) : (
            <div className="space-y-4">
              {accounts.map((acc) => {
                const calendars = calendarsMap[acc.id] || [];
                const isLoadingCals = loadingCalendars[acc.id];
                const selectedVal = selectedCalendarMap[acc.id] || '';
                const isSaving = savingMap[acc.id];

                return (
                  <div key={acc.id} className="p-5 rounded-xl border border-slate-800 bg-slate-950/40 space-y-4">
                    <div className="flex items-center justify-between">
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
                          <p className="text-[10px] text-slate-400">{acc.email || 'No email'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 bg-emerald-950/30 px-2.5 py-1 rounded-full border border-emerald-900/50">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Authenticated
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-900 space-y-3">
                      <div>
                        <label className="text-[10px] text-slate-400 font-semibold block mb-1.5">
                          Target Booking Calendar
                        </label>
                        <div className="flex gap-3 max-w-md">
                          {isLoadingCals ? (
                            <div className="text-xs text-slate-400 flex items-center gap-2">
                              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                              Loading calendars...
                            </div>
                          ) : (
                            <select
                              value={selectedVal}
                              onChange={(e) => setSelectedCalendarMap(prev => ({ ...prev, [acc.id]: e.target.value }))}
                              className="w-full rounded border border-slate-700 bg-slate-900 p-2 text-xs text-white"
                            >
                              <option value="primary">Default primary calendar</option>
                              {calendars.map(cal => (
                                <option key={cal.id} value={cal.id}>
                                  {cal.summary} {cal.primary ? '(Primary)' : ''}
                                </option>
                              ))}
                            </select>
                          )}
                          <Button
                            onClick={() => handleSaveCalendar(acc.id)}
                            disabled={isSaving || isLoadingCals}
                            size="sm"
                            className="flex items-center gap-1.5 text-xs px-4"
                          >
                            <Save className="h-4 w-4" />
                            {isSaving ? 'Saving...' : 'Save'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
