'use client';

import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import {
  LifeBuoy,
  Plus,
  Send,
  Image as ImageIcon,
  Paperclip,
  Check,
  Clock,
  User,
  Shield,
  Loader2,
  FileText,
} from 'lucide-react';
import { toast } from 'sonner';

interface Ticket {
  id: string;
  subject: string;
  status: string;
  created_at: string;
  updated_at: string;
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

export default function UserSupportPage() {
  const { user, profile, account } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);

  // New ticket form
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [newDetail, setNewDetail] = useState('');
  const [uploading, setUploading] = useState(false);
  const [newAttachments, setNewAttachments] = useState<Array<{ name: string; url: string; type: string }>>([]);

  // Active chat inputs
  const [replyText, setReplyText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const supabase = createClient();

  useEffect(() => {
    if (!account?.id) return;
    loadTickets();
  }, [account?.id]);

  useEffect(() => {
    if (!selectedTicket) return;
    loadMessages(selectedTicket.id);
    // Subscribe to new messages for this ticket
    const channel = supabase
      .channel(`support_messages:${selectedTicket.id}`)
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

  async function loadTickets() {
    try {
      setLoadingTickets(true);
      const { data, error } = await supabase
        .from('support_tickets')
        .select('*')
        .eq('account_id', account?.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTickets(data || []);
    } catch (err: any) {
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
    } catch (err: any) {
      toast.error('خطأ في تحميل الرسائل');
    } finally {
      setLoadingMessages(false);
    }
  }

  // Handle attachment upload to Supabase Storage
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    if (!user?.id) return;

    setUploading(true);
    const uploadedList = [...newAttachments];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const path = `${user.id}/${Date.now()}-${file.name}`;
        
        const { data, error } = await supabase.storage
          .from('support')
          .upload(path, file);

        if (error) throw error;

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('support')
          .getPublicUrl(data.path);

        uploadedList.push({
          name: file.name,
          url: publicUrl,
          type: file.type,
        });
      }
      setNewAttachments(uploadedList);
      toast.success('تم رفع الملف بنجاح');
    } catch (err: any) {
      toast.error('فشل رفع الملف: ' + err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubject.trim() || !newDetail.trim() || !account?.id || !user?.id) {
      toast.error('الرجاء تعبئة جميع الحقول المطلوبة');
      return;
    }

    try {
      setSending(true);

      // 1. Create Ticket
      const { data: ticket, error: ticketError } = await supabase
        .from('support_tickets')
        .insert({
          account_id: account.id,
          user_id: user.id,
          subject: newSubject.trim(),
          status: 'open',
        })
        .select()
        .single();

      if (ticketError) throw ticketError;

      // 2. Insert First Message
      const { error: msgError } = await supabase
        .from('support_messages')
        .insert({
          ticket_id: ticket.id,
          sender_id: user.id,
          sender_name: profile?.full_name || user.email || 'مستخدم',
          sender_role: 'user',
          message_text: newDetail.trim(),
          attachments: newAttachments,
        });

      if (msgError) throw msgError;

      toast.success('تم فتح تذكرة الدعم الفني بنجاح');
      setShowCreateModal(false);
      setNewSubject('');
      setNewDetail('');
      setNewAttachments([]);
      loadTickets();
      setSelectedTicket(ticket);
    } catch (err: any) {
      toast.error('حدث خطأ أثناء فتح التذكرة');
      console.error(err);
    } finally {
      setSending(false);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!replyText.trim() && newAttachments.length === 0) || !selectedTicket || !user?.id) return;

    try {
      setSending(true);
      const { error } = await supabase
        .from('support_messages')
        .insert({
          ticket_id: selectedTicket.id,
          sender_id: user.id,
          sender_name: profile?.full_name || user.email || 'مستخدم',
          sender_role: 'user',
          message_text: replyText.trim() || null,
          attachments: newAttachments,
        });

      if (error) throw error;

      // Update ticket updated_at
      await supabase
        .from('support_tickets')
        .update({ updated_at: new Date().toISOString(), status: 'open' })
        .eq('id', selectedTicket.id);

      setReplyText('');
      setNewAttachments([]);
    } catch (err: any) {
      toast.error('فشل إرسال الرسالة');
    } finally {
      setSending(false);
    }
  };

  const removeAttachment = (index: number) => {
    setNewAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="flex h-[calc(100vh-6rem)] gap-6 overflow-hidden text-white">
      {/* Tickets List */}
      <div className="w-80 flex flex-col rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden shrink-0">
        <div className="flex items-center justify-between border-b border-slate-800 p-4">
          <h2 className="font-bold flex items-center gap-2 text-sm md:text-base">
            <LifeBuoy className="h-4.5 w-4.5 text-violet-400" />
            التذاكر والدعم الفني
          </h2>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center justify-center rounded-lg bg-violet-600 hover:bg-violet-500 p-1.5 text-white transition"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-850">
          {loadingTickets ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
            </div>
          ) : tickets.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-xs">
              لا توجد تذاكر دعم فني مفتوحة
            </div>
          ) : (
            tickets.map((t) => (
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
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium border uppercase ${
                      t.status === 'open'
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        : t.status === 'pending'
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          : 'bg-slate-850 text-slate-400 border-slate-800'
                    }`}
                  >
                    {t.status === 'open' ? 'مفتوحة' : t.status === 'pending' ? 'جاري الحل' : 'محلولة'}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 mt-2">
                  آخر تحديث: {new Date(t.updated_at).toLocaleString('ar-IQ')}
                </p>
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
              <div>
                <h3 className="font-bold text-base">{selectedTicket.subject}</h3>
                <p className="text-xs text-slate-500 mt-1">تذكرة ID: {selectedTicket.id}</p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold border ${
                    selectedTicket.status === 'open'
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : selectedTicket.status === 'pending'
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  {selectedTicket.status === 'open' ? 'مفتوحة' : selectedTicket.status === 'pending' ? 'انتظار الأدمن' : 'محلولة / مغلقة'}
                </span>
              </div>
            </div>

            {/* Messages body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-950/20">
              {loadingMessages ? (
                <div className="flex items-center justify-center py-24">
                  <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
                </div>
              ) : (
                messages.map((m) => {
                  const isMe = m.sender_id === user?.id;
                  return (
                    <div
                      key={m.id}
                      className={`flex ${isMe ? 'justify-start' : 'justify-end'} items-start gap-2.5`}
                    >
                      {isMe ? (
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
                          {!isMe && (
                            <span className="rounded bg-emerald-500/10 border border-emerald-500/20 px-1 py-0.2 text-[8px] font-semibold text-emerald-400">
                              {m.sender_role === 'admin' ? 'مدير المنصة' : 'مساعد الإدارة'}
                            </span>
                          )}
                        </div>

                        <div
                          className={`rounded-2xl px-4 py-2.5 text-sm ${
                            isMe
                              ? 'bg-violet-600 text-white rounded-tr-none'
                              : 'bg-slate-800 text-slate-100 rounded-tl-none'
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
                                        Your browser does not support the video tag.
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

            {/* Chat Reply Form */}
            {selectedTicket.status !== 'resolved' ? (
              <form onSubmit={handleSendReply} className="border-t border-slate-800 bg-slate-900 p-4">
                {newAttachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {newAttachments.map((file, idx) => (
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
                    placeholder="اكتب رسالتك للدعم الفني هنا..."
                    className="flex-1 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-violet-500 focus:outline-none"
                  />

                  <button
                    type="submit"
                    disabled={sending || (!replyText.trim() && newAttachments.length === 0)}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-650 text-white hover:bg-violet-600 disabled:bg-slate-800 disabled:text-slate-500 transition"
                  >
                    <Send className="h-4.5 w-4.5" />
                  </button>
                </div>
              </form>
            ) : (
              <div className="bg-slate-950/40 p-4 text-center text-xs text-slate-500 border-t border-slate-850">
                هذه التذكرة مغلقة ومحلولة. إذا كان لديك استفسار آخر يرجى فتح تذكرة جديدة.
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <LifeBuoy className="h-16 w-16 text-slate-700 animate-pulse mb-4" />
            <h3 className="text-lg font-bold text-slate-350">الردود والدعم الفني المباشر</h3>
            <p className="text-sm text-slate-500 max-w-sm mt-1">
              اختر إحدى التذاكر من القائمة الجانبية لعرض المحادثة مع الدعم الفني، أو اضغط على (+) لفتح تذكرة جديدة.
            </p>
          </div>
        )}
      </div>

      {/* CREATE TICKET MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-lg font-bold mb-4">فتح تذكرة دعم فني جديدة</h3>
            
            <form onSubmit={handleCreateTicket} className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">عنوان المشكلة / الموضوع</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: مشكلة في تفعيل خطة الاشتراك"
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  className="w-full rounded-xl border border-slate-750 bg-slate-800 px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1.5">شرح وتفاصيل المشكلة</label>
                <textarea
                  required
                  rows={4}
                  placeholder="يرجى كتابة تفاصيل المشكلة بدقة لكي نتمكن من مساعدتك سريعاً..."
                  value={newDetail}
                  onChange={(e) => setNewDetail(e.target.value)}
                  className="w-full rounded-xl border border-slate-750 bg-slate-800 px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none resize-none"
                />
              </div>

              {/* Attachments Section in Modal */}
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">مرفقات اختيارية (صور، فيديو، PDF)</label>
                
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-350 cursor-pointer hover:bg-slate-750 transition">
                    {uploading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Paperclip className="h-3.5 w-3.5" />
                    )}
                    رفع المرفقات
                    <input
                      type="file"
                      multiple
                      accept="image/*,video/*,application/pdf"
                      onChange={handleUpload}
                      disabled={uploading}
                      className="hidden"
                    />
                  </label>

                  {uploading && <span className="text-[10px] text-violet-400">جاري رفع الملفات...</span>}
                </div>

                {newAttachments.length > 0 && (
                  <div className="mt-3 space-y-1">
                    {newAttachments.map((file, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-2 rounded-lg bg-slate-950/40 px-3 py-1.5 text-xs text-slate-350">
                        <span className="line-clamp-1">{file.name}</span>
                        <button
                          type="button"
                          onClick={() => removeAttachment(idx)}
                          className="text-red-500 hover:text-red-400 font-bold"
                        >
                          حذف
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setNewAttachments([]);
                  }}
                  className="rounded-lg bg-slate-800 hover:bg-slate-750 px-4 py-2 text-sm text-slate-300 transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={sending || uploading}
                  className="flex items-center gap-1.5 rounded-lg bg-violet-650 hover:bg-violet-600 px-5 py-2 text-sm font-semibold text-white shadow-lg disabled:bg-slate-800 disabled:text-slate-500 transition"
                >
                  {sending ? 'جاري الإرسال...' : 'فتح التذكرة الآن'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
