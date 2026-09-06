insert into public.role_capabilities(role,capability,allowed) values
 ('manager','manage_team',true),
 ('manager','manage_pricing',true),
 ('manager','manage_finance',true),
 ('manager','dispatch_jobs',true),
 ('dispatcher','manage_team',false),
 ('dispatcher','manage_pricing',false),
 ('dispatcher','manage_finance',false),
 ('engineer','manage_team',false),
 ('engineer','manage_pricing',false),
 ('engineer','manage_finance',false),
 ('apprentice','manage_team',false),
 ('apprentice','manage_pricing',false),
 ('apprentice','manage_finance',false),
 ('member','manage_team',false),
 ('member','manage_pricing',false),
 ('member','manage_finance',false),
 ('member','dispatch_jobs',false)
on conflict (role,capability) do update set allowed=excluded.allowed;
