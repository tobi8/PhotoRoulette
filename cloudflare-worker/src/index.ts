export interface Env {
  MEDIA_BUCKET: R2Bucket;
}

const roomSubscribers = new Map<string, Set<ReadableStreamDefaultController>>();
const uploadedMemoryStore = new Map<string, Array<{ id: string; url: string; type: string; userId: string; timestamp: number }>>();

function broadcastToRoom(roomId: string, message: object) {
  const subscribers = roomSubscribers.get(roomId);
  if (!subscribers) return;
  const payload = `data: ${JSON.stringify(message)}\n\n`;
  const encoded = new TextEncoder().encode(payload);
  for (const controller of subscribers) {
    try {
      controller.enqueue(encoded);
    } catch {
      subscribers.delete(controller);
    }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "*";

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    const corsHeaders = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (request.method === "GET" && url.pathname === "/events") {
      const roomId = url.searchParams.get("room");
      if (!roomId) {
        return new Response(JSON.stringify({ error: "Missing room parameter" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let clientController: ReadableStreamDefaultController;
      const stream = new ReadableStream({
        start(controller) {
          clientController = controller;
          if (!roomSubscribers.has(roomId)) {
            roomSubscribers.set(roomId, new Set());
          }
          roomSubscribers.get(roomId)!.add(controller);
          controller.enqueue(new TextEncoder().encode(`data: {"type":"CONNECTED","roomId":"${roomId}"}\n\n`));
        },
        cancel() {
          if (roomSubscribers.has(roomId)) {
            roomSubscribers.get(roomId)!.delete(clientController);
          }
        },
      });

      return new Response(stream, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    }

    if (request.method === "GET" && url.pathname === "/media") {
      const roomId = url.searchParams.get("room");
      const userId = url.searchParams.get("userId");
      if (!roomId) {
        return new Response(JSON.stringify({ error: "Missing room parameter" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const allRoomItems = uploadedMemoryStore.get(roomId) || [];
      const filtered = userId ? allRoomItems.filter((i) => i.userId === userId) : allRoomItems;

      return new Response(JSON.stringify({ items: filtered }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (request.method === "GET" && url.pathname.startsWith("/media/")) {
      const key = decodeURIComponent(url.pathname.replace(/^\/media\//, ""));
      if (!env.MEDIA_BUCKET) {
        return new Response("Bucket not configured", { status: 500, headers: corsHeaders });
      }

      const object = await env.MEDIA_BUCKET.get(key);
      if (!object) {
        return new Response("Not found", { status: 404, headers: corsHeaders });
      }

      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("Access-Control-Allow-Origin", origin);
      headers.set("Cache-Control", "public, max-age=86400");
      return new Response(object.body, { headers });
    }

    if (request.method === "POST" && url.pathname === "/upload") {
      const roomId = url.searchParams.get("room");
      const userId = url.searchParams.get("userId") || "anonymous";

      if (!roomId) {
        return new Response(JSON.stringify({ error: "Missing room parameter" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const contentType = request.headers.get("content-type") || "";
      if (!contentType.includes("multipart/form-data")) {
        return new Response(JSON.stringify({ error: "Expected multipart/form-data" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const formData = await request.formData();
      const uploadedItems: Array<{ id: string; url: string; type: string; userId: string; timestamp: number }> = [];

      for (const [fieldName, value] of formData.entries()) {
        if (value instanceof File) {
          const file = value;
          const extension = file.name.split(".").pop() || "bin";
          const fileId = `${crypto.randomUUID()}.${extension}`;
          const storageKey = `${roomId}/${fileId}`;
          const isVideo = file.type.startsWith("video/") || fieldName.toLowerCase().includes("video") || /\.(mp4|mov|m4v|webm|avi|mkv)$/i.test(file.name);

          if (env.MEDIA_BUCKET) {
            await env.MEDIA_BUCKET.put(storageKey, file.stream(), {
              httpMetadata: {
                contentType: file.type || (isVideo ? "video/mp4" : "image/jpeg"),
              },
              customMetadata: {
                roomId,
                userId,
                uploadedAt: Date.now().toString(),
              },
            });
          }

          const itemRecord = {
            id: fileId,
            url: `${url.origin}/media/${storageKey}`,
            type: isVideo ? "video" : "image",
            userId,
            timestamp: Date.now(),
          };

          uploadedItems.push(itemRecord);

          if (!uploadedMemoryStore.has(roomId)) {
            uploadedMemoryStore.set(roomId, []);
          }
          uploadedMemoryStore.get(roomId)!.push(itemRecord);
        }
      }

      broadcastToRoom(roomId, {
        type: "MEDIA_UPLOADED",
        roomId,
        userId,
        items: uploadedItems,
      });

      return new Response(
        JSON.stringify({ success: true, count: uploadedItems.length, items: uploadedItems }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(JSON.stringify({ status: "PhotoRoulette Worker Ready" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  },
};
