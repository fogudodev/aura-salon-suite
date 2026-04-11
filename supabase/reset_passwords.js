const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");

function loadEnv(filePath) {
  if (!filePath) return {};

  const content = fs.readFileSync(filePath, "utf8");
  const env = {};

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
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

function parseArgs(argv) {
  const options = {
    envFile: process.env.SUPABASE_ENV_FILE || "",
    execute: false,
    all: false,
    confirmAll: false,
    password: process.env.NEW_PASSWORD || "",
    emails: [],
    exclude: ["admin@gende.io"],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--env-file") {
      options.envFile = argv[index + 1] || "";
      index += 1;
      continue;
    }

    if (arg === "--password") {
      options.password = argv[index + 1] || "";
      index += 1;
      continue;
    }

    if (arg === "--email") {
      const email = (argv[index + 1] || "").toLowerCase();
      if (email) options.emails.push(email);
      index += 1;
      continue;
    }

    if (arg === "--exclude") {
      const email = (argv[index + 1] || "").toLowerCase();
      if (email) options.exclude.push(email);
      index += 1;
      continue;
    }

    if (arg === "--all") {
      options.all = true;
      continue;
    }

    if (arg === "--confirm-all") {
      options.confirmAll = true;
      continue;
    }

    if (arg === "--execute") {
      options.execute = true;
    }
  }

  return options;
}

function resolveRuntimeConfig(options) {
  const fileEnv = loadEnv(options.envFile);
  const mergedEnv = { ...fileEnv, ...process.env };

  const supabaseUrl =
    mergedEnv.SUPABASE_URL ||
    mergedEnv.SUPABASE_PUBLIC_URL ||
    mergedEnv.API_EXTERNAL_URL;
  const serviceRoleKey =
    mergedEnv.SUPABASE_SERVICE_ROLE_KEY || mergedEnv.SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error(
      "Supabase URL not found. Set SUPABASE_URL or pass --env-file."
    );
  }

  if (!serviceRoleKey) {
    throw new Error(
      "Service role key not found. Set SUPABASE_SERVICE_ROLE_KEY or pass --env-file."
    );
  }

  if (!options.password) {
    throw new Error(
      "New password not provided. Set NEW_PASSWORD or pass --password."
    );
  }

  if (!options.all && options.emails.length === 0) {
    throw new Error(
      "Provide at least one --email target, or use --all --confirm-all."
    );
  }

  if (options.all && !options.confirmAll) {
    throw new Error("Bulk reset requires both --all and --confirm-all.");
  }

  return { supabaseUrl, serviceRoleKey };
}

function shouldResetUser(email, options) {
  if (!email) return false;
  if (options.exclude.includes(email)) return false;
  if (options.all) return true;
  return options.emails.includes(email);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { supabaseUrl, serviceRoleKey } = resolveRuntimeConfig(options);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  let page = 1;
  const perPage = 100;
  let totalMatched = 0;
  let totalUpdated = 0;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) throw error;

    const users = data?.users || [];
    if (users.length === 0) break;

    for (const user of users) {
      const email = (user.email || "").toLowerCase();
      if (!shouldResetUser(email, options)) continue;

      totalMatched += 1;

      if (!options.execute) {
        console.log(`[dry-run] ${email}`);
        continue;
      }

      const { error: updateError } = await supabase.auth.admin.updateUserById(
        user.id,
        { password: options.password }
      );

      if (updateError) {
        console.error(`ERROR ${email} -> ${updateError.message}`);
      } else {
        totalUpdated += 1;
        console.log(`UPDATED ${email}`);
      }
    }

    if (users.length < perPage) break;
    page += 1;
  }

  if (!options.execute) {
    console.log(
      `Dry run complete. Matched users: ${totalMatched}. Re-run with --execute to apply changes.`
    );
    return;
  }

  console.log(`Password reset complete. Updated users: ${totalUpdated}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
