-- Espace client B2B : base de données Supabase.
-- À coller une seule fois dans Supabase > SQL Editor > New query, puis « Run ».
-- Le script peut être relancé sans risque : il ne supprime aucune donnée.

-- ===== Administrateurs : les e-mails qui peuvent valider les clients et gérer les projets =====
-- Adresse administratrice : anissa.malha.pro@gmail.com (modifiable ici avant de lancer le script).
create table if not exists public.admins (
  email text primary key
);
insert into public.admins (email) values ('anissa.malha.pro@gmail.com') on conflict do nothing;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins a where lower(a.email) = lower(auth.jwt() ->> 'email'))
$$;

-- ===== Profils des clients (un par compte) =====
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  prenom text not null default '',
  nom text not null default '',
  telephone text not null default '',
  societe text not null default '',
  siret text not null check (siret ~ '^[0-9]{14}$'),
  siret_verifie boolean not null default false,
  kbis_path text,
  statut text not null default 'a_completer' check (statut in ('a_completer', 'en_attente', 'valide', 'refuse')),
  motif_refus text,
  created_at timestamptz not null default now(),
  validated_at timestamptz
);

-- Le profil est créé automatiquement à l'inscription, à partir des champs du formulaire.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, prenom, nom, telephone, societe, siret, siret_verifie)
  values (
    new.id, new.email,
    coalesce(new.raw_user_meta_data ->> 'prenom', ''),
    coalesce(new.raw_user_meta_data ->> 'nom', ''),
    coalesce(new.raw_user_meta_data ->> 'telephone', ''),
    coalesce(new.raw_user_meta_data ->> 'societe', ''),
    regexp_replace(coalesce(new.raw_user_meta_data ->> 'siret', ''), '[^0-9]', '', 'g'),
    coalesce((new.raw_user_meta_data ->> 'siret_verifie')::boolean, false)
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Le client envoie son Kbis : son dossier passe « en attente » de validation.
create or replace function public.soumettre_kbis(chemin text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if chemin is null or split_part(chemin, '/', 1) <> auth.uid()::text then
    raise exception 'Chemin de fichier invalide';
  end if;
  update public.profiles
     set kbis_path = chemin, statut = 'en_attente', motif_refus = null
   where id = auth.uid() and statut in ('a_completer', 'refuse', 'en_attente');
end $$;

create or replace function public.est_valide() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.statut = 'valide')
$$;

-- ===== Projets, documents et messages =====
create table if not exists public.projets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  titre text not null,
  description text not null default '',
  statut text not null default 'en_cours' check (statut in ('en_cours', 'en_pause', 'termine')),
  etape int not null default 1 check (etape between 1 and 4),
  progression int not null default 0 check (progression between 0 and 100),
  echeance date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  projet_id uuid references public.projets (id) on delete set null,
  type text not null default 'document' check (type in ('devis', 'facture', 'document')),
  nom text not null,
  chemin text not null,
  montant numeric(10, 2),
  statut text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  auteur text not null check (auteur in ('client', 'acha')),
  contenu text not null check (length(contenu) between 1 and 5000),
  created_at timestamptz not null default now()
);

create index if not exists projets_client on public.projets (client_id);
create index if not exists documents_client on public.documents (client_id);
create index if not exists messages_client on public.messages (client_id, created_at);

-- ===== Règles d'accès : chaque client ne voit que ses données, l'administratrice voit tout =====
alter table public.admins enable row level security;
alter table public.profiles enable row level security;
alter table public.projets enable row level security;
alter table public.documents enable row level security;
alter table public.messages enable row level security;

drop policy if exists "admins lecture" on public.admins;
create policy "admins lecture" on public.admins for select using (public.is_admin());

drop policy if exists "profil lecture" on public.profiles;
create policy "profil lecture" on public.profiles for select using (id = auth.uid() or public.is_admin());
drop policy if exists "profil admin" on public.profiles;
create policy "profil admin" on public.profiles for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "projets lecture" on public.projets;
create policy "projets lecture" on public.projets for select using ((client_id = auth.uid() and public.est_valide()) or public.is_admin());
drop policy if exists "projets admin" on public.projets;
create policy "projets admin" on public.projets for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "documents lecture" on public.documents;
create policy "documents lecture" on public.documents for select using ((client_id = auth.uid() and public.est_valide()) or public.is_admin());
drop policy if exists "documents admin" on public.documents;
create policy "documents admin" on public.documents for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "messages lecture" on public.messages;
create policy "messages lecture" on public.messages for select using ((client_id = auth.uid() and public.est_valide()) or public.is_admin());
drop policy if exists "messages client" on public.messages;
create policy "messages client" on public.messages for insert
  with check (client_id = auth.uid() and auteur = 'client' and public.est_valide());
drop policy if exists "messages admin" on public.messages;
create policy "messages admin" on public.messages for insert with check (auteur = 'acha' and public.is_admin());

-- ===== Fichiers : Kbis et documents, jamais publics =====
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kbis', 'kbis', false, 5242880, array['application/pdf', 'image/jpeg', 'image/png']),
       ('documents', 'documents', false, 20971520, null)
on conflict (id) do nothing;

drop policy if exists "kbis depot" on storage.objects;
create policy "kbis depot" on storage.objects for insert to authenticated
  with check (bucket_id = 'kbis' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "kbis lecture" on storage.objects;
create policy "kbis lecture" on storage.objects for select to authenticated
  using (bucket_id = 'kbis' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

drop policy if exists "documents lecture" on storage.objects;
create policy "documents lecture" on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (((storage.foldername(name))[1] = auth.uid()::text and public.est_valide()) or public.is_admin()));
drop policy if exists "documents depot admin" on storage.objects;
create policy "documents depot admin" on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and public.is_admin());
drop policy if exists "documents suppression admin" on storage.objects;
create policy "documents suppression admin" on storage.objects for delete to authenticated
  using (bucket_id in ('documents', 'kbis') and public.is_admin());
