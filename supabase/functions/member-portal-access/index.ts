import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

type PortalAction = "invite" | "activate" | "suspend" | "revoke";

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
      const defaultName = names.default;
      if (defaultName) {
        const value = Deno.env.get(defaultName);
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

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "The portal access operation failed.";
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  const authorization = request.headers.get("Authorization") || "";
  const tokenMatch = authorization.match(/^Bearer\s+(.+)$/i);
  if (!tokenMatch) return jsonResponse({ error: "A valid signed-in session is required." }, 401);

  let body: { profileId?: string; action?: PortalAction; email?: string };
  try {
    const raw = await request.text();
    if (raw.length > 8192) return jsonResponse({ error: "Request is too large." }, 413);
    body = JSON.parse(raw);
  } catch {
    return jsonResponse({ error: "Request body must be valid JSON." }, 400);
  }

  const profileId = body.profileId?.trim() || "";
  const action = body.action;
  const email = body.email?.trim().toLowerCase() || null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(profileId)) {
    return jsonResponse({ error: "A valid member profile ID is required." }, 400);
  }
  if (!["invite", "activate", "suspend", "revoke"].includes(action || "")) {
    return jsonResponse({ error: "Unsupported portal access action." }, 400);
  }
  if (action === "invite" && (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    return jsonResponse({ error: "A valid email address is required for an invitation." }, 400);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const publishableKey = keyFromEnvironment("SUPABASE_PUBLISHABLE_KEYS", [
    "SUPABASE_ANON_KEY",
    "SUPABASE_PUBLISHABLE_KEY",
  ]);
  const secretKey = keyFromEnvironment("SUPABASE_SECRET_KEYS", [
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SECRET_KEY",
  ]);
  if (!url || !publishableKey || !secretKey) {
    console.error("Member portal function is missing required Supabase environment configuration.");
    return jsonResponse({ error: "Portal provisioning is not configured on the server." }, 503);
  }

  const userClient = createClient(url, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const adminClient = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  try {
    const { data: authData, error: authError } = await userClient.auth.getUser(tokenMatch[1]);
    if (authError || !authData.user) {
      return jsonResponse({ error: "The signed-in session is invalid or expired." }, 401);
    }

    const { data: authorizationData, error: authorizationError } = await userClient.rpc(
      "authorize_member_portal_action",
      { p_profile_id: profileId, p_action: action, p_email: action === "invite" ? email : null },
    );
    if (authorizationError) {
      return jsonResponse({ error: authorizationError.message }, 403);
    }
    const decision = authorizationData as {
      already_done?: boolean;
      actor_profile_id?: string;
      profile_id: string;
      auth_user_id?: string | null;
      email?: string | null;
      first_name?: string;
      last_name?: string;
      portal_access_status?: string;
    };
    if (decision.already_done) {
      return jsonResponse({
        alreadyDone: true,
        profile: {
          id: profileId,
          auth_user_id: decision.auth_user_id ?? null,
          portal_access_status: decision.portal_access_status,
        },
      });
    }
    if (!decision.actor_profile_id) {
      return jsonResponse({ error: "The member operation could not be authorized." }, 403);
    }

    if (action === "invite") {
      const { data: invitation, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
        decision.email || email!,
        {
          data: {
            first_name: decision.first_name || "",
            last_name: decision.last_name || "",
            church_profile_id: profileId,
          },
        },
      );
      const invitedUserId = invitation.user?.id;
      if (inviteError || !invitedUserId) {
        return jsonResponse({ error: inviteError?.message || "Supabase Auth did not return the invited user." }, 409);
      }

      const { data: completed, error: completionError } = await adminClient.rpc(
        "complete_member_portal_action",
        {
          p_actor_profile_id: decision.actor_profile_id,
          p_profile_id: profileId,
          p_action: "invite",
          p_auth_user_id: invitedUserId,
          p_email: decision.email || email,
        },
      );
      if (completionError || !completed) {
        const { error: rollbackError } = await adminClient.auth.admin.deleteUser(invitedUserId);
        if (rollbackError) console.error("Unable to remove an invitation that could not be linked:", rollbackError.message);
        return jsonResponse({ error: completionError?.message || "The invitation could not be linked to the member record." }, 409);
      }

      return jsonResponse({
        alreadyDone: false,
        invitationSent: true,
        profile: {
          id: profileId,
          auth_user_id: invitedUserId,
          email: decision.email || email,
          portal_access_status: "invited",
        },
      });
    }

    const authUserId = decision.auth_user_id;
    if (!authUserId) return jsonResponse({ error: "The member has no linked Auth identity." }, 409);

    if (action === "activate") {
      const { error: unbanError } = await adminClient.auth.admin.updateUserById(authUserId, {
        ban_duration: "none",
      });
      if (unbanError) return jsonResponse({ error: unbanError.message }, 409);

      const { data: completed, error: completionError } = await adminClient.rpc(
        "complete_member_portal_action",
        {
          p_actor_profile_id: decision.actor_profile_id,
          p_profile_id: profileId,
          p_action: "activate",
          p_auth_user_id: authUserId,
        },
      );
      if (completionError || !completed) {
        await adminClient.auth.admin.updateUserById(authUserId, { ban_duration: "876000h" });
        return jsonResponse({ error: completionError?.message || "Portal activation could not be completed." }, 409);
      }
      return jsonResponse({
        alreadyDone: false,
        profile: { id: profileId, auth_user_id: authUserId, portal_access_status: "active" },
      });
    }

    // Suspension is committed in PostgreSQL first. private.current_profile_id()
    // immediately stops resolving the suspended identity, so existing JWTs lose
    // all SCMS profile-scoped access even before the Auth ban is applied.
    const { data: suspended, error: suspendError } = await adminClient.rpc(
      "complete_member_portal_action",
      {
        p_actor_profile_id: decision.actor_profile_id,
        p_profile_id: profileId,
        p_action: "suspend",
        p_auth_user_id: authUserId,
      },
    );
    if (suspendError || !suspended) {
      return jsonResponse({ error: suspendError?.message || "Portal suspension could not be saved." }, 409);
    }

    const { data: authUserData, error: getUserError } = await adminClient.auth.admin.getUserById(authUserId);
    const authUserMissing = Boolean(
      getUserError && (
        (getUserError as any).status === 404 ||
        (getUserError as any).code === "user_not_found"
      )
    );
    if (getUserError && !authUserMissing) {
      return jsonResponse({ error: "The portal account is suspended in SCMS, but its Auth state could not be verified." }, 503);
    }

    if (action === "suspend") {
      if (authUserMissing || !authUserData?.user) {
        return jsonResponse({ error: "The portal account is suspended in SCMS, but its linked Auth identity is missing and needs reconciliation." }, 503);
      }
      if (authUserData.user) {
        const { error: banError } = await adminClient.auth.admin.updateUserById(authUserId, {
          ban_duration: "876000h",
        });
        if (banError) {
          return jsonResponse({ error: "The portal account is suspended in SCMS, but the Auth ban failed: " + banError.message }, 503);
        }
      }
      return jsonResponse({
        alreadyDone: false,
        profile: { id: profileId, auth_user_id: authUserId, portal_access_status: "suspended" },
      });
    }

    // Revoke means permanently remove the Auth identity and unlink it from the
    // member. If Auth deletion is blocked (for example, by owned Storage objects),
    // the member remains suspended and the operation can be retried after cleanup.
    if (!authUserMissing && authUserData?.user) {
      const { error: banError } = await adminClient.auth.admin.updateUserById(authUserId, {
        ban_duration: "876000h",
      });
      if (banError) {
        return jsonResponse({ error: "The portal account is suspended, but Auth revocation could not continue: " + banError.message }, 503);
      }
      const { error: deleteError } = await adminClient.auth.admin.deleteUser(authUserId);
      if (deleteError) {
        return jsonResponse({ error: "The portal account is suspended, but its Auth identity could not be deleted: " + deleteError.message }, 503);
      }
    }

    const { data: revoked, error: revokeError } = await adminClient.rpc(
      "complete_member_portal_action",
      {
        p_actor_profile_id: decision.actor_profile_id,
        p_profile_id: profileId,
        p_action: "revoke",
        p_auth_user_id: authUserId,
      },
    );
    if (revokeError || !revoked) {
      return jsonResponse({ error: revokeError?.message || "The Auth identity was removed but the member link still needs cleanup." }, 503);
    }

    return jsonResponse({
      alreadyDone: false,
      profile: { id: profileId, auth_user_id: null, portal_access_status: "not_invited" },
    });
  } catch (error) {
    console.error("Member portal access operation failed:", errorMessage(error));
    return jsonResponse({ error: "The member portal access operation could not be completed." }, 500);
  }
});
