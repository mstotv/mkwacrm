'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Plus, Save, Trash, Pencil, GripVertical, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAdminLanguage } from '@/contexts/admin-language-provider';

interface Feature {
  id: string;
  name_ar: string;
  name_en: string;
  feature_key: string | null;
  description: string | null;
  sort_order: number;
}

const localDict = {
  ar: {
    title: 'مكتبة المزايا العامة',
    desc: 'إدارة جميع مزايا النظام وتعيينها لخطط الاشتراكات.',
    addFeature: 'إضافة ميزة',
    featureNameEn: 'اسم الميزة (إنجليزي)',
    featureNameAr: 'اسم الميزة (عربي)',
    featureKey: 'المفتاح البرمجي (Key)',
    actions: 'إجراءات',
    loading: 'جاري تحميل المزايا...',
    noFeatures: 'لم يتم العثور على مزايا. قم بإنشاء أول ميزة.',
    editFeature: 'تعديل الميزة',
    createNew: 'إنشاء ميزة جديدة',
    descLabel: 'الوصف الداخلي (اختياري)',
    save: 'حفظ التغييرات',
    saving: 'جاري الحفظ...',
    cancel: 'إلغاء',
    toastNameReq: 'يجب إدخال الاسم باللغتين العربية والإنجليزية',
    toastUpdate: 'تم تحديث الميزة بنجاح',
    toastAdd: 'تمت إضافة الميزة بنجاح',
    confirmDel: 'هل أنت متأكد من حذف هذه الميزة؟ ستتم إزالتها من جميع الخطط.',
    toastDel: 'تم حذف الميزة',
    toastOrderErr: 'فشل حفظ الترتيب: ',
    toastLoadErr: 'فشل تحميل المزايا: ',
  },
  en: {
    title: 'Global Feature Library',
    desc: 'Manage all system features to assign them to subscription packages.',
    addFeature: 'Add Feature',
    featureNameEn: 'Feature Name (En)',
    featureNameAr: 'Feature Name (Ar)',
    featureKey: 'Feature Key',
    actions: 'Actions',
    loading: 'Loading features...',
    noFeatures: 'No features found. Create your first feature.',
    editFeature: 'Edit Feature',
    createNew: 'Create New Feature',
    descLabel: 'Internal Description (Optional)',
    save: 'Save Changes',
    saving: 'Saving...',
    cancel: 'Cancel',
    toastNameReq: 'Both Arabic and English names are required',
    toastUpdate: 'Feature updated successfully',
    toastAdd: 'Feature added successfully',
    confirmDel: 'Are you sure you want to delete this feature? It will be removed from all packages.',
    toastDel: 'Feature deleted',
    toastOrderErr: 'Failed to save order: ',
    toastLoadErr: 'Failed to load features: ',
  }
};

export default function AdminFeaturesPage() {
  const { lang, dir } = useAdminLanguage();
  const t = localDict[lang];

  const [features, setFeatures] = useState<Feature[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [editingFeature, setEditingFeature] = useState<Feature | null>(null);
  
  // Form states
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [featureKey, setFeatureKey] = useState('');
  const [description, setDescription] = useState('');

  // Drag and drop
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);

  const supabase = createClient();

  useEffect(() => {
    loadFeatures();
  }, []);

  async function loadFeatures() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('plan_features_library')
        .select('*')
        .order('sort_order', { ascending: true });

      if (error) throw error;
      setFeatures(data || []);
    } catch (err: any) {
      toast.error(t.toastLoadErr + err.message);
    } finally {
      setLoading(false);
    }
  }

  const openModal = (feat?: Feature) => {
    if (feat) {
      setEditingFeature(feat);
      setNameAr(feat.name_ar);
      setNameEn(feat.name_en);
      setFeatureKey(feat.feature_key || '');
      setDescription(feat.description || '');
    } else {
      setEditingFeature(null);
      setNameAr('');
      setNameEn('');
      setFeatureKey('');
      setDescription('');
    }
    setShowModal(true);
  };

  const saveFeature = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameAr.trim() || !nameEn.trim()) {
      toast.error(t.toastNameReq);
      return;
    }

    try {
      setSaving(true);
      const payload = {
        name_ar: nameAr.trim(),
        name_en: nameEn.trim(),
        feature_key: featureKey.trim() || null,
        description: description.trim() || null,
      };

      if (editingFeature) {
        const { error } = await supabase
          .from('plan_features_library')
          .update(payload)
          .eq('id', editingFeature.id);
        if (error) throw error;
        toast.success(t.toastUpdate);
      } else {
        const { error } = await supabase
          .from('plan_features_library')
          .insert({
            ...payload,
            sort_order: features.length,
          });
        if (error) throw error;
        toast.success(t.toastAdd);
      }
      
      setShowModal(false);
      loadFeatures();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteFeature = async (id: string) => {
    if (!confirm(t.confirmDel)) return;
    try {
      const { error } = await supabase
        .from('plan_features_library')
        .delete()
        .eq('id', id);
      if (error) throw error;
      toast.success(t.toastDel);
      setFeatures(features.filter(f => f.id !== id));
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // Reorder logic
  function handleDragStart(idx: number) {
    setDraggedIdx(idx);
  }
  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
  }
  async function handleDrop(e: React.DragEvent, idx: number) {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === idx) return;
    
    const newFeatures = [...features];
    const item = newFeatures.splice(draggedIdx, 1)[0];
    newFeatures.splice(idx, 0, item);
    
    // Optimistic update
    setFeatures(newFeatures);
    setDraggedIdx(null);

    // Save sort order
    try {
      const updates = newFeatures.map((f, index) => ({
        id: f.id,
        name_ar: f.name_ar,
        name_en: f.name_en,
        sort_order: index,
      }));
      const { error } = await supabase.from('plan_features_library').upsert(updates);
      if (error) throw error;
    } catch (err: any) {
      toast.error(t.toastOrderErr + err.message);
      loadFeatures(); // Revert
    }
  }

  return (
    <div className="p-6" dir={dir}>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">{t.title}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{t.desc}</p>
        </div>
        <button
          onClick={() => openModal()}
          className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
        >
          <Plus className="h-4 w-4" /> {t.addFeature}
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-left text-sm text-slate-700 dark:text-slate-300">
          <thead className="bg-slate-50 dark:bg-slate-950/40 text-xs font-semibold text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
            <tr>
              <th className="px-4 py-3 w-10"></th>
              <th className={`px-4 py-3 ${dir === 'rtl' ? 'text-right' : 'text-left'}`}>{t.featureNameEn}</th>
              <th className={`px-4 py-3 ${dir === 'rtl' ? 'text-right' : 'text-left'}`}>{t.featureNameAr}</th>
              <th className={`px-4 py-3 ${dir === 'rtl' ? 'text-right' : 'text-left'}`}>{t.featureKey}</th>
              <th className={`px-4 py-3 ${dir === 'rtl' ? 'text-left' : 'text-right'}`}>{t.actions}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">{t.loading}</td></tr>
            ) : features.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">{t.noFeatures}</td></tr>
            ) : (
              features.map((feat, idx) => (
                <tr 
                  key={feat.id}
                  draggable 
                  onDragStart={() => handleDragStart(idx)} 
                  onDragOver={(e) => handleDragOver(e, idx)} 
                  onDrop={(e) => handleDrop(e, idx)} 
                  className={`group hover:bg-slate-50 dark:hover:bg-slate-800/40 transition ${draggedIdx === idx ? 'opacity-50' : ''}`}
                >
                  <td className="px-4 py-3 cursor-grab text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300">
                    <GripVertical className="h-4 w-4" />
                  </td>
                  <td className={`px-4 py-3 font-medium text-slate-900 dark:text-white ${dir === 'rtl' ? 'text-right' : 'text-left'}`}>{feat.name_en}</td>
                  <td className={`px-4 py-3 ${dir === 'rtl' ? 'text-right' : 'text-left'}`}>{feat.name_ar}</td>
                  <td className={`px-4 py-3 ${dir === 'rtl' ? 'text-right' : 'text-left'}`}>
                    {feat.feature_key ? (
                      <span className="bg-slate-100 dark:bg-slate-800 text-violet-600 dark:text-violet-300 font-mono text-[10px] px-2 py-1 rounded">
                        {feat.feature_key}
                      </span>
                    ) : (
                      <span className="text-slate-400 dark:text-slate-500 text-xs">-</span>
                    )}
                  </td>
                  <td className={`px-4 py-3 ${dir === 'rtl' ? 'text-left' : 'text-right'}`}>
                    <div className={`flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity ${dir === 'rtl' ? 'justify-start' : 'justify-end'}`}>
                      <button onClick={() => openModal(feat)} className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800/50 hover:bg-slate-200 dark:hover:bg-slate-800 rounded">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => deleteFeature(feat.id)} className="p-1.5 text-red-500 dark:text-red-400 hover:text-white bg-red-100 dark:bg-red-500/10 hover:bg-red-600 dark:hover:bg-red-500 rounded">
                        <Trash className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                {editingFeature ? t.editFeature : t.createNew}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <form onSubmit={saveFeature} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">{t.featureNameAr}</label>
                <input
                  type="text"
                  required
                  value={nameAr}
                  onChange={(e) => setNameAr(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-violet-500 focus:outline-none"
                  placeholder="مثال: رسائل الترحيب"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">{t.featureNameEn}</label>
                <input
                  type="text"
                  required
                  value={nameEn}
                  onChange={(e) => setNameEn(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-violet-500 focus:outline-none"
                  placeholder="e.g. Welcome Messages"
                  dir="ltr"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">{t.featureKey}</label>
                <input
                  type="text"
                  value={featureKey}
                  onChange={(e) => setFeatureKey(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-violet-500 focus:outline-none font-mono"
                  placeholder="e.g. welcome_messages"
                  dir="ltr"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">{t.descLabel}</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-violet-500 focus:outline-none min-h-[80px]"
                  placeholder="..."
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-200 dark:border-slate-800 mt-6">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 transition"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 px-5 py-2 text-sm font-semibold text-white shadow-lg transition disabled:bg-slate-300 dark:disabled:bg-slate-800 disabled:text-slate-500"
                >
                  {saving ? (
                    t.saving
                  ) : (
                    <>
                      <Save className="h-4 w-4" /> {t.save}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
