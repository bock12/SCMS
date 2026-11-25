import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

const DEVELOPMENT_PROJECT_URL = "https://fpzcwetpcwswhxmyeqzh.supabase.co";
const DEMO_ACCOUNTS = [
  { key: "super_admin", firstName: "Demo", lastName: "Super Admin", role: "super_admin", scope: "church" },
  { key: "admin", firstName: "Demo", lastName: "Administrator", role: "admin", scope: "church" },
  { key: "pastor", firstName: "Demo", lastName: "Pastor", role: "pastor", scope: "branch" },
  { key: "finance_officer", firstName: "Demo", lastName: "Finance Officer", role: "finance_officer", scope: "branch" },
  { key: "leader", firstName: "Demo", lastName: "Ministry Leader", role: "leader", scope: "branch" },
  { key: "worker", firstName: "Demo", lastName: "Church Worker", role: "worker", scope: "branch" },
  { key: "member", firstName: "Demo", lastName: "Member", role: "member", scope: "branch" },
] as const;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function keyFromEnvironment(jsonName: string, fallbackNames: string[]) {
  const encoded = Deno.env.get(jsonName);
  if (encoded) {
    try {
      const names = JSON.parse(encoded) as Record<string, string>;
      if (names.default) {
        const value = Deno.env.get(names.default);
        if (value) return value;
      }
    } catch {
      // Continue to legacy environment names below.
    }
  }
  for (const name of fallbackNames) {
    const value = Deno.env.get(name);
    if (value) return value;
  }
  return null;
}

function makePassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const random = Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
  return `Scms!${random}7a`;
}

function roleName(value: unknown): string | null {
  if (Array.isArray(value)) return typeof value[0]?.name === "string" ? value[0].name : null;
  if (value && typeof value === "object" && "name" in value) {
    return typeof (value as { name?: unknown }).name === "string"
      ? (value as { name: string }).name
      : null;
  }
  return null;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  const projectUrl = Deno.env.get("SUPABASE_URL")?.replace(/\/+$/, "");
  if (projectUrl !== DEVELOPMENT_PROJECT_URL) {
    return jsonResponse({ error: "Development demo accounts are disabled for this project." }, 404);
  }

  const authorization = request.headers.get("Authorization") || "";
  const tokenMatch = authorization.match(/^Bearer\s+(.+)$/i);
  if (!tokenMatch) return jsonResponse({ error: "A signed-in Super Admin session is required." }, 401);

  const publishableKey = keyFromEnvironment("SUPABASE_PUBLISHABLE_KEYS", [
    "SUPABASE_ANON_KEY",
    "SUPABASE_PUBLISHABLE_KEY",
  ]);
  const secretKey = keyFromEnvironment("SUPABASE_SECRET_KEYS", [
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SECRET_KEY",
  ]);
  if (!projectUrl || !publishableKey || !secretKey) {
    return jsonResponse({ error: "The development account provisioner is not configured on the server." }, 503);
  }

  const userClient = createClient(projectUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const adminClient = createClient(projectUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  try {
    const { data: authData, error: authError } = await userClient.auth.getUser(tokenMatch[1]);
    if (authError || !authData.user) {
      return jsonResponse({ error: "The signed-in session is invalid or expired." }, 401);
    }

    const { data: actor, error: actorError } = await userClient
      .from("profiles")
      .select("id,branch_id,portal_access_status,record_status")
      .eq("auth_user_id", authData.user.id)
      .maybeSingle();
    if (actorError || !actor || actor.record_status !== "active" ||
        actor.portal_access_status !== "active" || !actor.branch_id) {
      return jsonResponse({ error: "An active linked Super Admin profile is required." }, 403);
    }

    const roleReadTime = new Date().toISOString();
    const { data: assignments, error: assignmentsError } = await userClient
      .from("profile_role_assignments")
      .select("scope_type,roles(name)")
      .eq("profile_id", actor.id)
      .eq("is_active", true)
      .lte("assigned_at", roleReadTime)
      .or(`expires_at.is.null,expires_at.gt.${roleReadTime}`);
    if (assignmentsError) throw assignmentsError;
    const isChurchSuperAdmin = (assignments || []).some(
      assignment => assignment.scope_type === "church" && roleName(assignment.roles) === "super_admin"
    );
    if (!isChurchSuperAdmin) {
      return jsonResponse({ error: "Only a church-wide Super Admin can provision development demo accounts." }, 403);
    }

    const roleNames = DEMO_ACCOUNTS.map(account => account.role);
    const { data: roles, error: rolesError } = await userClient
      .from("roles")
      .select("id,name")
      .in("name", roleNames);
    if (rolesError) throw rolesError;
    const roleIdByName = new Map((roles || []).map(role => [role.name, role.id]));
    if (roleNames.some(name => !roleIdByName.has(name))) {
      throw new Error("One or more required demo roles are missing from the role catalog.");
    }

    const { data: existingAuthUsers, error: usersError } = await adminClient.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (usersError) throw usersError;
    const authUserByEmail = new Map(
      (existingAuthUsers.users || []).map(user => [user.email?.toLowerCase() || "", user])
    );

    const today = new Date().toISOString().slice(0, 10);
    const results: Array<{ email: string; name: string; role: string; password: string }> = [];

    for (const account of DEMO_ACCOUNTS) {
      const email = `demo+${account.key}@scms.test`;
      const password = makePassword();
      let profile: { id: string; auth_user_id: string | null; portal_access_status: string; record_status: string; branch_id: string | null } | null = null;

      const { data: foundProfile, error: profileLookupError } = await userClient
        .from("profiles")
        .select("id,auth_user_id,portal_access_status,record_status,branch_id")
        .eq("email", email)
        .maybeSingle();
      if (profileLookupError) throw profileLookupError;

      if (foundProfile) {
        profile = foundProfile;
        if (profile.record_status !== "active" || profile.branch_id !== actor.branch_id) {
          throw new Error(`The existing ${account.role} demo profile is not active in the current branch.`);
        }
        if (profile.portal_access_status === "suspended" || profile.portal_access_status === "archived") {
          throw new Error(`The existing ${account.role} demo profile is suspended or archived; review it before reuse.`);
        }
      } else {
        const { data: createdProfile, error: createProfileError } = await userClient.rpc(
          "create_member_profile",
          {
            p_member: {
              first_name: account.firstName,
              last_name: account.lastName,
              branch_id: actor.branch_id,
              email,
              gender: "other",
              membership_date: today,
              membership_status: "active",
              is_baptized: false,
            },
          },
        );
        if (createProfileError || !createdProfile) {
          throw createProfileError || new Error(`Unable to create the ${account.role} demo profile.`);
        }
        profile = createdProfile;
      }

      const roleId = roleIdByName.get(account.role)!;
      const { error: roleAssignmentError } = await userClient.rpc("assign_profile_role", {
        p_profile_id: profile.id,
        p_role_id: roleId,
        p_scope_type: account.scope,
        p_branch_id: account.scope === "branch" ? actor.branch_id : null,
        p_district_id: null,
      });
      if (roleAssignmentError) throw roleAssignmentError;

      let authUser = profile.auth_user_id
        ? (existingAuthUsers.users || []).find(user => user.id === profile!.auth_user_id) || null
        : authUserByEmail.get(email) || null;

      if (profile.auth_user_id && !authUser) {
        const { data: linkedUser, error: linkedUserError } = await adminClient.auth.admin.getUserById(profile.auth_user_id);
        if (linkedUserError || !linkedUser.user) {
          throw new Error(`The linked Auth identity for the ${account.role} demo profile is missing and needs reconciliation.`);
        }
        authUser = linkedUser.user;
      }

      if (!authUser) {
        const { data: createdAuthUser, error: createAuthError } = await adminClient.auth.admin.createUser({
          email,
          password,
          email_confirm: false,
          user_metadata: { first_name: account.firstName, last_name: account.lastName },
        });
        if (createAuthError || !createdAuthUser.user) {
          throw createAuthError || new Error(`Unable to create the ${account.role} demo Auth user.`);
        }
        authUser = createdAuthUser.user;
        authUserByEmail.set(email, authUser);
      } else {
        const { error: passwordError } = await adminClient.auth.admin.updateUserById(authUser.id, { password });
        if (passwordError) throw passwordError;
      }

      if (profile.portal_access_status !== "active" && authUser.email_confirmed_at) {
        // Re-trigger the database email-confirmation lifecycle when recovering
        // a partially provisioned development account.
        const { error: resetConfirmationError } = await adminClient.auth.admin.updateUserById(
          authUser.id,
          { email_confirm: false },
        );
        if (resetConfirmationError) throw resetConfirmationError;
      }

      if (!profile.auth_user_id) {
        const { error: linkError } = await adminClient.rpc("complete_member_portal_action", {
          p_actor_profile_id: actor.id,
          p_profile_id: profile.id,
          p_action: "invite",
          p_auth_user_id: authUser.id,
          p_email: email,
        });
        if (linkError) throw linkError;
      }

      const { error: confirmError } = await adminClient.auth.admin.updateUserById(authUser.id, {
        email_confirm: true,
      });
      if (confirmError) throw confirmError;

      const { data: activeProfile, error: activeProfileError } = await userClient
        .from("profiles")
        .select("portal_access_status")
        .eq("id", profile.id)
        .single();
      if (activeProfileError || activeProfile?.portal_access_status !== "active") {
        throw activeProfileError || new Error(`The ${account.role} demo account did not become active after email confirmation.`);
      }

      results.push({
        email,
        name: `${account.firstName} ${account.lastName}`,
        role: account.role,
        password,
      });
    }

    return jsonResponse({
      success: true,
      project: "SCMS-Development",
      accounts: results,
      message: "Development demo accounts are ready. Credentials are returned once and should remain in this browser session only.",
    });
  } catch (error) {
    console.error("Development demo account provisioning failed:", error instanceof Error ? error.message : "unknown error");
    return jsonResponse({
      error: error instanceof Error ? error.message : "Development demo accounts could not be provisioned.",
    }, 400);
  }
});
