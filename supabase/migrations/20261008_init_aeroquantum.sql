-- Supabase PostgreSQL Schema for AeroQuantum-Wind (UC-045)
-- Project: avtkzutofgsjzldkimro

-- 1. Enable UUID extension
create extension if not exists "uuid-ossp";

-- 2. Projects table
create table if not exists public.projects (
    id text primary key default uuid_generate_v4()::text,
    user_id uuid references auth.users(id) on delete set null,
    name text not null,
    location_name text not null,
    latitude double precision not null,
    longitude double precision not null,
    area_km2 double precision,
    turbine_count integer default 12,
    turbine_model text default 'GE 2.5-120',
    rotor_diameter double precision default 120.0,
    hub_height double precision default 110.0,
    spacing_d double precision default 5.0,
    wind_speed double precision default 7.1,
    wind_direction double precision default 300.0,
    suitability text default 'Good',
    soil_bearing_capacity_kpa double precision,
    usda_texture_class text,
    foundation_type text default 'GRAVITY_BASE',
    soil_hazard_level text default 'SAFE',
    environmental_notes jsonb default '[]'::jsonb,
    gross_aep double precision,
    net_aep double precision,
    wake_loss_percent double precision,
    turbines jsonb default '[]'::jsonb,
    boundary jsonb default '[]'::jsonb,
    status text default 'configured',
    created_at timestamptz default timezone('utc'::text, now()),
    updated_at timestamptz default timezone('utc'::text, now())
);

-- 3. Optimization and Simulation Runs table
create table if not exists public.simulation_runs (
    id uuid primary key default uuid_generate_v4(),
    project_id text references public.projects(id) on delete cascade,
    solver_type text not null, -- 'classical', 'aer_qaoa', 'ibm_hardware'
    status text default 'completed',
    wake_model text default 'jensen_gaussian',
    exact_net_aep_gwh double precision,
    gross_aep_gwh double precision,
    wake_loss_pct double precision,
    capacity_factor_pct double precision,
    turbine_schedule jsonb default '[]'::jsonb,
    hardware_provenance jsonb default '{}'::jsonb,
    created_at timestamptz default timezone('utc'::text, now())
);

-- 4. Enable Row Level Security (RLS)
alter table public.projects enable row level security;
alter table public.simulation_runs enable row level security;

-- 5. Policies: Allow public read & write with API Key (anon / authenticated)
create policy "Allow read access to all projects"
    on public.projects for select
    using (true);

create policy "Allow insert access to all projects"
    on public.projects for insert
    with check (true);

create policy "Allow update access to all projects"
    on public.projects for update
    using (true);

create policy "Allow delete access to all projects"
    on public.projects for delete
    using (true);

create policy "Allow all simulation access"
    on public.simulation_runs for all
    using (true);
