const { ApiError } = require("./errors");
const { constantEqual } = require("./security");
function createAuth({
  pool,
  security,
  discord,
  clientId,
  webUrl,
  sessionDays = 7,
  logger,
}) {
  const origin = new URL(webUrl).origin;
  const secure = origin.startsWith("https:");
  const cookieName = secure ? "__Host-kagetsu_session" : "kagetsu_session";
  const stateCookie = secure ? "__Host-kagetsu_oauth" : "kagetsu_oauth";
  const cookieOptions = { httpOnly: true, secure, sameSite: "lax", path: "/" };
  const refreshing = new Map();
  async function load(req, res, next) {
    try {
      const sessionId = req.cookies[cookieName];
      if (!sessionId || !/^[a-zA-Z0-9_-]{43}$/.test(sessionId)) return next();
      const result = await pool.query(
        "SELECT id_hash,user_id,user_data,encrypted_tokens,expires_at FROM sessions WHERE id_hash=$1 AND expires_at>NOW()",
        [security.hash(sessionId)],
      );
      if (!result.rows.length) {
        res.clearCookie(cookieName, cookieOptions);
        return next();
      }
      req.auth = { ...result.rows[0], sessionId };
      next();
    } catch (error) {
      next(error);
    }
  }
  function required(req, res, next) {
    if (!req.auth)
      return next(
        new ApiError(
          401,
          "AUTH_REQUIRED",
          "Entre com o Discord para continuar.",
        ),
      );
    next();
  }
  async function accessToken(auth) {
    let tokens = security.decrypt(auth.encrypted_tokens);
    if (tokens.expires_at > Date.now() + 60000) return tokens.access_token;
    if (!refreshing.has(auth.id_hash))
      refreshing.set(
        auth.id_hash,
        (async () => {
          // The lock also serializes refresh-token rotation across API instances.
          const connection = await pool.connect();
          try {
            await connection.query("BEGIN");
            const result = await connection.query(
              "SELECT encrypted_tokens FROM sessions WHERE id_hash=$1 AND expires_at>NOW() FOR UPDATE",
              [auth.id_hash],
            );
            if (!result.rows.length)
              throw new ApiError(401, "AUTH_REQUIRED", "Sua sessão expirou.");
            let current = security.decrypt(result.rows[0].encrypted_tokens);
            if (current.expires_at <= Date.now() + 60000) {
              current = await discord.refresh(current.refresh_token);
              await connection.query(
                "UPDATE sessions SET encrypted_tokens=$2 WHERE id_hash=$1",
                [auth.id_hash, security.encrypt(current)],
              );
            }
            await connection.query("COMMIT");
            return current;
          } catch (error) {
            await connection.query("ROLLBACK").catch(() => {});
            throw error;
          } finally {
            connection.release();
          }
        })().finally(() => refreshing.delete(auth.id_hash)),
      );
    try {
      tokens = await refreshing.get(auth.id_hash);
      auth.encrypted_tokens = security.encrypt(tokens);
      return tokens.access_token;
    } catch (error) {
      if (error.status === 401) {
        await pool.query("DELETE FROM sessions WHERE id_hash=$1", [
          auth.id_hash,
        ]);
        throw new ApiError(
          401,
          "AUTH_EXPIRED",
          "Entre novamente com o Discord.",
        );
      }
      throw error;
    }
  }
  async function login(req, res) {
    if (!clientId)
      throw new ApiError(
        503,
        "OAUTH_NOT_CONFIGURED",
        "OAuth do Discord ainda não configurado.",
      );
    const state = security.random();
    await pool.query(
      "INSERT INTO oauth_states(state_hash,expires_at) VALUES($1,NOW()+INTERVAL '10 minutes')",
      [security.hash(state)],
    );
    res.cookie(stateCookie, state, { ...cookieOptions, maxAge: 600000 });
    const query = new URLSearchParams({
      client_id: clientId,
      redirect_uri: `${origin}/api/auth/callback`,
      response_type: "code",
      scope: "identify guilds",
      state,
    });
    res.redirect(`https://discord.com/oauth2/authorize?${query}`);
  }
  async function callback(req, res) {
    const state = req.query.state,
      code = req.query.code;
    res.clearCookie(stateCookie, cookieOptions);
    if (
      typeof state !== "string" ||
      !/^[\w-]{43}$/.test(state) ||
      !constantEqual(req.cookies[stateCookie], state) ||
      typeof code !== "string" ||
      code.length > 512
    )
      throw new ApiError(
        400,
        "OAUTH_STATE",
        "Autorização expirada. Inicie o login novamente.",
      );
    const consumed = await pool.query(
      "DELETE FROM oauth_states WHERE state_hash=$1 AND expires_at>NOW() RETURNING state_hash",
      [security.hash(state)],
    );
    if (!consumed.rows.length)
      throw new ApiError(
        400,
        "OAUTH_STATE",
        "Esta autorização já foi usada ou expirou.",
      );
    const tokens = await discord.exchange(code),
      user = await discord.user(tokens.access_token);
    if (typeof user.id !== "string")
      throw new ApiError(502, "OAUTH_USER", "Resposta inválida do Discord.");
    const safeUser = {
      id: user.id,
      username: user.username,
      globalName: user.global_name || user.username,
      avatar: user.avatar,
    };
    const sessionId = security.random();
    await pool.query(
      "INSERT INTO sessions(id_hash,user_id,user_data,encrypted_tokens,expires_at) VALUES($1,$2,$3,$4,NOW()+$5*INTERVAL '1 day')",
      [
        security.hash(sessionId),
        user.id,
        safeUser,
        security.encrypt(tokens),
        sessionDays,
      ],
    );
    const old = req.cookies[cookieName];
    if (old)
      await pool.query("DELETE FROM sessions WHERE id_hash=$1", [
        security.hash(old),
      ]);
    res.cookie(cookieName, sessionId, {
      ...cookieOptions,
      maxAge: sessionDays * 86400000,
    });
    res.redirect(`${origin}/guilds`);
  }
  async function logout(req, res) {
    await pool.query("DELETE FROM sessions WHERE id_hash=$1", [
      req.auth.id_hash,
    ]);
    res.clearCookie(cookieName, cookieOptions);
    try {
      await discord.revoke(
        security.decrypt(req.auth.encrypted_tokens).access_token,
      );
    } catch {
      logger?.warn(
        { event: "oauth_revoke_failed" },
        "Sessão local encerrada; revogação remota indisponível.",
      );
    }
    res.status(204).end();
  }
  async function cleanup() {
    await pool.query("DELETE FROM oauth_states WHERE expires_at<NOW()");
    await pool.query("DELETE FROM sessions WHERE expires_at<NOW()");
  }
  return {
    load,
    required,
    accessToken,
    login,
    callback,
    logout,
    cleanup,
    cookieName,
    cookieOptions,
  };
}
module.exports = { createAuth };
