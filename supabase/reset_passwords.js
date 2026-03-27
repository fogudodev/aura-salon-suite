const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

function loadEnv(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }
  return env;
}

async function main() {
  const env = loadEnv('/opt/supabase/docker/.env');

  const supabaseUrl =
    env.SUPABASE_PUBLIC_URL ||
    env.API_EXTERNAL_URL ||
    'https://api.gende.io';

  const serviceRoleKey = env.SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error('SERVICE_ROLE_KEY não encontrada em /opt/supabase/docker/.env');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  let page = 1;
  const perPage = 100;
  let totalUpdated = 0;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw error;
    }

    const users = data?.users || [];

    if (users.length === 0) {
      break;
    }

    for (const user of users) {
      const email = (user.email || '').toLowerCase();

      if (!email || email === 'admin@gende.io') {
        continue;
      }

      const { error: updateError } = await supabase.auth.admin.updateUserById(
        user.id,
        { password: 'Gende@2026#' }
      );

      if (updateError) {
        console.error(`ERRO: ${user.email} -> ${updateError.message}`);
      } else {
        totalUpdated++;
        console.log(`OK: ${user.email}`);
      }
    }

    if (users.length < perPage) {
      break;
    }

    page++;
  }

  console.log(`Concluído. Usuários atualizados: ${totalUpdated}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
