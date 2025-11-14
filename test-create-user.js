/**
 * Temporary script to create a test user with confirmed email
 *
 * This script requires SUPABASE_SERVICE_ROLE_KEY environment variable
 * Get it from: Supabase Dashboard > Settings > API > service_role key
 *
 * Usage:
 * SUPABASE_SERVICE_ROLE_KEY=your_key node test-create-user.js
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://omjwfrhrlhuvvndiipco.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  console.log('\nGet it from: Supabase Dashboard > Settings > API > service_role key');
  console.log('Usage: SUPABASE_SERVICE_ROLE_KEY=your_key node test-create-user.js');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function createTestUser() {
  console.log('🔧 Creating test user...\n');

  const testUser = {
    email: 'jan.kowalski@rentflow.pl',
    password: 'TestPassword123!',
    email_confirm: true, // Auto-confirm email
    user_metadata: {
      full_name: 'Jan Kowalski',
      role: 'owner'
    }
  };

  try {
    const { data, error } = await supabase.auth.admin.createUser(testUser);

    if (error) {
      console.error('❌ Error creating user:', error.message);
      process.exit(1);
    }

    console.log('✅ Test user created successfully!\n');
    console.log('User details:');
    console.log('  ID:', data.user.id);
    console.log('  Email:', data.user.email);
    console.log('  Email confirmed:', data.user.email_confirmed_at ? 'Yes' : 'No');
    console.log('  Full name:', data.user.user_metadata.full_name);
    console.log('  Role:', data.user.user_metadata.role);
    console.log('\nCredentials for testing:');
    console.log('  Email:', testUser.email);
    console.log('  Password:', testUser.password);
    console.log('\n📝 Next steps:');
    console.log('1. Login to get access token:');
    console.log(`   curl -X POST '${supabaseUrl}/auth/v1/token?grant_type=password' \\`);
    console.log(`     -H "apikey: ${supabaseServiceKey.substring(0, 20)}..." \\`);
    console.log(`     -H "Content-Type: application/json" \\`);
    console.log(`     -d '{"email":"${testUser.email}","password":"${testUser.password}"}'`);
    console.log('\n2. Use the access_token from response to test API endpoints');

  } catch (err) {
    console.error('❌ Unexpected error:', err);
    process.exit(1);
  }
}

createTestUser();
