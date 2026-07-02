const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://fadogxelpjdstacymngd.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhZG9neGVscGpkc3RhY3ltbmdkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjkwOTQ0NywiZXhwIjoyMDk4NDg1NDQ3fQ.SqPc2zcdeC2gt4fphcfjVDjv0UkDTDyDaxMTWMXffbc';

const supabase = createClient(supabaseUrl, supabaseKey);

async function changePassword() {
  const userId = 'e3dd1155-47bf-4484-80f2-0b9fc9339599';
  const newPassword = '123456';
  
  try {
    const { data, error } = await supabase.auth.admin.updateUserById(userId, {
      password: newPassword,
    });

    if (error) {
      console.error('Error changing password:', error);
    } else {
      console.log('Password changed successfully for user support@mita.com!');
      console.log(data);
    }
  } catch (err) {
    console.error(err);
  }
}

changePassword();
