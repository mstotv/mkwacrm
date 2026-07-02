import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Parse .env.local manually
const envPath = path.resolve(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');

const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    const key = match[1];
    let val = match[2] || '';
    // remove surrounding quotes
    if (val.length > 0 && val.charAt(0) === '"' && val.charAt(val.length - 1) === '"') {
      val = val.substring(1, val.length - 1);
    }
    env[key] = val;
  }
});

const supabaseUrl = env['NEXT_PUBLIC_SUPABASE_URL'];
const serviceRoleKey = env['SUPABASE_SERVICE_ROLE_KEY'];

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Error: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not found in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function main() {
  const email = 'support@mita.com';
  const password = '123456789';

  console.log(`Checking if user ${email} already exists...`);
  
  // Try to find the user in auth.users by listing users
  const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) {
    console.error('Error listing users:', listError);
    process.exit(1);
  }

  let user = users.find(u => u.email === email);

  if (user) {
    console.log(`User ${email} already exists. Updating password...`);
    const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
      password: password
    });
    if (updateError) {
      console.error('Error updating user password:', updateError);
      process.exit(1);
    }
  } else {
    console.log(`Creating user ${email}...`);
    const { data: createData, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'Mita Support' }
    });

    if (createError) {
      console.error('Error creating user:', createError);
      process.exit(1);
    }

    user = createData.user;
    console.log(`User created successfully with ID: ${user.id}`);
  }

  // Wait 2 seconds for the database trigger to complete inserting into profiles
  console.log('Waiting for database trigger to create profile...');
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log(`Updating platform_role to 'super_admin' in profiles table for ${email}...`);
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ platform_role: 'super_admin' })
    .eq('user_id', user.id);

  if (profileError) {
    console.error('Error updating profile role:', profileError);
    process.exit(1);
  }

  console.log('--------------------------------------------------');
  console.log('🎉 SUCCESS!');
  console.log(`Email: ${email}`);
  console.log(`Password: ${password}`);
  console.log(`Role: super_admin`);
  console.log('--------------------------------------------------');
  console.log('You can now log in using these credentials.');
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
