-- Migration 005: Add DELETE and UPDATE RLS policies on personal_bests.
--
-- Phase 2 added a soft-delete cleanup in delete_solve() that runs
-- DELETE on personal_bests via the user-scoped Supabase client. With no
-- DELETE policy, RLS silently blocks the operation (PostgREST returns
-- "0 rows" without raising), leaving orphan PB rows whenever a
-- PB-holding solve is deleted.
--
-- The UPDATE policy is added now as defense-in-depth so future code
-- that updates PBs does not hit the same silent-failure trap.

DROP POLICY IF EXISTS "Users can delete own personal bests" ON personal_bests;
CREATE POLICY "Users can delete own personal bests"
    ON personal_bests
    FOR DELETE
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own personal bests" ON personal_bests;
CREATE POLICY "Users can update own personal bests"
    ON personal_bests
    FOR UPDATE
    USING (auth.uid() = user_id);
