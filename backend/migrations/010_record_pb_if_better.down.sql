-- 010_record_pb_if_better.down.sql
revoke execute on function record_pb_if_better(uuid, text, uuid, numeric, timestamptz) from authenticated;
drop function if exists record_pb_if_better(uuid, text, uuid, numeric, timestamptz);
