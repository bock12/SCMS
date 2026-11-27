begin;

-- Persisted, scope-aware church, district and branch payment-channel settings.
-- Every channel links to an active operational bank or mobile-money financial
-- account in Accounting Setup so member payment destinations stay aligned with
-- the church chart of accounts and organizational scope.

create table if not exists public.payment_channels (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.church_branches(id) on delete restrict,
  district_id uuid references public.districts(id) on delete restrict,
  financial_account_id uuid not null
    references public.financial_accounts(id) on delete restrict,
  default_fund_id uuid
    references public.funds(id) on delete restrict,
  channel_type text not null
    check (channel_type in ('mobile_money', 'bank_transfer')),
  provider_name text not null
    check (length(trim(provider_name)) > 0),
  account_name text not null
    check (length(trim(account_name)) > 0),
  account_number_or_code text not null
    check (length(trim(account_number_or_code)) > 0),
  branch_or_swift_code text,
  instructions text,
  verification_mode text not null default 'manual_proof'
    check (verification_mode in ('manual_proof', 'provider_reference')),
  display_order integer not null default 0
    check (display_order >= 0),
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete restrict,
  updated_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ix_payment_channels_branch_active
  on public.payment_channels (branch_id, is_active, display_order);
create index if not exists ix_payment_channels_district_active
  on public.payment_channels (district_id, branch_id, is_active)
  where district_id is not null;
create index if not exists ix_payment_channels_financial_account
  on public.payment_channels (financial_account_id);

drop trigger if exists trg_payment_channels_district_scope on public.payment_channels;
create trigger trg_payment_channels_district_scope
before insert or update of branch_id, district_id on public.payment_channels
for each row execute function private.sync_finance_district_scope();

alter table public.payment_channels enable row level security;

revoke all on public.payment_channels from public, anon, authenticated;
grant select on public.payment_channels to authenticated;

drop policy if exists payment_channels_finance_read on public.payment_channels;
create policy payment_channels_finance_read
on public.payment_channels for select to authenticated
using (
  (branch_id is not null and (
    private.has_permission('view_finances', branch_id)
    or private.has_permission('manage_finances', branch_id)
    or private.has_permission('approve_finances', branch_id)
  ))
  or (branch_id is null and district_id is not null and (
    private.has_permission_for_district('view_finances', district_id)
    or private.has_permission_for_district('manage_finances', district_id)
    or private.has_permission_for_district('approve_finances', district_id)
  ))
  or (branch_id is null and district_id is null and (
    private.has_permission('view_finances', null)
    or private.has_permission('manage_finances', null)
    or private.has_permission('approve_finances', null)
  ))
);

create or replace function public.get_payment_channel_configuration(
  p_scope_type text,
  p_scope_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_district_id uuid;
  v_branch_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  v_profile_id := private.current_profile_id();
  if v_profile_id is null then
    raise exception 'No active member profile is linked to this account';
  end if;

  if p_scope_type not in ('church', 'district', 'branch') then
    raise exception 'Finance scope must be church, district or branch';
  end if;

  if p_scope_type = 'church' then
    if p_scope_id is not null then
      raise exception 'Church-wide finance scope must not include a scope ID';
    end if;
    if not (
      private.has_permission('view_finances', null)
      or private.has_permission('manage_finances', null)
      or private.has_permission('approve_finances', null)
    ) then
      raise exception 'Insufficient permission to view church-wide payment channels';
    end if;
  elsif p_scope_type = 'district' then
    if p_scope_id is null or not exists (
      select 1 from public.districts d where d.id = p_scope_id
    ) then
      raise exception 'Finance district does not exist';
    end if;
    if not (
      private.has_permission_for_district('view_finances', p_scope_id)
      or private.has_permission_for_district('manage_finances', p_scope_id)
      or private.has_permission_for_district('approve_finances', p_scope_id)
    ) then
      raise exception 'Insufficient permission to view payment channels in this district';
    end if;
    v_district_id := p_scope_id;
  else
    if p_scope_id is null then
      raise exception 'Finance branch is required';
    end if;
    select b.district_id into v_district_id
    from public.church_branches b where b.id = p_scope_id;
    if not found then
      raise exception 'Finance branch does not exist';
    end if;
    if not (
      private.has_permission('view_finances', p_scope_id)
      or private.has_permission('manage_finances', p_scope_id)
      or private.has_permission('approve_finances', p_scope_id)
    ) then
      raise exception 'Insufficient permission to view payment channels in this branch';
    end if;
    v_branch_id := p_scope_id;
  end if;

  return jsonb_build_object(
    'scope', jsonb_build_object('type', p_scope_type, 'id', p_scope_id),
    'currencies', coalesce((
      select jsonb_agg(c.code order by c.code)
      from public.currencies c where c.is_active
    ), '[]'::jsonb),
    'baseCurrencyCode', (
      select cs.base_currency_code from public.church_settings cs where cs.id = 1
    ),
    'channels', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pc.id,
        'branch_id', pc.branch_id,
        'district_id', pc.district_id,
        'financial_account_id', pc.financial_account_id,
        'financial_account_name', fa.name,
        'financial_account_type', fa.account_type,
        'currency_code', fa.currency_code,
        'default_fund_id', pc.default_fund_id,
        'default_fund_name', f.name,
        'channel_type', pc.channel_type,
        'provider_name', pc.provider_name,
        'account_name', pc.account_name,
        'account_number_or_code', pc.account_number_or_code,
        'branch_or_swift_code', pc.branch_or_swift_code,
        'instructions', pc.instructions,
        'verification_mode', pc.verification_mode,
        'display_order', pc.display_order,
        'is_active', pc.is_active,
        'updated_at', pc.updated_at
      ) order by pc.display_order asc, pc.provider_name asc, pc.created_at asc)
      from public.payment_channels pc
      join public.financial_accounts fa on fa.id = pc.financial_account_id
      left join public.funds f on f.id = pc.default_fund_id
      where
        (p_scope_type = 'church' and pc.branch_id is null and pc.district_id is null)
        or (p_scope_type = 'district' and pc.branch_id is null and pc.district_id = v_district_id)
        or (p_scope_type = 'branch' and pc.branch_id = v_branch_id)
    ), '[]'::jsonb),
    'eligibleFinancialAccounts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', fa.id,
        'chart_account_id', fa.chart_account_id,
        'branch_id', fa.branch_id,
        'district_id', fa.district_id,
        'name', fa.name,
        'account_type', fa.account_type,
        'currency_code', fa.currency_code,
        'provider_name', fa.provider_name,
        'account_reference', fa.account_reference,
        'is_active', fa.is_active
      ) order by
        (fa.branch_id is not null) desc,
        (fa.district_id is not null) desc,
        fa.name asc,
        fa.id asc)
      from public.financial_accounts fa
      where fa.is_active
        and fa.account_type in ('bank', 'mobile_money')
        and (
          (p_scope_type = 'church' and fa.branch_id is null and fa.district_id is null)
          or (p_scope_type = 'district' and fa.branch_id is null and (fa.district_id is null or fa.district_id = v_district_id))
          or (p_scope_type = 'branch' and (
            fa.branch_id = v_branch_id
            or (fa.branch_id is null and (fa.district_id is null or fa.district_id = v_district_id))
          ))
        )
    ), '[]'::jsonb),
    'activeFunds', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id,
        'branch_id', f.branch_id,
        'district_id', f.district_id,
        'name', f.name,
        'code', f.code,
        'description', f.description,
        'fund_type', f.fund_type,
        'is_default', f.is_default,
        'is_active', f.is_active
      ) order by f.is_default desc, f.code asc, f.id asc)
      from public.funds f
      where f.is_active
        and (
          (p_scope_type = 'church' and f.branch_id is null and f.district_id is null)
          or (p_scope_type = 'district' and f.branch_id is null and (f.district_id is null or f.district_id = v_district_id))
          or (p_scope_type = 'branch' and (
            f.branch_id = v_branch_id
            or (f.branch_id is null and (f.district_id is null or f.district_id = v_district_id))
          ))
        )
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.save_payment_channel(
  p_scope_type text,
  p_scope_id uuid,
  p_channel jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_district_id uuid;
  v_branch_id uuid;
  v_channel_id uuid;
  v_financial_account_id uuid;
  v_default_fund_id uuid;
  v_channel_type text;
  v_provider_name text;
  v_account_name text;
  v_account_number_or_code text;
  v_branch_or_swift_code text;
  v_instructions text;
  v_verification_mode text;
  v_display_order integer;
  v_is_active boolean;
  v_account public.financial_accounts%rowtype;
  v_fund public.funds%rowtype;
  v_existing public.payment_channels%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  v_profile_id := private.current_profile_id();
  if v_profile_id is null then
    raise exception 'No active member profile is linked to this account';
  end if;

  if p_scope_type not in ('church', 'district', 'branch') then
    raise exception 'Finance scope must be church, district or branch';
  end if;
  if p_channel is null or jsonb_typeof(p_channel) is distinct from 'object' then
    raise exception 'Payment channel payload must be a JSON object';
  end if;

  if p_scope_type = 'church' then
    if p_scope_id is not null then
      raise exception 'Church-wide finance scope must not include a scope ID';
    end if;
    if not private.has_permission('manage_finances', null) then
      raise exception 'Insufficient permission to manage church-wide payment channels';
    end if;
  elsif p_scope_type = 'district' then
    if p_scope_id is null or not exists (
      select 1 from public.districts d where d.id = p_scope_id
    ) then
      raise exception 'Finance district does not exist';
    end if;
    if not private.has_permission_for_district('manage_finances', p_scope_id) then
      raise exception 'Insufficient permission to manage payment channels in this district';
    end if;
    v_district_id := p_scope_id;
  else
    if p_scope_id is null then
      raise exception 'Finance branch is required';
    end if;
    select b.district_id into v_district_id
    from public.church_branches b where b.id = p_scope_id;
    if not found then
      raise exception 'Finance branch does not exist';
    end if;
    if not private.has_permission('manage_finances', p_scope_id) then
      raise exception 'Insufficient permission to manage payment channels in this branch';
    end if;
    v_branch_id := p_scope_id;
  end if;

  v_channel_id := nullif(trim(coalesce(p_channel->>'id', '')), '')::uuid;
  v_financial_account_id := nullif(trim(coalesce(p_channel->>'financial_account_id', '')), '')::uuid;
  v_default_fund_id := nullif(trim(coalesce(p_channel->>'default_fund_id', '')), '')::uuid;
  v_channel_type := trim(coalesce(p_channel->>'channel_type', ''));
  v_provider_name := trim(coalesce(p_channel->>'provider_name', ''));
  v_account_name := trim(coalesce(p_channel->>'account_name', ''));
  v_account_number_or_code := trim(coalesce(p_channel->>'account_number_or_code', ''));
  v_branch_or_swift_code := nullif(trim(coalesce(p_channel->>'branch_or_swift_code', '')), '');
  v_instructions := nullif(trim(coalesce(p_channel->>'instructions', '')), '');
  v_verification_mode := coalesce(nullif(trim(coalesce(p_channel->>'verification_mode', '')), ''), 'manual_proof');
  v_display_order := coalesce((p_channel->>'display_order')::integer, 0);
  v_is_active := coalesce((p_channel->>'is_active')::boolean, true);

  if v_channel_type not in ('mobile_money', 'bank_transfer') then
    raise exception 'Channel type must be mobile_money or bank_transfer';
  end if;
  if v_provider_name = '' or v_account_name = '' or v_account_number_or_code = '' then
    raise exception 'Provider name, account name and merchant code or account number are required';
  end if;
  if v_verification_mode not in ('manual_proof', 'provider_reference') then
    raise exception 'Verification mode must be manual_proof or provider_reference';
  end if;
  if v_display_order < 0 then
    raise exception 'Display order must be zero or positive';
  end if;
  if v_financial_account_id is null then
    raise exception 'An active operational bank or mobile-money financial account is required';
  end if;

  select * into v_account
  from public.financial_accounts fa
  where fa.id = v_financial_account_id and fa.is_active;
  if not found then
    raise exception 'Linked financial account was not found or is inactive';
  end if;
  if v_channel_type = 'mobile_money' and v_account.account_type <> 'mobile_money' then
    raise exception 'Mobile-money channels must link to a mobile_money financial account';
  end if;
  if v_channel_type = 'bank_transfer' and v_account.account_type <> 'bank' then
    raise exception 'Bank-transfer channels must link to a bank financial account';
  end if;

  if p_scope_type = 'church' then
    if v_account.branch_id is not null or v_account.district_id is not null then
      raise exception 'Church-wide payment channels can only link to church-wide financial accounts';
    end if;
  elsif p_scope_type = 'district' then
    if v_account.branch_id is not null
       or (v_account.district_id is not null and v_account.district_id is distinct from v_district_id) then
      raise exception 'Linked financial account is outside this district scope';
    end if;
  else
    if (v_account.branch_id is not null and v_account.branch_id is distinct from v_branch_id)
       or (v_account.branch_id is null and v_account.district_id is not null and v_account.district_id is distinct from v_district_id) then
      raise exception 'Linked financial account is outside this branch scope';
    end if;
  end if;

  if v_default_fund_id is not null then
    select * into v_fund
    from public.funds f
    where f.id = v_default_fund_id and f.is_active;
    if not found then
      raise exception 'Selected default fund was not found or is inactive';
    end if;
    if p_scope_type = 'church' then
      if v_fund.branch_id is not null or v_fund.district_id is not null then
        raise exception 'Church-wide payment channels can only link to church-wide funds';
      end if;
    elsif p_scope_type = 'district' then
      if v_fund.branch_id is not null
         or (v_fund.district_id is not null and v_fund.district_id is distinct from v_district_id) then
        raise exception 'Selected default fund is outside this district scope';
      end if;
    else
      if (v_fund.branch_id is not null and v_fund.branch_id is distinct from v_branch_id)
         or (v_fund.branch_id is null and v_fund.district_id is not null and v_fund.district_id is distinct from v_district_id) then
        raise exception 'Selected default fund is outside this branch scope';
      end if;
    end if;
  end if;

  if v_channel_id is not null then
    select * into v_existing
    from public.payment_channels pc
    where pc.id = v_channel_id
    for update;

    if found then
      if (p_scope_type = 'church' and (v_existing.branch_id is not null or v_existing.district_id is not null))
         or (p_scope_type = 'district' and (v_existing.branch_id is not null or v_existing.district_id is distinct from v_district_id))
         or (p_scope_type = 'branch' and v_existing.branch_id is distinct from v_branch_id) then
        raise exception 'Payment channel does not belong to the requested scope';
      end if;

      update public.payment_channels
      set financial_account_id = v_financial_account_id,
          default_fund_id = v_default_fund_id,
          channel_type = v_channel_type,
          provider_name = v_provider_name,
          account_name = v_account_name,
          account_number_or_code = v_account_number_or_code,
          branch_or_swift_code = v_branch_or_swift_code,
          instructions = v_instructions,
          verification_mode = v_verification_mode,
          display_order = v_display_order,
          is_active = v_is_active,
          updated_by = v_profile_id,
          updated_at = now()
      where id = v_channel_id
      returning * into v_existing;

      return jsonb_build_object(
        'saved', true,
        'channel', jsonb_build_object(
          'id', v_existing.id,
          'branch_id', v_existing.branch_id,
          'district_id', v_existing.district_id,
          'financial_account_id', v_existing.financial_account_id,
          'default_fund_id', v_existing.default_fund_id,
          'channel_type', v_existing.channel_type,
          'provider_name', v_existing.provider_name,
          'account_name', v_existing.account_name,
          'account_number_or_code', v_existing.account_number_or_code,
          'branch_or_swift_code', v_existing.branch_or_swift_code,
          'instructions', v_existing.instructions,
          'verification_mode', v_existing.verification_mode,
          'display_order', v_existing.display_order,
          'is_active', v_existing.is_active
        )
      );
    end if;
  end if;

  insert into public.payment_channels (
    id, branch_id, district_id, financial_account_id, default_fund_id,
    channel_type, provider_name, account_name, account_number_or_code,
    branch_or_swift_code, instructions, verification_mode, display_order,
    is_active, created_by, updated_by
  ) values (
    coalesce(v_channel_id, gen_random_uuid()),
    v_branch_id,
    v_district_id,
    v_financial_account_id,
    v_default_fund_id,
    v_channel_type,
    v_provider_name,
    v_account_name,
    v_account_number_or_code,
    v_branch_or_swift_code,
    v_instructions,
    v_verification_mode,
    v_display_order,
    v_is_active,
    v_profile_id,
    v_profile_id
  )
  returning * into v_existing;

  return jsonb_build_object(
    'saved', true,
    'channel', jsonb_build_object(
      'id', v_existing.id,
      'branch_id', v_existing.branch_id,
      'district_id', v_existing.district_id,
      'financial_account_id', v_existing.financial_account_id,
      'default_fund_id', v_existing.default_fund_id,
      'channel_type', v_existing.channel_type,
      'provider_name', v_existing.provider_name,
      'account_name', v_existing.account_name,
      'account_number_or_code', v_existing.account_number_or_code,
      'branch_or_swift_code', v_existing.branch_or_swift_code,
      'instructions', v_existing.instructions,
      'verification_mode', v_existing.verification_mode,
      'display_order', v_existing.display_order,
      'is_active', v_existing.is_active
    )
  );
end;
$$;

create or replace function public.set_payment_channel_status(
  p_channel_id uuid,
  p_is_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_existing public.payment_channels%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  v_profile_id := private.current_profile_id();
  if v_profile_id is null then
    raise exception 'No active member profile is linked to this account';
  end if;

  select * into v_existing
  from public.payment_channels pc
  where pc.id = p_channel_id
  for update;
  if not found then
    raise exception 'Payment channel does not exist';
  end if;

  if v_existing.branch_id is not null then
    if not private.has_permission('manage_finances', v_existing.branch_id) then
      raise exception 'Insufficient permission to update payment channels in this branch';
    end if;
  elsif v_existing.district_id is not null then
    if not private.has_permission_for_district('manage_finances', v_existing.district_id) then
      raise exception 'Insufficient permission to update payment channels in this district';
    end if;
  else
    if not private.has_permission('manage_finances', null) then
      raise exception 'Insufficient permission to update church-wide payment channels';
    end if;
  end if;

  update public.payment_channels
  set is_active = coalesce(p_is_active, true),
      updated_by = v_profile_id,
      updated_at = now()
  where id = p_channel_id
  returning * into v_existing;

  return jsonb_build_object(
    'id', v_existing.id,
    'is_active', v_existing.is_active
  );
end;
$$;

create or replace function public.delete_payment_channel(
  p_channel_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_existing public.payment_channels%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  v_profile_id := private.current_profile_id();
  if v_profile_id is null then
    raise exception 'No active member profile is linked to this account';
  end if;

  select * into v_existing
  from public.payment_channels pc
  where pc.id = p_channel_id
  for update;
  if not found then
    raise exception 'Payment channel does not exist';
  end if;

  if v_existing.branch_id is not null then
    if not private.has_permission('manage_finances', v_existing.branch_id) then
      raise exception 'Insufficient permission to remove payment channels in this branch';
    end if;
  elsif v_existing.district_id is not null then
    if not private.has_permission_for_district('manage_finances', v_existing.district_id) then
      raise exception 'Insufficient permission to remove payment channels in this district';
    end if;
  else
    if not private.has_permission('manage_finances', null) then
      raise exception 'Insufficient permission to remove church-wide payment channels';
    end if;
  end if;

  delete from public.payment_channels where id = p_channel_id;

  return jsonb_build_object('deleted', true, 'id', p_channel_id);
end;
$$;

create or replace function public.get_member_giving_channels(
  p_branch_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_profile_branch_id uuid;
  v_branch_id uuid;
  v_district_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  v_profile_id := private.current_profile_id();
  if v_profile_id is null then
    raise exception 'No active member profile is linked to this account';
  end if;

  select p.branch_id into v_profile_branch_id
  from public.profiles p
  where p.id = v_profile_id;

  v_branch_id := coalesce(p_branch_id, v_profile_branch_id);

  if v_branch_id is not null then
    select b.district_id into v_district_id
    from public.church_branches b
    where b.id = v_branch_id;
    if not found then
      raise exception 'Branch does not exist';
    end if;
    if v_branch_id is distinct from v_profile_branch_id
       and not private.can_access_branch(v_branch_id) then
      raise exception 'Insufficient permission to view giving channels for this branch';
    end if;
  end if;

  return jsonb_build_object(
    'branch_id', v_branch_id,
    'currencies', coalesce((
      select jsonb_agg(c.code order by c.code)
      from public.currencies c where c.is_active
    ), '[]'::jsonb),
    'baseCurrencyCode', (
      select cs.base_currency_code from public.church_settings cs where cs.id = 1
    ),
    'channels', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pc.id,
        'scope_type', case
          when pc.branch_id is not null then 'branch'
          when pc.district_id is not null then 'district'
          else 'church'
        end,
        'branch_id', pc.branch_id,
        'district_id', pc.district_id,
        'channel_type', pc.channel_type,
        'provider_name', pc.provider_name,
        'account_name', pc.account_name,
        'account_number_or_code', pc.account_number_or_code,
        'branch_or_swift_code', pc.branch_or_swift_code,
        'instructions', pc.instructions,
        'currency_code', fa.currency_code,
        'default_fund_id', pc.default_fund_id,
        'default_fund_name', f.name,
        'verification_mode', pc.verification_mode,
        'display_order', pc.display_order
      ) order by
        (pc.branch_id is not null) desc,
        (pc.district_id is not null) desc,
        pc.display_order asc,
        pc.provider_name asc)
      from public.payment_channels pc
      join public.financial_accounts fa on fa.id = pc.financial_account_id
      left join public.funds f on f.id = pc.default_fund_id
      where pc.is_active
        and fa.is_active
        and (
          (pc.branch_id is null and pc.district_id is null)
          or (v_district_id is not null and pc.branch_id is null and pc.district_id = v_district_id)
          or (v_branch_id is not null and pc.branch_id = v_branch_id)
        )
    ), '[]'::jsonb),
    'funds', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id,
        'name', f.name,
        'code', f.code,
        'description', f.description,
        'fund_type', f.fund_type,
        'is_default', f.is_default
      ) order by f.is_default desc, f.code asc, f.id asc)
      from public.funds f
      where f.is_active
        and (
          (f.branch_id is null and f.district_id is null)
          or (v_district_id is not null and f.branch_id is null and f.district_id = v_district_id)
          or (v_branch_id is not null and f.branch_id = v_branch_id)
        )
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_payment_channel_configuration(text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.save_payment_channel(text, uuid, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.set_payment_channel_status(uuid, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.delete_payment_channel(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.get_member_giving_channels(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.get_payment_channel_configuration(text, uuid)
  to authenticated;
grant execute on function public.save_payment_channel(text, uuid, jsonb)
  to authenticated;
grant execute on function public.set_payment_channel_status(uuid, boolean)
  to authenticated;
grant execute on function public.delete_payment_channel(uuid)
  to authenticated;
grant execute on function public.get_member_giving_channels(uuid)
  to authenticated;

commit;
