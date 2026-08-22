-- Security and reliability follow-up for the Cloudflare Pages migration.
-- No user rows are altered by this migration.

-- Keep administrative RPCs reachable only after an authenticated session exists.
REVOKE EXECUTE ON FUNCTION
  public.admin_dashboard(),
  public.admin_delete_user(uuid),
  public.admin_export_snapshot(),
  public.admin_get_announcement_config(),
  public.admin_health(),
  public.admin_list_feedback(integer),
  public.admin_list_users(integer),
  public.admin_list_users_v2(integer),
  public.admin_recent_audit(integer),
  public.admin_reset_user_data(uuid, boolean, boolean),
  public.admin_resolve_feedback(bigint, boolean),
  public.admin_set_admin(uuid, boolean),
  public.admin_set_advanced_runtime(boolean, boolean, boolean, boolean, integer, integer, integer, integer),
  public.admin_set_announcement(text, boolean, text, text),
  public.admin_set_announcement_schedule(text, boolean, text, text, timestamp with time zone, timestamp with time zone),
  public.admin_set_runtime_config(boolean, boolean, text),
  public.admin_set_user_control(uuid, boolean, text, text),
  public.admin_signups_14d(),
  public.admin_traffic_stats(),
  public.admin_usage_7d(),
  public.admin_user_detail(uuid)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.admin_dashboard(),
  public.admin_delete_user(uuid),
  public.admin_export_snapshot(),
  public.admin_get_announcement_config(),
  public.admin_health(),
  public.admin_list_feedback(integer),
  public.admin_list_users(integer),
  public.admin_list_users_v2(integer),
  public.admin_recent_audit(integer),
  public.admin_reset_user_data(uuid, boolean, boolean),
  public.admin_resolve_feedback(bigint, boolean),
  public.admin_set_admin(uuid, boolean),
  public.admin_set_advanced_runtime(boolean, boolean, boolean, boolean, integer, integer, integer, integer),
  public.admin_set_announcement(text, boolean, text, text),
  public.admin_set_announcement_schedule(text, boolean, text, text, timestamp with time zone, timestamp with time zone),
  public.admin_set_runtime_config(boolean, boolean, text),
  public.admin_set_user_control(uuid, boolean, text, text),
  public.admin_signups_14d(),
  public.admin_traffic_stats(),
  public.admin_usage_7d(),
  public.admin_user_detail(uuid)
TO authenticated;

-- These helpers are used only by authenticated users, RLS, or trigger code.
REVOKE EXECUTE ON FUNCTION
  public.is_app_admin(uuid),
  public.is_user_suspended(uuid),
  public.get_my_access_state(),
  public.sync_quiz_wrong_answer(text, text, text, text, timestamp with time zone)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.is_app_admin(uuid),
  public.is_user_suspended(uuid),
  public.get_my_access_state(),
  public.sync_quiz_wrong_answer(text, text, text, text, timestamp with time zone)
TO authenticated;

-- The deployed function referenced a retired table name, so the admin detail dialog always failed.
CREATE OR REPLACE FUNCTION public.admin_user_detail(p_target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
declare result jsonb;
begin
  if not public.is_app_admin(auth.uid()) then
    raise exception 'admin required';
  end if;

  select jsonb_build_object(
    'user_id', u.id,
    'login_id', coalesce(u.raw_user_meta_data->>'username', split_part(coalesce(u.email, ''), '@', 1)),
    'created_at', u.created_at,
    'last_sign_in_at', u.last_sign_in_at,
    'is_admin', exists(select 1 from public.app_admins a where a.user_id = u.id),
    'suspended', coalesce(c.suspended, false),
    'suspension_reason', coalesce(c.suspension_reason, ''),
    'internal_note', coalesce(c.internal_note, ''),
    'progress', coalesce((
      select jsonb_build_object(
        'quiz_count', s.quiz_count,
        'best_distance_km', s.best_distance_km,
        'updated_at', s.updated_at,
        'pin_count', jsonb_array_length(coalesce(s.pins, '[]'::jsonb))
      )
      from public.study_progress s
      where s.user_id = u.id
    ), '{}'::jsonb),
    'wrong_by_mode', coalesce((
      select jsonb_object_agg(x.quiz_mode, x.cnt)
      from (
        select q.quiz_mode, count(*) cnt
        from public.quiz_wrong_answers q
        where q.user_id = u.id and q.state = 'wrong'
        group by q.quiz_mode
      ) x
    ), '{}'::jsonb),
    'recent_wrong', coalesce((
      select jsonb_agg(jsonb_build_object(
        'quiz_mode', q.quiz_mode,
        'answer_label', q.answer_label,
        'question_key', q.question_key,
        'state', q.state,
        'changed_at', q.state_changed_at
      ) order by q.state_changed_at desc)
      from (
        select *
        from public.quiz_wrong_answers
        where user_id = u.id
        order by state_changed_at desc
        limit 20
      ) q
    ), '[]'::jsonb)
  ) into result
  from auth.users u
  left join public.app_user_controls c on c.user_id = u.id
  where u.id = p_target_user_id;

  if result is null then
    raise exception 'user not found';
  end if;
  return result;
end;
$function$;

-- Only allow normal web links (or a same-site relative path) in public announcements.
CREATE OR REPLACE FUNCTION public.admin_set_announcement(
  p_text text,
  p_enabled boolean,
  p_level text DEFAULT 'info'::text,
  p_link text DEFAULT ''::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v jsonb;
  v_link text := btrim(coalesce(p_link, ''));
begin
  if not public.is_app_admin(auth.uid()) then raise exception 'admin required'; end if;
  if p_level not in ('info', 'warn', 'urgent') then raise exception 'invalid level'; end if;
  if length(coalesce(p_text, '')) > 500 then raise exception 'announcement too long'; end if;
  if length(v_link) > 500 then raise exception 'link too long'; end if;
  if v_link <> ''
     and v_link !~* '^https?://'
     and (left(v_link, 1) <> '/' or left(v_link, 2) = '//') then
    raise exception 'link must be an http(s) URL or a same-site path';
  end if;

  v := jsonb_build_object(
    'enabled', coalesce(p_enabled, false),
    'text', coalesce(p_text, ''),
    'level', p_level,
    'link', v_link
  );
  insert into public.app_settings(key, value, updated_at, updated_by)
  values('public_announcement', v, now(), auth.uid())
  on conflict(key) do update
    set value = excluded.value, updated_at = now(), updated_by = auth.uid();
  insert into public.admin_audit_log(admin_user_id, action, target_user_id, details)
  values(auth.uid(), 'set_announcement', null, v);
  return v;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_announcement_schedule(
  p_text text,
  p_enabled boolean,
  p_level text,
  p_link text,
  p_starts_at timestamp with time zone,
  p_ends_at timestamp with time zone
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v jsonb;
  v_link text := btrim(coalesce(p_link, ''));
begin
  if not public.is_app_admin(auth.uid()) then raise exception 'admin required'; end if;
  if p_level not in ('info', 'warn', 'urgent') then raise exception 'invalid level'; end if;
  if length(coalesce(p_text, '')) > 500 then raise exception 'announcement too long'; end if;
  if length(v_link) > 500 then raise exception 'link too long'; end if;
  if v_link <> ''
     and v_link !~* '^https?://'
     and (left(v_link, 1) <> '/' or left(v_link, 2) = '//') then
    raise exception 'link must be an http(s) URL or a same-site path';
  end if;
  if p_starts_at is not null and p_ends_at is not null and p_ends_at <= p_starts_at then
    raise exception 'end must be after start';
  end if;

  v := jsonb_build_object(
    'enabled', coalesce(p_enabled, false),
    'text', coalesce(p_text, ''),
    'level', p_level,
    'link', v_link,
    'starts_at', p_starts_at,
    'ends_at', p_ends_at
  );
  insert into public.app_settings(key, value, updated_at, updated_by)
  values('public_announcement', v, now(), auth.uid())
  on conflict(key) do update
    set value = excluded.value, updated_at = now(), updated_by = auth.uid();
  insert into public.admin_audit_log(admin_user_id, action, target_user_id, details)
  values(auth.uid(), 'schedule_announcement', null, v);
  return v;
end;
$function$;

-- Serialize role changes so two administrators cannot remove each other concurrently.
CREATE OR REPLACE FUNCTION public.admin_set_admin(p_target_user_id uuid, p_make_admin boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
begin
  perform pg_advisory_xact_lock(hashtext('korgeo_admin_role_guard'));

  if not public.is_app_admin(auth.uid()) then raise exception 'not authorized'; end if;
  if p_target_user_id = auth.uid() and not p_make_admin then
    raise exception 'cannot remove your own admin role';
  end if;
  if not p_make_admin
     and exists(select 1 from public.app_admins where user_id = p_target_user_id)
     and (select count(*) from public.app_admins) <= 1 then
    raise exception 'cannot remove the last admin role';
  end if;

  if p_make_admin then
    insert into public.app_admins(user_id, note)
    values (p_target_user_id, 'granted from admin panel')
    on conflict (user_id) do nothing;
  else
    delete from public.app_admins where user_id = p_target_user_id;
  end if;

  insert into public.admin_audit_log(admin_user_id, action, target_user_id, details)
  values (
    auth.uid(),
    case when p_make_admin then 'grant_admin' else 'revoke_admin' end,
    p_target_user_id,
    '{}'::jsonb
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_delete_user(p_target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
begin
  perform pg_advisory_xact_lock(hashtext('korgeo_admin_role_guard'));

  if not public.is_app_admin(auth.uid()) then raise exception 'not authorized'; end if;
  if p_target_user_id = auth.uid() then raise exception 'cannot delete your own account'; end if;

  -- Preserve the audit trail, but remove records that belong only to the deleted account.
  insert into public.admin_audit_log(admin_user_id, action, target_user_id, details)
  values (auth.uid(), 'delete_user', p_target_user_id, '{}'::jsonb);

  delete from public.study_progress where user_id = p_target_user_id;
  delete from public.quiz_wrong_answers where user_id = p_target_user_id;
  delete from public.app_user_controls where user_id = p_target_user_id;
  delete from public.app_admins where user_id = p_target_user_id;
  delete from auth.users where id = p_target_user_id;
end;
$function$;
