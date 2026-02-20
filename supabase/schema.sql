-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Create Locations table
create table locations (
  id uuid default uuid_generate_v4() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  name text not null,
  description text,
  user_id uuid default auth.uid()
);

-- Create Containers table
create table containers (
  id uuid default uuid_generate_v4() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  name text not null,
  description text,
  location_id uuid references locations(id) on delete cascade,
  image_url text,
  user_id uuid default auth.uid()
);

-- Create Items table
create table items (
  id uuid default uuid_generate_v4() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  name text not null,
  description text,
  container_id uuid references containers(id) on delete set null,
  image_url text,
  images text[] default '{}',
  tags text[],
  category text,
  user_id uuid default auth.uid(),
  location_id uuid references locations(id) on delete set null,
  product_url text,
  user_description text,
  specs jsonb default '{}',
  quantity integer default 1,
  condition text default 'good'
);

-- Create Shopping List table
create table shopping_list (
  id uuid default uuid_generate_v4() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  tool_name text not null,
  estimated_price text,
  notes text,
  purchased boolean default false,
  user_id uuid default auth.uid()
);

-- RLS Policies (Row Level Security)
alter table locations enable row level security;
alter table containers enable row level security;
alter table items enable row level security;
alter table shopping_list enable row level security;

create policy "Users can access their own items"
  on items for all
  using (auth.uid() = user_id);

create policy "Users can access their own locations"
  on locations for all
  using (auth.uid() = user_id);

create policy "Users can access their own containers"
  on containers for all
  using (auth.uid() = user_id);

create policy "Users can manage their own shopping list"
  on shopping_list for all
  using (auth.uid() = user_id);

-- Indexes for performance
create index idx_items_user_id on items(user_id);
create index idx_items_container_id on items(container_id);
create index idx_items_category on items(category);
create index idx_items_created_at on items(created_at desc);
create index idx_containers_location_id on containers(location_id);
create index idx_containers_user_id on containers(user_id);
create index idx_locations_user_id on locations(user_id);
create index idx_shopping_list_user_id on shopping_list(user_id);

-- Storage buckets (run in Supabase Dashboard SQL editor)
-- insert into storage.buckets (id, name, public) values ('items', 'items', true);
-- insert into storage.buckets (id, name, public) values ('containers', 'containers', true);
