// scripts/seed.js
// Cria os dados iniciais do banco: 1 admin e 1 driver de teste.
// Rode com: npm run seed
// (ou: docker compose run --rm api node /app/scripts/seed.js)
//
// SEGURO rodar mais de uma vez — usa upsert, então não duplica nada.
// Em produção, depois de criar o admin real, você pode ignorar esse script.

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// carrega .env.local se existir (desenvolvimento local)
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env.local') });
config({ path: resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Faltam variáveis de ambiente: VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const SEED_USERS = [
  {
    email: 'admin@levita.local',
    password: 'admin123456',
    role: 'admin',
    name: 'Admin Teste'
  },
  {
    email: 'entregador@levita.local',
    password: 'driver123456',
    role: 'driver',
    name: 'Entregador Teste'
  }
];

async function seed() {
  console.log('🌱 Iniciando seed do banco de dados...\n');

  for (const user of SEED_USERS) {
    console.log(`👤 Processando usuário: ${user.email} (${user.role})`);

    // verifica se já existe
    const { data: existing } = await supabase.auth.admin.listUsers();
    const alreadyExists = existing?.users?.find((u) => u.email === user.email);

    let userId;

    if (alreadyExists) {
      console.log(`   ✓ Usuário já existe (${alreadyExists.id}), pulando criação no Auth`);
      userId = alreadyExists.id;
    } else {
      // cria o usuário no Auth do Supabase
      const { data: created, error: createError } = await supabase.auth.admin.createUser({
        email: user.email,
        password: user.password,
        email_confirm: true // confirma o email automaticamente, sem precisar de verificação
      });

      if (createError) {
        console.error(`   ❌ Erro ao criar usuário no Auth: ${createError.message}`);
        continue;
      }

      userId = created.user.id;
      console.log(`   ✓ Usuário criado no Auth (${userId})`);
    }

    // cria ou atualiza o perfil na tabela profiles
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert(
        { id: userId, role: user.role, name: user.name },
        { onConflict: 'id' }
      );

    if (profileError) {
      console.error(`   ❌ Erro ao criar profile: ${profileError.message}`);
      continue;
    }

    console.log(`   ✓ Profile criado/atualizado (role: ${user.role})`);
  }

  console.log('\n✅ Seed concluído!\n');
  console.log('Credenciais de acesso:');
  console.log('┌─────────────────────────────────────────────┐');
  console.log('│  Admin:      admin@levita.local             │');
  console.log('│  Senha:      admin123456                    │');
  console.log('├─────────────────────────────────────────────┤');
  console.log('│  Entregador: entregador@levita.local        │');
  console.log('│  Senha:      driver123456                   │');
  console.log('└─────────────────────────────────────────────┘');
  console.log('\n⚠️  Mude as senhas acima antes de ir para produção!\n');
}

seed().catch((err) => {
  console.error('Erro inesperado no seed:', err);
  process.exit(1);
});
