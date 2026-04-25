alter table public.agents
add column if not exists text_color text not null default '#FFFFFF';

update public.agents
set text_color = '#FFFFFF'
where text_color is null or btrim(text_color) = '';
