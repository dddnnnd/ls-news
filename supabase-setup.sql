DROP FUNCTION IF EXISTS public.lsn_admin_list_users();

CREATE FUNCTION public.lsn_admin_list_users()
RETURNS TABLE (
  user_id uuid,
  username text,
  email text,
  full_name text,
  role text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id AS user_id,
    p.username,
    p.email,
    COALESCE(NULLIF(p.username, ''), p.email, p.user_id_code) AS full_name,
    CASE
      WHEN p.role IN ('admin', 'leader', 'deputy', 'moderator') THEN 'moderator'
      WHEN p.role = 'journalist' THEN 'journalist'
      ELSE 'editor'
    END AS role
  FROM public.profiles p
  WHERE EXISTS (
    SELECT 1
    FROM public.profiles me
    WHERE me.id = auth.uid()
      AND me.role IN ('admin', 'leader', 'deputy', 'moderator')
  )
  ORDER BY p.created_at ASC;
$$;