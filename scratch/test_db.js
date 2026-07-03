const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function main() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  
  // Get contacts
  const { data: contacts, error: errC } = await supabase.from('contacts').select('*').limit(10);
  if (errC) {
    console.error('Error fetching contacts:', errC);
    return;
  }
  console.log('Contacts:', JSON.stringify(contacts, null, 2));

  // Get latest messages
  const { data: messages, error: errM } = await supabase.from('messages').select('*').order('created_at', { ascending: false }).limit(5);
  if (errM) {
    console.error('Error fetching messages:', errM);
    return;
  }
  console.log('Latest messages:', JSON.stringify(messages, null, 2));
}

main();
