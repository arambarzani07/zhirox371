#!/usr/bin/env python3
"""Prepare the V8 contractual SQL for a disposable LOCAL Supabase stack.

Supabase CLI already provisions authenticated/anon roles and auth.users/auth.uid().
Strip ONLY those bootstrap statements, never connect to a hosted project.
The remaining function bodies are unchanged from the V8 baseline.
"""
from pathlib import Path

root = Path(__file__).resolve().parents[2]
source = (root / "tests/integration/fixture.sql").read_text()
prefix = """create role authenticated nologin;
create role anon nologin;
create schema auth;
create schema retail_internal;
revoke all on schema retail_internal from public;
grant usage on schema retail_internal to authenticated;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable set search_path='' as
$$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
"""
assert source.count(prefix) == 1, "V8 fixture prefix changed; review bootstrap manually"
source = source.replace(prefix, """create schema if not exists retail_internal;
revoke all on schema retail_internal from public;
grant usage on schema retail_internal to authenticated;
""", 1)
assert "create role authenticated" not in source
assert "create schema auth;" not in source
assert "create table auth.users" not in source
print("-- Disposable Supabase local-only fixture, never for production.\n")
print(source)
