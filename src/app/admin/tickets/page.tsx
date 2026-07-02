'use client';

import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import {
  LifeBuoy,
  Send,
  Image as ImageIcon,
  Paperclip,
  CheckCircle,
  Clock,
  User,
  Shield,
  Loader2,
  FileText,
  UserCheck,
} from 'lucide-react';
import { toast } from 'sonner';

interface Ticket {
  id: string;
  account_id: string;
  user_id: string;
  subject: string;
  status: string;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  account_name?: string;
  user_email?: string;
}

interface Message {
  id: string;
  sender_id: string;
  sender_name: string;
  sender_role: string;
  message_text: string | null;
  attachments: Array<{ name: string; url: string; type: string }>;
  created_at: string;
}

interface Assistant {
  user_id: string;
  full_name: string | null;
  email: string;
}

export default function AdminTicketsPage() {
  const { user, profile } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  
  // Chat inputs
  const [replyText, setReplyText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [attachments, setAttachments] = useState<Array<{ name: string; url: string; type: string }>>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const supabase = createClient();

  useEffect(() => {
    loadTickets();
    loadAssistants();
  }, []);

  useEffect(() => {
    if (!selectedTicket) return;
    loadMessages(selectedTicket.id);

    // Subscribe to new messages
    const channel = supabase
      .channel(`admin_support_messages:${selectedTicket.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'support_messages',
          filter: `ticket_id=eq.${selectedTicket.id}`,
        },
        (payload) => {
          setMessages((prev) => {
            if (prev.some((m) => m.id === payload.new.id)) return prev;
            return [...prev, payload.new as Message];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedTicket?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function loadAssistants() {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, full_name, email')
        .eq('platform_role', 'assistant_admin');

      if (error) throw error;
      setAssistants((data as Assistant[]) || []);
    } catch (err) {
      console.error('Error loading assistants:', err);
    }
  }

  async function loadTickets() {
    try {
      setLoadingTickets(true);
      // Join profiles and accounts to get user email and account name
      const { data, error } = await supabase
        .from('support_tickets')
        .select(`
          *,
          account:accounts(name),
          profile:profiles!inner(email)
        `)
        .order('updated_at', { ascending: false });

      if (error) throw error;

      const mapped: Ticket[] = (data || []).map((t: any) => ({
        ...t,
        account_name: t.account?.name || 'غير محدد',
        user_email: t.profile?.email || 'غير معروف',
      }));

      setTickets(mapped);
    } catch (err) {
      toast.error('حدث خطأ في تحميل التذاكر');
      console.error(err);
    } finally {
      setLoadingTickets(false);
    }
  }

  async function loadMessages(ticketId: string) {
    try {
      setLoadingMessages(true);
      const { data, error } = await supabase
        .from('support_messages')
        .select('*')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data || []);
    } catch (err) {
      toast.error('خطأ في تحميل الرسائل');
    } finally {
      setLoadingMessages(false);
    }
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    if (!user?.id) return;

    setUploading(true);
    const uploadedList = [...attachments];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const path = `admin-${user.id}/${Date.now()}-${file.name}`;
        
        const { data, error } = await supabase.storage
          .from('support')
          .upload(path, file);

        if (error) throw error;

        const { data: { publicUrl } } = supabase.storage
          .from('support')
          .getPublicUrl(data.path);

        uploadedList.push({
          name: file.name,
          url: publicUrl,
          type: file.type,
        });
      }
      setAttachments(uploadedList);
      toast.success('تم رفع المرفق بنجاح');
    } catch (err: any) {
      toast.error('فشل الرفع: ' + err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!replyText.trim() && attachments.length === 0) || !selectedTicket || !user?.id) return;

    try {
      setSending(true);
      const senderRole = profile?.platform_role === 'super_admin' ? 'admin' : 'assistant';
      
      const { error } = await supabase
        .from('support_messages')
        .insert({
          ticket_id: selectedTicket.id,
          sender_id: user.id,
          sender_name: profile?.full_name || profile?.email || 'الدعم الفني',
          sender_role: senderRole,
          message_text: replyText.trim() || null,
          attachments: attachments,
        });

      if (error) throw error;

      // Update status to pending (waiting on customer reply) or keep open
      await supabase
        .from('support_tickets')
        .update({ status: 'pending', updated_at: new Date().toISOString() })
        .eq('id', selectedTicket.id);

      // Locally update ticket status
      setTickets(prev => prev.map(t => t.id === selectedTicket.id ? { ...t, status: 'pending', updated_at: new Date().toISOString() } : t));
      setSelectedTicket(prev => prev ? { ...prev, status: 'pending' } : null);

      setReplyText('');
      setAttachments([]);
    } catch (err: any) {
      toast.error('فشل إرسال الرد');
    } finally {
      setSending(false);
    }
  };

  const assignTicket = async (assistantId: string | null) => {
    if (!selectedTicket) return;
    try {
      const { error } = await supabase
        .from('support_tickets')
        .update({ assigned_to: assistantId || null, updated_at: new Date().toISOString() })
        .eq('id', selectedTicket.id);

      if (error) throw error;

      setTickets(prev => prev.map(t => t.id === selectedTicket.id ? { ...t, assigned_to: assistantId } : t));
      setSelectedTicket(prev => prev ? { ...prev, assigned_to: assistantId } : null);
      toast.success('تم تعيين التذكرة بنجاح');
    } catch (err) {
      toast.error('خطأ في تعيين التذكرة');
    }
  };

  const resolveTicket = async () => {
    if (!selectedTicket) return;
    try {
      const { error } = await supabase
        .from('support_tickets')
        .update({ status: 'resolved', updated_at: new Date().toISOString() })
        .eq('id', selectedTicket.id);

      if (error) throw error;

      setTickets(prev => prev.map(t => t.id === selectedTicket.id ? { ...t, status: 'resolved' } : t));
      setSelectedTicket(prev => prev ? { ...prev, status: 'resolved' } : null);
      toast.success('تم إغلاق وتعيين التذكرة كمحلولة');
    } catch (err) {
      toast.error('خطأ في إنهاء التذكرة');
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const filteredTickets = tickets.filter(t => {
    if (filterStatus === 'all') return true;
    return t.status === filterStatus;
  });

  return (
    <div className="p-8 h-[calc(100vh-2rem)] overflow-hidden flex flex-col gap-6 text-white">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">تذاكر الدعم الفني للمنصة</h1>
        <p className="mt-1 text-sm text-slate-400">إدارة وحل استفسارات ومشاكل العملاء والمستخدمين</p>
      </div>

      <div className="flex-1 flex gap-6 overflow-hidden">
        {/* Ticket list sidebar */}
        <div className="w-80 flex flex-col rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden shrink-0">
          <div className="p-4 border-b border-slate-800">
            <label className="block text-xs text-slate-400 mb-1.5 font-medium">تصفية حسب الحالة</label>
            <div className="grid grid-cols-4 gap-1.5">
              {['all', 'open', 'pending', 'resolved'].map((st) => (
                <button
                  key={st}
                  onClick={() => setFilterStatus(st)}
                  className={`rounded-lg py-1 px-1 text-[10px] font-semibold text-center transition ${
                    filterStatus === st ? 'bg-violet-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {st === 'all' ? 'الكل' : st === 'open' ? 'مفتوح' : st === 'pending' ? 'انتظار' : 'محلول'}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-850">
            {loadingTickets ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
              </div>
            ) : filteredTickets.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-xs">لا توجد تذاكر متطابقة</div>
            ) : (
              filteredTickets.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedTicket(t)}
                  className={`w-full text-right p-4 transition-all duration-150 block hover:bg-slate-800/40 ${
                    selectedTicket?.id === t.id ? 'bg-violet-950/20 border-r-2 border-violet-500' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-sm line-clamp-1 flex-1">{t.subject}</p>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-medium border uppercase ${
                        t.status === 'open'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : t.status === 'pending'
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                            : 'bg-slate-850 text-slate-400 border-slate-800'
                      }`}
                    >
                      {t.status === 'open' ? 'مفتوح' : t.status === 'pending' ? 'انتظار' : 'محلول'}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-2 font-medium">الشركة: {t.account_name}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-1">{t.user_email}</p>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Ticket Chat Room */}
        <div className="flex-1 flex flex-col rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
          {selectedTicket ? (
            <>
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/60 p-4">
                <div className="flex-1">
                  <h3 className="font-bold text-base">{selectedTicket.subject}</h3>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-[11px] text-slate-400">
                    <span>المستخدم: {selectedTicket.user_email}</span>
                    <span>الشركة: {selectedTicket.account_name}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {/* Assign to Assistant */}
                  {profile?.platform_role === 'super_admin' && (
                    <div className="flex items-center gap-1 text-xs">
                      <UserCheck className="h-3.5 w-3.5 text-slate-400" />
                      <select
                        value={selectedTicket.assigned_to || ''}
                        onChange={(e) => assignTicket(e.target.value || null)}
                        className="rounded-lg border border-slate-700 bg-slate-800 py-1 px-2.5 text-xs text-white focus:border-violet-500 focus:outline-none"
                      >
                        <option value="">غير معين (عام)</option>
                        {assistants.map((ast) => (
                          <option key={ast.user_id} value={ast.user_id}>
                            {ast.full_name || ast.email}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {selectedTicket.status !== 'resolved' && (
                    <button
                      onClick={resolveTicket}
                      className="flex items-center gap-1.5 rounded-lg bg-emerald-650 hover:bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-lg transition"
                    >
                      <CheckCircle className="h-3.5 w-3.5" />
                      تعليم كمحلول
                    </button>
                  )}
                </div>
              </div>

              {/* Messages Body */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-950/20">
                {loadingMessages ? (
                  <div className="flex items-center justify-center py-24">
                    <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
                  </div>
                ) : (
                  messages.map((m) => {
                    const isMe = m.sender_id === user?.id;
                    const isCustomer = m.sender_role === 'user';
                    return (
                      <div
                        key={m.id}
                        className={`flex ${isCustomer ? 'justify-start' : 'justify-end'} items-start gap-2.5`}
                      >
                        {isCustomer ? (
                          <div className="flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-lg bg-violet-600/20 text-violet-400 border border-violet-600/30">
                            <User size={16} />
                          </div>
                        ) : (
                          <div className="flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-lg bg-emerald-600/20 text-emerald-400 border border-emerald-600/30">
                            <Shield size={16} />
                          </div>
                        )}

                        <div className="flex flex-col gap-1 max-w-[70%]">
                          <div className="flex items-center gap-2 px-1">
                            <span className="text-xs font-bold text-slate-300">{m.sender_name}</span>
                            <span className="text-[9px] text-slate-500">
                              {new Date(m.created_at).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {!isCustomer && (
                              <span className="rounded bg-emerald-500/10 border border-emerald-500/20 px-1 py-0.2 text-[8px] font-semibold text-emerald-400">
                                {m.sender_role === 'admin' ? 'مدير المنصة' : 'مساعد الإدارة'}
                              </span>
                            )}
                          </div>

                          <div
                            className={`rounded-2xl px-4 py-2.5 text-sm ${
                              isCustomer
                                ? 'bg-slate-800 text-slate-100 rounded-tl-none'
                                : 'bg-violet-650 text-white rounded-tr-none'
                            }`}
                          >
                            {m.message_text && <p className="whitespace-pre-line leading-relaxed">{m.message_text}</p>}

                            {/* Render Attachments */}
                            {m.attachments && m.attachments.length > 0 && (
                              <div className="mt-2 space-y-2">
                                {m.attachments.map((file, idx) => {
                                  const isImage = file.type.startsWith('image/');
                                  const isVideo = file.type.startsWith('video/');
                                  
                                  return (
                                    <div key={idx} className="rounded-lg overflow-hidden border border-slate-700 bg-slate-900/60 p-1">
                                      {isImage ? (
                                        <a href={file.url} target="_blank" rel="noreferrer">
                                          <img src={file.url} alt={file.name} className="max-w-full max-h-48 rounded object-cover" />
                                        </a>
                                      ) : isVideo ? (
                                        <video controls className="max-w-full max-h-48 rounded">
                                          <source src={file.url} type={file.type} />
                                          Your browser does not support HTML5 video.
                                        </video>
                                      ) : (
                                        <a
                                          href={file.url}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="flex items-center gap-2 p-2 text-xs text-violet-300 hover:text-white"
                                        >
                                          <FileText className="h-4 w-4" />
                                          <span className="underline line-clamp-1">{file.name}</span>
                                        </a>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Chat Input form */}
              {selectedTicket.status !== 'resolved' ? (
                <form onSubmit={handleSendReply} className="border-t border-slate-800 bg-slate-900 p-4">
                  {attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {attachments.map((file, idx) => (
                        <div key={idx} className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-850 px-2.5 py-1 text-xs">
                          <Paperclip className="h-3.5 w-3.5 text-slate-400" />
                          <span className="max-w-32 line-clamp-1 text-slate-300">{file.name}</span>
                          <button
                            type="button"
                            onClick={() => removeAttachment(idx)}
                            className="text-red-400 hover:text-red-300 font-bold ml-1"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2 items-center">
                    <label className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-slate-750 bg-slate-800 text-slate-400 hover:bg-slate-750 hover:text-white transition">
                      {uploading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ImageIcon className="h-4 w-4" />
                      )}
                      <input
                        type="file"
                        multiple
                        accept="image/*,video/*,application/pdf"
                        onChange={handleUpload}
                        disabled={uploading}
                        className="hidden"
                      />
                    </label>

                    <input
                      type="text"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="اكتب ردك للدعم الفني..."
                      className="flex-1 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-violet-500 focus:outline-none"
                    />

                    <button
                      type="submit"
                      disabled={sending || (!replyText.trim() && attachments.length === 0)}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-650 text-white hover:bg-violet-600 disabled:bg-slate-800 disabled:text-slate-500 transition"
                    >
                      <Send className="h-4.5 w-4.5" />
                    </button>
                  </div>
                </form>
              ) : (
                <div className="bg-slate-950/40 p-4 text-center text-xs text-slate-500 border-t border-slate-850">
                  تم حل وإغلاق هذه التذكرة.
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <LifeBuoy className="h-16 w-16 text-slate-700 animate-pulse mb-4" />
              <h3 className="text-lg font-bold text-slate-350">محادثات الدعم الفني</h3>
              <p className="text-sm text-slate-500 max-w-sm mt-1">
                اختر تذكرة من القائمة الجانبية لبدء المحادثة مع العميل وحل مشكلته.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
