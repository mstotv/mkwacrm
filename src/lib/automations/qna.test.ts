import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runAutomationsForTrigger, handleQnaSessionResponse } from './engine';
import { engineSendText } from './meta-send';

// State mock data stores
const dbState = {
  automations: [] as any[],
  steps: [] as any[],
  logs: [] as any[],
  qnaSessions: [] as any[],
  contacts: [] as any[],
};

vi.mock("./admin-client", () => {
  return {
    supabaseAdmin: () => {
      const builder = (table: string) => {
        const query: any = {
          select: () => query,
          insert: (payload: any) => {
            const arr = (payload instanceof Array) ? payload : [payload];
            const rows = arr.map(p => ({ id: Math.random().toString(), ...p }));
            rows.forEach(row => {
              if (table === 'automation_qna_sessions') dbState.qnaSessions.push(row);
              else if (table === 'automation_logs') dbState.logs.push(row);
            });
            query.data = (payload instanceof Array) ? rows : rows[0];
            return query;
          },
          update: (payload: any) => {
            query.updatePayload = payload;
            return query;
          },
          delete: () => {
            query.deleteCall = true;
            return query;
          },
          eq: (field: string, val: any) => {
            query.filters = query.filters || [];
            query.filters.push({ field, val });
            return query;
          },
          gte: (field: string, val: any) => {
            query.filters = query.filters || [];
            query.filters.push({ field, val, op: 'gte' });
            return query;
          },
          is: () => query,
          order: () => query,
          maybeSingle: async () => {
            let data: any = null;
            if (table === 'automation_qna_sessions') {
              const pendingFilter = query.filters?.find((f: any) => f.field === 'status' && f.val === 'pending');
              const contactFilter = query.filters?.find((f: any) => f.field === 'contact_id');
              data = dbState.qnaSessions.find(s => 
                (!pendingFilter || s.status === 'pending') && 
                (!contactFilter || s.contact_id === contactFilter.val)
              ) || null;
            } else if (table === 'automations') {
              const idFilter = query.filters?.find((f: any) => f.field === 'id');
              data = dbState.automations.find(a => !idFilter || a.id === idFilter.val) || null;
            } else if (table === 'contacts') {
              const idFilter = query.filters?.find((f: any) => f.field === 'id');
              data = dbState.contacts.find(c => !idFilter || c.id === idFilter.val) || null;
            } else if (table === 'profiles') {
              data = { platform_role: 'member' };
            } else if (table === 'account_subscriptions') {
              data = { status: 'active', plan_id: 'pro-plan-id' };
            } else if (table === 'subscription_plans') {
              data = { id: 'pro-plan-id' };
            } else if (table === 'plan_features_library') {
              data = { id: 'sheet-feat-id' };
            } else if (table === 'plan_feature_assignments') {
              data = { id: 'assign-id' };
            }
            if (query.updatePayload) {
              if (data) {
                Object.assign(data, query.updatePayload);
              }
            }
            if (query.deleteCall) {
              if (data) {
                dbState.qnaSessions = dbState.qnaSessions.filter(s => s.id !== data.id);
              }
            }
            return { data, error: null };
          },
          single: async () => {
            if (query.data) {
              return { data: query.data, error: null };
            }
            let data = null;
            if (table === 'automations') {
              const idFilter = query.filters?.find((f: any) => f.field === 'id');
              data = dbState.automations.find(a => !idFilter || a.id === idFilter.val) || null;
            }
            return { data, error: null };
          },
          then: (onSuccess: any) => {
            let data: any = [];
            if (table === 'automation_qna_sessions') {
              const idFilter = query.filters?.find((f: any) => f.field === 'id');
              const contactFilter = query.filters?.find((f: any) => f.field === 'contact_id');
              if (query.updatePayload) {
                dbState.qnaSessions.forEach(s => {
                  if ((!idFilter || s.id === idFilter.val) && (!contactFilter || s.contact_id === contactFilter.val)) {
                    Object.assign(s, query.updatePayload);
                  }
                });
              }
              if (query.deleteCall) {
                dbState.qnaSessions = dbState.qnaSessions.filter(s => 
                  !((!idFilter || s.id === idFilter.val) && (!contactFilter || s.contact_id === contactFilter.val))
                );
              }
              data = dbState.qnaSessions;
            } else if (table === 'automation_steps') {
              const autoFilter = query.filters?.find((f: any) => f.field === 'automation_id');
              const gteFilter = query.filters?.find((f: any) => f.op === 'gte' && f.field === 'position');
              const steps = dbState.steps.filter(s => !autoFilter || s.automation_id === autoFilter.val);
              data = gteFilter 
                ? steps.filter(s => s.position >= Number(gteFilter.val))
                : steps;
            } else if (table === 'automations') {
              const triggerFilter = query.filters?.find((f: any) => f.field === 'trigger_type');
              data = dbState.automations.filter(a => !triggerFilter || a.trigger_type === triggerFilter.val);
            } else {
              data = query.data || [];
            }
            return Promise.resolve(onSuccess({ data, error: null }));
          }
        };
        return query;
      };

      return {
        from: builder,
        rpc: () => Promise.resolve({ error: null }),
      };
    }
  };
});

vi.mock("./meta-send", () => ({
  engineSendText: vi.fn(async () => ({ whatsapp_message_id: "m1" })),
  engineSendTemplate: vi.fn(async () => ({ whatsapp_message_id: "m1" })),
}));

vi.mock("@/lib/whatsapp/google-sheets", () => ({
  getFreshTokenForAccount: vi.fn(async () => 'mock-token'),
  getGoogleSheetsConfig: vi.fn(async () => ({
    sheets: [{ spreadsheet_id: 'sheet-123', google_account_id: 'g-acc' }]
  })),
}));

describe('Scripted Q&A User Input Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbState.automations = [];
    dbState.steps = [];
    dbState.logs = [];
    dbState.qnaSessions = [];
    dbState.contacts = [
      { id: 'c1', name: 'أحمد', phone: '1234567', account_id: 'acc1' }
    ];
  });

  it('should run Q&A sequence, pause execution, and process sequential answers correctly', async () => {
    // 1) Define an automation with a question sequence step, followed by a google sheet save step
    const automation = {
      id: 'auto-123',
      account_id: 'acc1',
      user_id: 'u1',
      trigger_type: 'new_message_received',
      is_active: true,
    };

    const qnaStep = {
      id: 'step-qna',
      automation_id: 'auto-123',
      step_type: 'question_sequence',
      position: 0,
      step_config: {
        questions: [
          { question_text: 'ما هو المنتج؟', field_name: 'product', expected_type: 'text' },
          { question_text: 'ما المقاس؟', field_name: 'size', expected_type: 'number' },
          { question_text: 'رقم الهاتف للتواصل؟', field_name: 'phone', expected_type: 'text' },
        ]
      }
    };

    const sheetStep = {
      id: 'step-sheet',
      automation_id: 'auto-123',
      step_type: 'save_to_google_sheet',
      position: 1,
      step_config: {
        spreadsheet_id: 'sheet-123',
        sheet_name: 'Sales',
        mappings: [
          { field: 'product', column: 'B' },
          { field: 'size', column: 'C' },
          { field: 'phone', column: 'D' },
        ]
      }
    };

    dbState.automations.push(automation);
    dbState.steps.push(qnaStep, sheetStep);

    // Mock fetch for Google Sheets API appending values
    const fetchSpy = vi.fn().mockImplementation(async () => {
      return {
        ok: true,
        json: async () => ({ values: [['Headers']] })
      };
    });
    global.fetch = fetchSpy;

    vi.useFakeTimers();

    // 2) Trigger the automation for احمد
    await runAutomationsForTrigger({
      accountId: 'acc1',
      triggerType: 'new_message_received',
      contactId: 'c1',
      context: {
        message_text: 'مرحبا',
        conversation_id: 'conv123',
      }
    });

    await vi.runAllTimersAsync();
    vi.useRealTimers();

    // Verify it sent the first question
    expect(engineSendText).toHaveBeenCalledWith(expect.objectContaining({
      text: 'ما هو المنتج؟',
      contactId: 'c1',
    }));

    // Verify it suspended and created an active Q&A session
    expect(dbState.qnaSessions.length).toBe(1);
    expect(dbState.qnaSessions[0].current_question_index).toBe(0);
    expect(dbState.qnaSessions[0].status).toBe('pending');

    // 3) User responds to question 1: "حذاء رياضي"
    let consumed = await handleQnaSessionResponse('acc1', 'c1', 'حذاء رياضي');
    expect(consumed).toBe(true);

    // Verify it sent question 2
    expect(engineSendText).toHaveBeenLastCalledWith(expect.objectContaining({
      text: 'ما المقاس؟',
      contactId: 'c1',
    }));
    expect(dbState.qnaSessions[0].current_question_index).toBe(1);
    expect(dbState.qnaSessions[0].vars.product).toBe('حذاء رياضي');

    // 4) User responds to question 2: "المقاس هو 42"
    consumed = await handleQnaSessionResponse('acc1', 'c1', 'المقاس هو 42');
    expect(consumed).toBe(true);

    // Verify it sent question 3
    expect(engineSendText).toHaveBeenLastCalledWith(expect.objectContaining({
      text: 'رقم الهاتف للتواصل؟',
      contactId: 'c1',
    }));
    expect(dbState.qnaSessions[0].current_question_index).toBe(2);
    expect(dbState.qnaSessions[0].vars.size).toBe('42'); // correctly parsed from expected_type number!

    // 5) User responds to question 3: "0599999" (the final question)
    consumed = await handleQnaSessionResponse('acc1', 'c1', '0599999');
    expect(consumed).toBe(true);

    // Verify that the Q&A session was deleted upon completion
    expect(dbState.qnaSessions.length).toBe(0);

    // Verify it resumed execution and sent data to Google Sheets
    const appendCall = fetchSpy.mock.calls.find(c => c[0].includes(':append'));
    expect(appendCall).toBeDefined();
  });
});
