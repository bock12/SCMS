begin;

-- FIN-INT-004: private supporting evidence for canonical receipt/payment documents.
-- File bytes live only in Supabase Storage; this table stores metadata and links.
create table if not exists public.financial_document_attachments (
  id uuid primary key default gen_random_uuid(),
  financial_document_id uuid not null
    references public.financial_documents(id) on delete restrict,
  bucket_id text not null default 'scms-finance-private'
    check (bucket_id = 'scms-finance-private'),
  object_path text not null,
  original_filename text not null
    check (char_length(original_filename) between 1 and 255
      and original_filename !~ '[/\\\\]'
      and original_filename !~ '[[:cntrl:]]'),
  mime_type text not null
    check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  size_bytes bigint not null
    check (size_bytes between 1 and 10485760),
  uploaded_by_profile_id uuid not null
    references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint financial_document_attachments_object_path_unique
    unique (bucket_id, object_path),
  constraint financial_document_attachments_path_shape
    check (split_part(object_path, '/', 1) = financial_document_id::text
      and object_path !~ '(^/|//|\\\\)')
);

create index if not exists financial_document_attachments_document_idx
  on public.financial_document_attachments (financial_document_id, created_at desc);

alter table public.financial_document_attachments enable row level security;

revoke all on public.financial_document_attachments from public, anon, authenticated;
grant select, insert, delete on public.financial_document_attachments to authenticated;
grant usage on schema public to authenticated;

-- A private bucket is essential: public URLs would bypass finance RLS.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'scms-finance-private',
  'scms-finance-private',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png']::text[]
)
on conflict (id) do update
set name = excluded.name,
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Metadata reads follow the financial document's exact church/district/branch scope.
drop policy if exists finance_document_attachments_read on public.financial_document_attachments;
create policy finance_document_attachments_read
on public.financial_document_attachments for select to authenticated
using (
  exists (
    select 1
    from public.financial_documents d
    where d.id = financial_document_id
      and (
        d.profile_id = private.current_profile_id()
        or (d.branch_id is not null and private.has_permission('view_finances', d.branch_id))
        or (d.branch_id is null and d.district_id is not null
            and private.has_permission_for_district('view_finances', d.district_id))
        or (d.branch_id is null and d.district_id is null
            and private.has_permission('view_finances', null))
      )
  )
);

drop policy if exists finance_document_attachments_upload on public.financial_document_attachments;
create policy finance_document_attachments_upload
on public.financial_document_attachments for insert to authenticated
with check (
  uploaded_by_profile_id = private.current_profile_id()
  and exists (
    select 1
    from public.financial_documents d
    where d.id = financial_document_id
      and (
        (d.branch_id is not null and private.has_permission('manage_finances', d.branch_id))
        or (d.branch_id is null and d.district_id is not null
            and private.has_permission_for_district('manage_finances', d.district_id))
        or (d.branch_id is null and d.district_id is null
            and private.has_permission('manage_finances', null))
      )
  )
  and exists (
    select 1 from storage.objects o
    where o.bucket_id = bucket_id and o.name = object_path
  )
);

drop policy if exists finance_document_attachments_delete on public.financial_document_attachments;
create policy finance_document_attachments_delete
on public.financial_document_attachments for delete to authenticated
using (
  exists (
    select 1
    from public.financial_documents d
    where d.id = financial_document_id
      and (
        (d.branch_id is not null and private.has_permission('manage_finances', d.branch_id))
        or (d.branch_id is null and d.district_id is not null
            and private.has_permission_for_district('manage_finances', d.district_id))
        or (d.branch_id is null and d.district_id is null
            and private.has_permission('manage_finances', null))
      )
  )
);

-- Storage upload is authorized against the document ID in the first path segment.
-- No upsert policy is provided: evidence objects are immutable and paths are unique.
drop policy if exists scms_finance_attachment_upload on storage.objects;
create policy scms_finance_attachment_upload
on storage.objects for insert to authenticated
with check (
  bucket_id = 'scms-finance-private'
  and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and exists (
    select 1
    from public.financial_documents d
    where d.id::text = split_part(name, '/', 1)
      and (
        (d.branch_id is not null and private.has_permission('manage_finances', d.branch_id))
        or (d.branch_id is null and d.district_id is not null
            and private.has_permission_for_district('manage_finances', d.district_id))
        or (d.branch_id is null and d.district_id is null
            and private.has_permission('manage_finances', null))
      )
  )
);

drop policy if exists scms_finance_attachment_read on storage.objects;
create policy scms_finance_attachment_read
on storage.objects for select to authenticated
using (
  bucket_id = 'scms-finance-private'
  and exists (
    select 1
    from public.financial_document_attachments a
    join public.financial_documents d on d.id = a.financial_document_id
    where a.bucket_id = storage.objects.bucket_id
      and a.object_path = storage.objects.name
      and (
        d.profile_id = private.current_profile_id()
        or (d.branch_id is not null and private.has_permission('view_finances', d.branch_id))
        or (d.branch_id is null and d.district_id is not null
            and private.has_permission_for_district('view_finances', d.district_id))
        or (d.branch_id is null and d.district_id is null
            and private.has_permission('view_finances', null))
      )
  )
);

drop policy if exists scms_finance_attachment_delete on storage.objects;
create policy scms_finance_attachment_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'scms-finance-private'
  and exists (
    select 1
    from public.financial_document_attachments a
    join public.financial_documents d on d.id = a.financial_document_id
    where a.bucket_id = storage.objects.bucket_id
      and a.object_path = storage.objects.name
      and (
        (d.branch_id is not null and private.has_permission('manage_finances', d.branch_id))
        or (d.branch_id is null and d.district_id is not null
            and private.has_permission_for_district('manage_finances', d.district_id))
        or (d.branch_id is null and d.district_id is null
            and private.has_permission('manage_finances', null))
      )
  )
);

commit;
