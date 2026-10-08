'use strict';
/*
  SINCRONIZACIÓN EN LA NUBE (Supabase) — OPCIONAL, 100% GRATIS
  ──────────────────────────────────────────────────────────────
  Sin esto, la app funciona 100% igual pero SOLO guarda en este dispositivo
  (localStorage). Si querés que tus datos se vean iguales en el celu y en
  la PC, seguí estos pasos (gratis, no pide tarjeta, 5 minutos):

  1. Entrá a https://supabase.com y creá una cuenta (podés usar GitHub).
  2. "New project" → elegí una organización (se crea una gratis sola) →
     ponele un nombre (ej: "nfc-manager") → elegí una contraseña para la
     base de datos (guardala, no la vas a necesitar para esto pero por las
     dudas) → elegí la región más cercana (ej: South America - São Paulo) →
     "Create new project". Esperá 1-2 minutos mientras se crea.
  3. En el menú izquierdo: ícono "SQL Editor" → "New query" → pegá este
     bloque completo y tocá "Run":

     create table if not exists nfc_manager (
       id text primary key,
       businesses jsonb default '[]',
       goals jsonb default '[]',
       providers jsonb default '[]',
       settings jsonb default '{}',
       updated_at bigint
     );

     alter table nfc_manager enable row level security;

     create policy "allow all" on nfc_manager
       for all using (true) with check (true);

     insert into nfc_manager (id, businesses, goals, providers, settings, updated_at)
     values ('shared', '[]', '[]', '[]', '{"cardsBought":20,"totalCost":0}', 0)
     on conflict (id) do nothing;

  4. Menú izquierdo → ícono "Project Settings" (engranaje) → "API" →
     copiá los valores "Project URL" y "anon public" (la clave larga que
     empieza con "eyJ...").
  5. Pegá esos dos valores abajo, reemplazando las comillas vacías.
  6. Guardá este archivo y volvé a abrir la web: a partir de ahí todo se
     sincroniza solo entre todos tus dispositivos (se actualiza cada
     8 segundos aproximadamente).
*/

window.SUPABASE_CONFIG = {
  url: "https://zjunkrwildzxvppuberd.supabase.co",
  anonKey: "sb_publishable_dFginXnIUL9RVTPaPAW4sg_BkmNTIEC"
};

window.CLOUD_SYNC_ENABLED = !!(window.SUPABASE_CONFIG.url && window.SUPABASE_CONFIG.anonKey);
