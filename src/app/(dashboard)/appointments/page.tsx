'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Calendar as CalendarIcon,
  Plus,
  RefreshCw,
  Search,
  Settings as SettingsIcon,
  Users,
  CheckCircle,
  XCircle,
  AlertCircle,
  Trash2,
  Edit2,
  Clock,
  Briefcase,
  Sliders,
  FileText,
  MapPin,
  CalendarDays,
  User,
  Phone,
  Link,
  DollarSign,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useLanguage } from '@/hooks/use-language';
import { toast } from 'sonner';

interface Appointment {
  id: string;
  patient_name: string;
  patient_phone: string;
  scheduled_at: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'rescheduled';
  booking_source: 'whatsapp' | 'dashboard';
  created_by_ai: boolean;
  staff?: { name: string } | null;
  service?: { name: string } | null;
  staff_id?: string;
  service_id?: string;
}

interface Staff {
  id: string;
  name: string;
  email: string | null;
  google_calendar_id: string | null;
  is_active: boolean;
}

interface Service {
  id: string;
  name: string;
  duration_minutes: number;
  price: number | null;
  description: string | null;
  color: string;
}

interface WorkingHour {
  day_of_week: number;
  opening_time: string;
  closing_time: string;
  is_active: boolean;
}

export default function AppointmentsPage() {
  const { t, language } = useLanguage();
  const router = useRouter();

  // Authentication & Gate States
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleEmail, setGoogleEmail] = useState('');
  const [loading, setLoading] = useState(true);

  // Core Data States
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [workingHours, setWorkingHours] = useState<WorkingHour[]>([]);
  const [settings, setSettings] = useState<any>(null);

  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [staffFilter, setStaffFilter] = useState('all');

  // Modal Dialog States
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [staffModalOpen, setStaffModalOpen] = useState(false);
  const [serviceModalOpen, setServiceModalOpen] = useState(false);

  // Form Fields
  const [newBooking, setNewBooking] = useState({
    patient_name: '',
    patient_phone: '',
    date: '',
    time: '',
    staff_id: 'none',
    service_id: 'none'
  });

  const [staffForm, setStaffForm] = useState({
    id: '',
    name: '',
    email: '',
    google_calendar_id: '',
    is_active: true
  });

  const [serviceForm, setServiceForm] = useState({
    id: '',
    name: '',
    duration_minutes: 30,
    price: '',
    description: '',
    color: '#3b82f6'
  });

  // Calendar View Date
  const [currentCalendarDate, setCurrentCalendarDate] = useState(new Date());

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    try {
      setLoading(true);
      const settingsRes = await fetch('/api/appointments/settings');
      const settingsData = await settingsRes.json();
      
      if (settingsRes.ok) {
        setGoogleConnected(settingsData.googleCalendarConnected);
        setGoogleEmail(settingsData.googleCalendarEmail || '');
        setSettings(settingsData.settings);

        if (settingsData.googleCalendarConnected) {
          // Connected - fetch other data
          const [apptsRes, staffRes, servsRes, whRes] = await Promise.all([
            fetch('/api/appointments'),
            fetch('/api/appointments/staff'),
            fetch('/api/appointments/services'),
            fetch('/api/appointments/working-hours')
          ]);

          const apptsData = await apptsRes.json();
          const staffData = await staffRes.json();
          const servsData = await servsRes.json();
          const whData = await whRes.json();

          if (apptsRes.ok) setAppointments(apptsData.appointments || []);
          if (staffRes.ok) setStaffList(staffData.staff || []);
          if (servsRes.ok) setServices(servsData.services || []);
          if (whRes.ok) setWorkingHours(whData.workingHours || []);
        }
      }
    } catch (err) {
      toast.error('Failed to load appointments module configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleConnect = () => {
    window.location.href = '/api/oauth/google-calendar';
  };

  const handleCreateBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBooking.patient_name || !newBooking.date || !newBooking.time) {
      toast.error('Please fill in required fields');
      return;
    }

    try {
      const scheduledAt = `${newBooking.date}T${newBooking.time}:00`;
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_name: newBooking.patient_name,
          patient_phone: newBooking.patient_phone,
          scheduled_at: scheduledAt,
          staff_id: newBooking.staff_id === 'none' ? null : newBooking.staff_id,
          service_id: newBooking.service_id === 'none' ? null : newBooking.service_id
        })
      });

      const data = await res.json();
      if (res.ok) {
        toast.success('Appointment booked successfully!');
        setBookingModalOpen(false);
        setNewBooking({ patient_name: '', patient_phone: '', date: '', time: '', staff_id: 'none', service_id: 'none' });
        loadAllData();
      } else {
        toast.error(data.error || 'Failed to book appointment');
      }
    } catch (err) {
      toast.error('An error occurred during booking');
    }
  };

  const handleSaveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffForm.name) return;

    try {
      const method = staffForm.id ? 'PUT' : 'POST';
      const url = staffForm.id ? `/api/appointments/staff/${staffForm.id}` : '/api/appointments/staff';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(staffForm)
      });

      if (res.ok) {
        toast.success(staffForm.id ? 'Staff updated' : 'Staff created');
        setStaffModalOpen(false);
        setStaffForm({ id: '', name: '', email: '', google_calendar_id: '', is_active: true });
        loadAllData();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Error saving staff');
      }
    } catch (err) {
      toast.error('Error saving staff');
    }
  };

  const handleSaveService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serviceForm.name || !serviceForm.duration_minutes) return;

    try {
      const method = serviceForm.id ? 'PUT' : 'POST';
      const url = serviceForm.id ? `/api/appointments/services/${serviceForm.id}` : '/api/appointments/services';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(serviceForm)
      });

      if (res.ok) {
        toast.success(serviceForm.id ? 'Service updated' : 'Service created');
        setServiceModalOpen(false);
        setServiceForm({ id: '', name: '', duration_minutes: 30, price: '', description: '', color: '#3b82f6' });
        loadAllData();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Error saving service');
      }
    } catch (err) {
      toast.error('Error saving service');
    }
  };

  const handleDeleteStaff = async (id: string) => {
    if (!confirm('Are you sure you want to delete this staff member?')) return;
    try {
      const res = await fetch(`/api/appointments/staff/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Staff member deleted');
        loadAllData();
      }
    } catch (err) {
      toast.error('Error deleting staff');
    }
  };

  const handleDeleteService = async (id: string) => {
    if (!confirm('Are you sure you want to delete this service?')) return;
    try {
      const res = await fetch(`/api/appointments/services/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Service deleted');
        loadAllData();
      }
    } catch (err) {
      toast.error('Error deleting service');
    }
  };

  const handleCancelAppointment = async (apptId: string) => {
    if (!confirm('Are you sure you want to cancel this appointment?')) return;
    try {
      const res = await fetch(`/api/appointments/${apptId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' })
      });
      if (res.ok) {
        toast.success('Appointment cancelled');
        loadAllData();
      }
    } catch (err) {
      toast.error('Error cancelling appointment');
    }
  };

  const handleWorkingHoursSave = async () => {
    try {
      const res = await fetch('/api/appointments/working-hours', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workingHours })
      });
      if (res.ok) {
        toast.success('Working hours saved successfully');
      } else {
        toast.error('Failed to save working hours');
      }
    } catch (err) {
      toast.error('Error saving working hours');
    }
  };

  const handleSettingsSave = async (updatedSettings: any) => {
    try {
      const res = await fetch('/api/appointments/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedSettings)
      });
      if (res.ok) {
        toast.success('Settings updated');
        loadAllData();
      }
    } catch (err) {
      toast.error('Error saving settings');
    }
  };

  // Rendering Helper: Loading Spinner
  if (loading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Gate Screen: Setup Google Calendar Connection
  if (!googleConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] p-6 text-center space-y-6">
        <div className="relative p-6 rounded-full bg-slate-900 border border-slate-800 shadow-xl animate-pulse">
          <CalendarDays className="h-16 w-16 text-blue-500" />
        </div>
        <div className="max-w-md space-y-2">
          <h1 className="text-3xl font-extrabold text-white tracking-tight">
            {language === 'ar' ? 'نظام حجز المواعيد الذكي' : 'Smart Appointment Booking System'}
          </h1>
          <p className="text-sm text-slate-400 leading-relaxed">
            {language === 'ar' 
              ? 'اربط تقويم جوجل الخاص بك للبدء في استقبال وإدارة المواعيد بشكل تلقائي بالكامل عبر محادثات الواتساب.' 
              : 'Connect your Google Calendar to start accepting and managing appointments automatically via WhatsApp.'}
          </p>
        </div>
        <Button 
          onClick={handleGoogleConnect}
          className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-8 py-3 rounded-xl shadow-lg shadow-blue-600/30 flex items-center gap-3 transition duration-200"
        >
          <Link className="h-5 w-5" />
          {language === 'ar' ? 'ربط تقويم جوجل الآن' : 'Connect Google Calendar'}
        </Button>
      </div>
    );
  }

  // Filter Logic for appointments list
  const filteredAppointments = appointments.filter(appt => {
    const matchesSearch = appt.patient_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (appt.patient_phone && appt.patient_phone.includes(searchQuery));
    const matchesStatus = statusFilter === 'all' || appt.status === statusFilter;
    const matchesStaff = staffFilter === 'all' || appt.staff_id === staffFilter;
    return matchesSearch && matchesStatus && matchesStaff;
  });

  return (
    <div className="space-y-6">
      {/* Title Bar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <CalendarDays className="h-6 w-6 text-blue-500" />
            {language === 'ar' ? 'إدارة المواعيد' : 'Appointments Management'}
          </h1>
          <p className="text-xs text-slate-400">
            {language === 'ar' ? `متصل بالتقويم: ${googleEmail}` : `Connected to Calendar: ${googleEmail}`}
          </p>
        </div>
        <Button 
          onClick={() => setBookingModalOpen(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500"
        >
          <Plus className="h-4 w-4" />
          {language === 'ar' ? 'موعد جديد' : 'New Appointment'}
        </Button>
      </div>

      {/* Statistics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-slate-900/60 border-slate-800">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 bg-blue-950/40 text-blue-400 rounded-xl border border-blue-900/40">
              <CalendarIcon className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-medium uppercase">{language === 'ar' ? 'إجمالي الحجوزات' : 'Total Bookings'}</p>
              <h3 className="text-xl font-bold text-white">{appointments.length}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/60 border-slate-800">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 bg-emerald-950/40 text-emerald-400 rounded-xl border border-emerald-900/40">
              <CheckCircle className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-medium uppercase">{language === 'ar' ? 'المؤكدة' : 'Confirmed'}</p>
              <h3 className="text-xl font-bold text-white">
                {appointments.filter(a => a.status === 'confirmed').length}
              </h3>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/60 border-slate-800">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 bg-amber-950/40 text-amber-400 rounded-xl border border-amber-900/40">
              <Clock className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-medium uppercase">{language === 'ar' ? 'بانتظار التأكيد' : 'Pending'}</p>
              <h3 className="text-xl font-bold text-white">
                {appointments.filter(a => a.status === 'pending').length}
              </h3>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/60 border-slate-800">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 bg-rose-950/40 text-rose-400 rounded-xl border border-rose-900/40">
              <XCircle className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-medium uppercase">{language === 'ar' ? 'الملغاة' : 'Cancelled'}</p>
              <h3 className="text-xl font-bold text-white">
                {appointments.filter(a => a.status === 'cancelled').length}
              </h3>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs Panel */}
      <Tabs defaultValue="list" className="w-full">
        <TabsList className="bg-slate-900 border border-slate-800 w-full justify-start overflow-x-auto">
          <TabsTrigger value="list">{language === 'ar' ? 'جدول المواعيد' : 'Appointments List'}</TabsTrigger>
          <TabsTrigger value="staff">{language === 'ar' ? 'الأطباء والكوادر' : 'Doctors & Staff'}</TabsTrigger>
          <TabsTrigger value="services">{language === 'ar' ? 'الخدمات' : 'Services'}</TabsTrigger>
          <TabsTrigger value="hours">{language === 'ar' ? 'أوقات العمل' : 'Working Hours'}</TabsTrigger>
          <TabsTrigger value="settings">{language === 'ar' ? 'الإعدادات العامة' : 'General Settings'}</TabsTrigger>
        </TabsList>

        {/* 1. Appointments List Tab */}
        <TabsContent value="list" className="space-y-4 pt-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <Input
                placeholder={language === 'ar' ? 'البحث باسم المريض أو الهاتف...' : 'Search by name or phone...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-slate-900 border-slate-800 text-white placeholder-slate-500 text-xs"
              />
            </div>
            <Select value={statusFilter} onValueChange={(val) => setStatusFilter(val || 'all')}>
              <SelectTrigger className="w-full sm:w-[160px] bg-slate-900 border-slate-800 text-white text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-800 text-white">
                <SelectItem value="all">{language === 'ar' ? 'كل الحالات' : 'All Statuses'}</SelectItem>
                <SelectItem value="confirmed">{language === 'ar' ? 'مؤكد' : 'Confirmed'}</SelectItem>
                <SelectItem value="pending">{language === 'ar' ? 'معلق' : 'Pending'}</SelectItem>
                <SelectItem value="cancelled">{language === 'ar' ? 'ملغي' : 'Cancelled'}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={staffFilter} onValueChange={(val) => setStaffFilter(val || 'all')}>
              <SelectTrigger className="w-full sm:w-[160px] bg-slate-900 border-slate-800 text-white text-xs">
                <SelectValue placeholder="Staff" />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-800 text-white">
                <SelectItem value="all">{language === 'ar' ? 'جميع الكوادر' : 'All Staff'}</SelectItem>
                {staffList.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Card className="bg-slate-900/40 border-slate-800">
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-semibold bg-slate-900/80">
                    <th className="p-4">{language === 'ar' ? 'المريض' : 'Patient'}</th>
                    <th className="p-4">{language === 'ar' ? 'التوقيت' : 'Scheduled At'}</th>
                    <th className="p-4">{language === 'ar' ? 'الكادر / الطبيب' : 'Staff / Doctor'}</th>
                    <th className="p-4">{language === 'ar' ? 'الخدمة' : 'Service'}</th>
                    <th className="p-4">{language === 'ar' ? 'القناة' : 'Source'}</th>
                    <th className="p-4">{language === 'ar' ? 'الحالة' : 'Status'}</th>
                    <th className="p-4 text-right">{language === 'ar' ? 'إجراءات' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {filteredAppointments.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-500">
                        {language === 'ar' ? 'لا توجد مواعيد مطابقة للبحث' : 'No appointments found'}
                      </td>
                    </tr>
                  ) : (
                    filteredAppointments.map((appt) => (
                      <tr key={appt.id} className="hover:bg-slate-900/20">
                        <td className="p-4">
                          <p className="font-semibold text-white">{appt.patient_name}</p>
                          <p className="text-[10px] text-slate-500">{appt.patient_phone || 'N/A'}</p>
                        </td>
                        <td className="p-4 font-mono">
                          {new Date(appt.scheduled_at).toLocaleString(language === 'ar' ? 'ar-IQ' : 'en-US')}
                        </td>
                        <td className="p-4">{appt.staff?.name || '—'}</td>
                        <td className="p-4">{appt.service?.name || '—'}</td>
                        <td className="p-4">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold ${
                            appt.booking_source === 'whatsapp' 
                              ? 'bg-green-950/40 text-green-400 border border-green-900/30' 
                              : 'bg-blue-950/40 text-blue-400 border border-blue-900/30'
                          }`}>
                            {appt.booking_source === 'whatsapp' ? 'WhatsApp' : 'Dashboard'}
                            {appt.created_by_ai && ' (AI)'}
                          </span>
                        </td>
                        <td className="p-4">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold ${
                            appt.status === 'confirmed' ? 'bg-emerald-950 text-emerald-400' :
                            appt.status === 'pending' ? 'bg-amber-950 text-amber-400' :
                            appt.status === 'cancelled' ? 'bg-rose-950 text-rose-400' :
                            'bg-slate-850 text-slate-400'
                          }`}>
                            {appt.status}
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          {appt.status !== 'cancelled' && (
                            <Button 
                              onClick={() => handleCancelAppointment(appt.id)}
                              variant="ghost" 
                              size="sm"
                              className="text-rose-500 hover:text-rose-400 hover:bg-rose-950/20 p-1"
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 2. Staff Management Tab */}
        <TabsContent value="staff" className="space-y-4 pt-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-semibold text-white">{language === 'ar' ? 'إدارة الأطباء والكوادر' : 'Doctors & Staff Management'}</h3>
            <Button 
              onClick={() => {
                setStaffForm({ id: '', name: '', email: '', google_calendar_id: '', is_active: true });
                setStaffModalOpen(true);
              }}
              size="sm"
              className="bg-blue-600 hover:bg-blue-500"
            >
              <Plus className="h-4 w-4" />
              {language === 'ar' ? 'إضافة طبيب/كادر' : 'Add Staff'}
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {staffList.map(s => (
              <Card key={s.id} className="bg-slate-900 border-slate-800">
                <CardHeader className="pb-3 flex flex-row items-start justify-between space-y-0">
                  <div>
                    <h4 className="font-bold text-white text-sm">{s.name}</h4>
                    <p className="text-[10px] text-slate-500">{s.email || 'No email'}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold ${
                    s.is_active ? 'bg-emerald-950 text-emerald-400' : 'bg-slate-850 text-slate-400'
                  }`}>
                    {s.is_active ? 'Active' : 'Inactive'}
                  </span>
                </CardHeader>
                <CardContent className="pb-4 pt-0 flex justify-between items-center text-[10px] text-slate-400">
                  <div className="flex items-center gap-1">
                    <CalendarIcon className="h-3 w-3 text-blue-400" />
                    <span>{s.google_calendar_id ? 'Sync Linked' : 'No Sync'}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      onClick={() => {
                        setStaffForm({
                          id: s.id,
                          name: s.name,
                          email: s.email || '',
                          google_calendar_id: s.google_calendar_id || '',
                          is_active: s.is_active
                        });
                        setStaffModalOpen(true);
                      }}
                      variant="ghost" 
                      size="sm" 
                      className="text-blue-400 hover:bg-blue-950/20 p-1"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button 
                      onClick={() => handleDeleteStaff(s.id)}
                      variant="ghost" 
                      size="sm" 
                      className="text-rose-500 hover:bg-rose-950/20 p-1"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* 3. Services Management Tab */}
        <TabsContent value="services" className="space-y-4 pt-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-semibold text-white">{language === 'ar' ? 'إدارة خدمات العيادة/المتجر' : 'Clinic/Store Services'}</h3>
            <Button 
              onClick={() => {
                setServiceForm({ id: '', name: '', duration_minutes: 30, price: '', description: '', color: '#3b82f6' });
                setServiceModalOpen(true);
              }}
              size="sm"
              className="bg-blue-600 hover:bg-blue-500"
            >
              <Plus className="h-4 w-4" />
              {language === 'ar' ? 'إضافة خدمة جديدة' : 'Add Service'}
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {services.map(s => (
              <Card key={s.id} className="bg-slate-900 border-slate-800">
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <h4 className="font-bold text-white text-sm flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
                      {s.name}
                    </h4>
                    <span className="text-xs font-bold text-blue-400">
                      {s.price ? `${s.price} IQD` : 'Free'}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">{s.description || 'No description'}</p>
                </CardHeader>
                <CardContent className="pb-4 flex justify-between items-center text-[10px] text-slate-400">
                  <div className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5 text-blue-400" />
                    <span>{s.duration_minutes} {language === 'ar' ? 'دقيقة' : 'mins'}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      onClick={() => {
                        setServiceForm({
                          id: s.id,
                          name: s.name,
                          duration_minutes: s.duration_minutes,
                          price: s.price ? String(s.price) : '',
                          description: s.description || '',
                          color: s.color
                        });
                        setServiceModalOpen(true);
                      }}
                      variant="ghost" 
                      size="sm" 
                      className="text-blue-400 hover:bg-blue-950/20 p-1"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button 
                      onClick={() => handleDeleteService(s.id)}
                      variant="ghost" 
                      size="sm" 
                      className="text-rose-500 hover:bg-rose-950/20 p-1"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* 4. Working Hours Tab */}
        <TabsContent value="hours" className="space-y-4 pt-4">
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white text-sm">{language === 'ar' ? 'تعديل أوقات العمل الرسمية' : 'Configure Official Working Hours'}</CardTitle>
              <CardDescription className="text-xs">{language === 'ar' ? 'حدد أوقات بدء ونهاية العمل أو عطلة نهاية الأسبوع لجميع الكوادر.' : 'Set start/end hours or weekend closures for the booking platform.'}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {workingHours.map((wh, idx) => {
                const daysOfWeekName = [
                  language === 'ar' ? 'الأحد' : 'Sunday',
                  language === 'ar' ? 'الاثنين' : 'Monday',
                  language === 'ar' ? 'الثلاثاء' : 'Tuesday',
                  language === 'ar' ? 'الأربعاء' : 'Wednesday',
                  language === 'ar' ? 'الخميس' : 'Thursday',
                  language === 'ar' ? 'الجمعة' : 'Friday',
                  language === 'ar' ? 'السبت' : 'Saturday'
                ];

                return (
                  <div key={wh.day_of_week} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 rounded-lg border border-slate-800 bg-slate-950/30">
                    <div className="flex items-center gap-3">
                      <Switch 
                        checked={wh.is_active} 
                        onCheckedChange={(checked) => {
                          const updated = [...workingHours];
                          updated[idx].is_active = checked;
                          setWorkingHours(updated);
                        }}
                      />
                      <span className="text-xs font-semibold text-white w-20">{daysOfWeekName[wh.day_of_week]}</span>
                    </div>
                    {wh.is_active ? (
                      <div className="flex items-center gap-2">
                        <Input
                          type="time"
                          value={wh.opening_time.substring(0, 5)}
                          onChange={(e) => {
                            const updated = [...workingHours];
                            updated[idx].opening_time = `${e.target.value}:00`;
                            setWorkingHours(updated);
                          }}
                          className="bg-slate-900 border-slate-800 text-white w-28 text-xs p-1"
                        />
                        <span className="text-slate-500">—</span>
                        <Input
                          type="time"
                          value={wh.closing_time.substring(0, 5)}
                          onChange={(e) => {
                            const updated = [...workingHours];
                            updated[idx].closing_time = `${e.target.value}:00`;
                            setWorkingHours(updated);
                          }}
                          className="bg-slate-900 border-slate-800 text-white w-28 text-xs p-1"
                        />
                      </div>
                    ) : (
                      <span className="text-xs text-rose-500 font-semibold">{language === 'ar' ? 'مغلق / عطلة' : 'Closed / Off'}</span>
                    )}
                  </div>
                );
              })}
              <Button onClick={handleWorkingHoursSave} className="bg-blue-600 hover:bg-blue-500 w-full text-xs">
                {language === 'ar' ? 'حفظ مواعيد العمل' : 'Save Working Hours'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 5. General Settings Tab */}
        <TabsContent value="settings" className="space-y-4 pt-4">
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white text-sm">{language === 'ar' ? 'إعدادات الحجز والتنبيهات' : 'Booking Rules & Configurations'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-slate-400">{language === 'ar' ? 'المنطقة الزمنية الحالية' : 'System Timezone'}</Label>
                  <Select 
                    value={settings?.timezone || 'Asia/Baghdad'} 
                    onValueChange={(val) => setSettings({ ...settings, timezone: val })}
                  >
                    <SelectTrigger className="bg-slate-900 border-slate-800 text-white">
                      <SelectValue placeholder="Timezone" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-800 text-white">
                      <SelectItem value="Asia/Baghdad">Asia/Baghdad</SelectItem>
                      <SelectItem value="Asia/Riyadh">Asia/Riyadh</SelectItem>
                      <SelectItem value="Asia/Dubai">Asia/Dubai</SelectItem>
                      <SelectItem value="UTC">UTC</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-slate-400">{language === 'ar' ? 'الحد الأدنى للمهلة قبل الحجز (بالساعات)' : 'Min Booking Notice (Hours)'}</Label>
                  <Input
                    type="number"
                    value={settings?.min_booking_notice_hours || 2}
                    onChange={(e) => setSettings({ ...settings, min_booking_notice_hours: Number(e.target.value) })}
                    className="bg-slate-900 border-slate-800 text-white"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-slate-400">{language === 'ar' ? 'الحد الأقصى للحجز المستقبلي (بالأيام)' : 'Max Future Booking Window (Days)'}</Label>
                  <Input
                    type="number"
                    value={settings?.max_future_booking_days || 30}
                    onChange={(e) => setSettings({ ...settings, max_future_booking_days: Number(e.target.value) })}
                    className="bg-slate-900 border-slate-800 text-white"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-slate-400">{language === 'ar' ? 'فترة حجز الموعد الافتراضية (بالدقائق)' : 'Default Slot Interval (Minutes)'}</Label>
                  <Input
                    type="number"
                    value={settings?.booking_interval_minutes || 30}
                    onChange={(e) => setSettings({ ...settings, booking_interval_minutes: Number(e.target.value) })}
                    className="bg-slate-900 border-slate-800 text-white"
                  />
                </div>
              </div>

              <div className="border-t border-slate-800 pt-4 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-white">{language === 'ar' ? 'مزامنة مع جداول جوجل (Google Sheets Sync)' : 'Google Sheets Synchronization'}</h4>
                  <p className="text-[10px] text-slate-500 mt-0.5">{language === 'ar' ? 'حفظ تلقائي لسجلات حجز المواعيد في ملف إكسل خارجي.' : 'Automatically sync every booking row to a connected sheet.'}</p>
                </div>
                <Switch 
                  checked={settings?.sheets_sync_enabled || false}
                  onCheckedChange={(checked) => setSettings({ ...settings, sheets_sync_enabled: checked })}
                />
              </div>

              <Button onClick={() => handleSettingsSave(settings)} className="bg-blue-600 hover:bg-blue-500 w-full text-xs">
                {language === 'ar' ? 'حفظ جميع الإعدادات' : 'Save Config Settings'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Manual Booking Modal Dialog */}
      <Dialog open={bookingModalOpen} onOpenChange={setBookingModalOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white text-xs">
          <DialogHeader>
            <DialogTitle>{language === 'ar' ? 'حجز موعد يدوي جديد' : 'New Manual Appointment'}</DialogTitle>
            <DialogDescription className="text-slate-400">{language === 'ar' ? 'أدخل تفاصيل المريض والخدمة لحجز الموعد مباشرة.' : 'Input the patient and booking details to create a slot.'}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateBooking} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="patient_name">{language === 'ar' ? 'اسم المريض' : 'Patient Name'} *</Label>
              <Input
                id="patient_name"
                required
                value={newBooking.patient_name}
                onChange={(e) => setNewBooking({ ...newBooking, patient_name: e.target.value })}
                className="bg-slate-950 border-slate-800"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="patient_phone">{language === 'ar' ? 'رقم الهاتف' : 'Patient Phone'}</Label>
              <Input
                id="patient_phone"
                value={newBooking.patient_phone}
                onChange={(e) => setNewBooking({ ...newBooking, patient_phone: e.target.value })}
                className="bg-slate-950 border-slate-800"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="booking_date">{language === 'ar' ? 'التاريخ' : 'Date'} *</Label>
                <Input
                  id="booking_date"
                  type="date"
                  required
                  value={newBooking.date}
                  onChange={(e) => setNewBooking({ ...newBooking, date: e.target.value })}
                  className="bg-slate-950 border-slate-800"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="booking_time">{language === 'ar' ? 'التوقيت' : 'Time'} *</Label>
                <Input
                  id="booking_time"
                  type="time"
                  required
                  value={newBooking.time}
                  onChange={(e) => setNewBooking({ ...newBooking, time: e.target.value })}
                  className="bg-slate-950 border-slate-800"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{language === 'ar' ? 'الطبيب / الكادر' : 'Doctor / Staff'}</Label>
                <select
                  value={newBooking.staff_id}
                  onChange={(e) => setNewBooking({ ...newBooking, staff_id: e.target.value })}
                  className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-xs text-white"
                >
                  <option value="none">{language === 'ar' ? 'أي طبيب متاح' : 'Any Staff'}</option>
                  {staffList.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>{language === 'ar' ? 'الخدمة المطلوبة' : 'Service'}</Label>
                <select
                  value={newBooking.service_id}
                  onChange={(e) => setNewBooking({ ...newBooking, service_id: e.target.value })}
                  className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-xs text-white"
                >
                  <option value="none">{language === 'ar' ? 'خدمة عامة' : 'General'}</option>
                  {services.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <DialogFooter className="pt-4">
              <Button type="button" variant="ghost" onClick={() => setBookingModalOpen(false)}>
                {language === 'ar' ? 'إلغاء' : 'Cancel'}
              </Button>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-500">
                {language === 'ar' ? 'تأكيد الحجز' : 'Book Appointment'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Staff Create/Edit Dialog */}
      <Dialog open={staffModalOpen} onOpenChange={setStaffModalOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white text-xs">
          <DialogHeader>
            <DialogTitle>{staffForm.id ? (language === 'ar' ? 'تعديل بيانات الكادر' : 'Edit Staff Member') : (language === 'ar' ? 'إضافة طبيب/كادر جديد' : 'Add New Staff')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveStaff} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="staff_name">{language === 'ar' ? 'الاسم الكامل' : 'Full Name'} *</Label>
              <Input
                id="staff_name"
                required
                value={staffForm.name}
                onChange={(e) => setStaffForm({ ...staffForm, name: e.target.value })}
                className="bg-slate-950 border-slate-800"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="staff_email">{language === 'ar' ? 'البريد الإلكتروني' : 'Email'}</Label>
              <Input
                id="staff_email"
                type="email"
                value={staffForm.email}
                onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })}
                className="bg-slate-950 border-slate-800"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="staff_gcal">{language === 'ar' ? 'معرّف تقويم جوجل (اختياري)' : 'Google Calendar ID (Optional)'}</Label>
              <Input
                id="staff_gcal"
                value={staffForm.google_calendar_id}
                onChange={(e) => setStaffForm({ ...staffForm, google_calendar_id: e.target.value })}
                className="bg-slate-950 border-slate-800"
              />
            </div>
            <DialogFooter className="pt-4">
              <Button type="button" variant="ghost" onClick={() => setStaffModalOpen(false)}>
                {language === 'ar' ? 'إلغاء' : 'Cancel'}
              </Button>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-500">
                {language === 'ar' ? 'حفظ الكادر' : 'Save Staff'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Service Create/Edit Dialog */}
      <Dialog open={serviceModalOpen} onOpenChange={setServiceModalOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white text-xs">
          <DialogHeader>
            <DialogTitle>{serviceForm.id ? (language === 'ar' ? 'تعديل الخدمة' : 'Edit Service') : (language === 'ar' ? 'إضافة خدمة جديدة' : 'Add New Service')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveService} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="serv_name">{language === 'ar' ? 'اسم الخدمة' : 'Service Name'} *</Label>
              <Input
                id="serv_name"
                required
                value={serviceForm.name}
                onChange={(e) => setServiceForm({ ...serviceForm, name: e.target.value })}
                className="bg-slate-950 border-slate-800"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="serv_dur">{language === 'ar' ? 'المدة (بالدقائق)' : 'Duration (Minutes)'} *</Label>
                <Input
                  id="serv_dur"
                  type="number"
                  required
                  value={serviceForm.duration_minutes}
                  onChange={(e) => setServiceForm({ ...serviceForm, duration_minutes: Number(e.target.value) })}
                  className="bg-slate-950 border-slate-800"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="serv_price">{language === 'ar' ? 'السعر' : 'Price'}</Label>
                <Input
                  id="serv_price"
                  type="number"
                  value={serviceForm.price}
                  onChange={(e) => setServiceForm({ ...serviceForm, price: e.target.value })}
                  className="bg-slate-950 border-slate-800"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="serv_desc">{language === 'ar' ? 'الوصف' : 'Description'}</Label>
              <Input
                id="serv_desc"
                value={serviceForm.description}
                onChange={(e) => setServiceForm({ ...serviceForm, description: e.target.value })}
                className="bg-slate-950 border-slate-800"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="serv_color">{language === 'ar' ? 'لون التمييز بالتقويم' : 'Calendar Label Color'}</Label>
              <Input
                id="serv_color"
                type="color"
                value={serviceForm.color}
                onChange={(e) => setServiceForm({ ...serviceForm, color: e.target.value })}
                className="bg-slate-950 border-slate-800 h-8 p-1"
              />
            </div>
            <DialogFooter className="pt-4">
              <Button type="button" variant="ghost" onClick={() => setServiceModalOpen(false)}>
                {language === 'ar' ? 'إلغاء' : 'Cancel'}
              </Button>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-500">
                {language === 'ar' ? 'حفظ الخدمة' : 'Save Service'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
