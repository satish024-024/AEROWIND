-- Supabase PostgreSQL Migration for Per-User IBM Quantum Credentials
-- Project: avtkzutofgsjzldkimro

-- 1. Create ibm_quantum_credentials table
create table if not exists public.ibm_quantum_credentials (
    id uuid primary key default uuid_generate_v4(),
    user_id text not null unique,
    encrypted_api_token text not null,
    crn_or_instance text,
    created_at timestamptz default timezone('utc'::text, now()),
    updated_at timestamptz default timezone('utc'::text, now()),
    last_used_at timestamptz,
    last_status text default 'CONFIGURED'
);

-- 2. Index user_id for high-speed single-row lookups
create index if not exists idx_ibm_quantum_credentials_user_id on public.ibm_quantum_credentials(user_id);

-- 3. Enable Row Level Security (RLS)
alter table public.ibm_quantum_credentials enable row level security;

-- 4. RLS Policy: Authenticated users can only read their own credential metadata
create policy "Users can read own ibm quantum credential metadata"
    on public.ibm_quantum_credentials for select
    using (auth.uid()::text = user_id);

-- 5. RLS Policy: Users can insert/update only their own credential record
create policy "Users can insert own ibm quantum credentials"
    on public.ibm_quantum_credentials for insert
    with check (auth.uid()::text = user_id);

create policy "Users can update own ibm quantum credentials"
    on public.ibm_quantum_credentials for update
    using (auth.uid()::text = user_id);

create policy "Users can delete own ibm quantum credentials"
    on public.ibm_quantum_credentials for delete
    using (auth.uid()::text = user_id);
