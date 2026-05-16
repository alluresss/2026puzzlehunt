const DATABASE_KEY = "database";
const EMPTY_DATABASE = { version: 1, users: {}, publicHints: [] };

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Accept",
      "Content-Type": "application/json; charset=utf-8",
      ...(init.headers || {}),
    },
  });
}

function cleanDatabase(database) {
  return {
    version: 1,
    users: database?.users && typeof database.users === "object" ? database.users : {},
    publicHints: Array.isArray(database?.publicHints) ? database.publicHints : [],
  };
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === "OPTIONS") return jsonResponse({ ok: true });
  if (!env.PUZZLE_HUNT_KV) return jsonResponse({ error: "Missing PUZZLE_HUNT_KV binding" }, { status: 500 });

  if (request.method === "GET") {
    const stored = await env.PUZZLE_HUNT_KV.get(DATABASE_KEY, { type: "json" });
    return jsonResponse(stored || EMPTY_DATABASE);
  }

  if (request.method === "PUT") {
    const database = await request.json().catch(() => null);
    if (!database || typeof database !== "object") {
      return jsonResponse({ error: "Invalid database JSON" }, { status: 400 });
    }

    const cleaned = cleanDatabase(database);
    await env.PUZZLE_HUNT_KV.put(DATABASE_KEY, JSON.stringify(cleaned));
    return jsonResponse(cleaned);
  }

  return jsonResponse({ error: "Method not allowed" }, { status: 405 });
}
