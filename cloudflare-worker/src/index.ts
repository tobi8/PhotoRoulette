export interface Env {
  MEDIA_KV?: KVNamespace;
  MEDIA_BUCKET?: R2Bucket;
}

const roomSubscribers = new Map<string, Set<ReadableStreamDefaultController>>();
const uploadedMemoryStore = new Map<string, Array<{ id: string; url: string; type: string; userId: string; timestamp: number }>>();
const fileMemoryStore = new Map<string, { bytes: ArrayBuffer; mime: string }>();

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

    const corsHeaders = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: corsHeaders,
      });
    }

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

      let allRoomItems: Array<{ id: string; url: string; type: string; userId: string; timestamp: number }> = [];

      if (env.MEDIA_KV) {
        try {
          const kvData = await env.MEDIA_KV.get(`room:${roomId}`, "json");
          if (Array.isArray(kvData)) {
            allRoomItems = kvData as any[];
          }
        } catch {}
      }

      if (allRoomItems.length === 0) {
        allRoomItems = uploadedMemoryStore.get(roomId) || [];
      }

      const cleanUserId = (userId || "").trim().toLowerCase();
      const userFiltered = cleanUserId
        ? allRoomItems.filter((i) => (i.userId || "").trim().toLowerCase() === cleanUserId)
        : allRoomItems;
      const filtered = userFiltered.length > 0 ? userFiltered : allRoomItems;

      return new Response(JSON.stringify({ items: filtered }), {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      });
    }

    if ((request.method === "GET" || request.method === "HEAD") && url.pathname.startsWith("/media/")) {
      const key = decodeURIComponent(url.pathname.replace(/^\/media\//, ""));

      if (env.MEDIA_KV) {
        try {
          const { value, metadata } = await env.MEDIA_KV.getWithMetadata<{ mime: string }>(`file:${key}`, "arrayBuffer");
          if (value) {
            const mime = metadata?.mime || "image/jpeg";
            return new Response(request.method === "HEAD" ? null : value, {
              headers: {
                ...corsHeaders,
                "Content-Type": mime,
                "Cache-Control": "public, max-age=86400",
              },
            });
          }
        } catch {}
      }

      if (env.MEDIA_BUCKET) {
        try {
          const object = await env.MEDIA_BUCKET.get(key);
          if (object) {
            const headers = new Headers();
            object.writeHttpMetadata(headers);
            headers.set("Access-Control-Allow-Origin", origin);
            headers.set("Cache-Control", "public, max-age=86400");
            return new Response(object.body, { headers });
          }
        } catch {}
      }

      const memFile = fileMemoryStore.get(key);
      if (memFile) {
        return new Response(memFile.bytes, {
          headers: {
            ...corsHeaders,
            "Content-Type": memFile.mime,
            "Cache-Control": "public, max-age=86400",
          },
        });
      }

      return new Response("Not found", { status: 404, headers: corsHeaders });
    }

    if (request.method === "POST" && url.pathname === "/upload") {
      let roomId = url.searchParams.get("room") || url.searchParams.get("roomId");
      let userId = url.searchParams.get("userId");

      const contentType = request.headers.get("content-type") || "";
      if (!contentType.includes("multipart/form-data")) {
        return new Response(JSON.stringify({ error: "Expected multipart/form-data" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const formData = await request.formData();
      if (!roomId) {
        roomId = (formData.get("room") as string) || (formData.get("roomId") as string) || null;
      }
      if (!userId) {
        userId = (formData.get("userId") as string) || "anonymous";
      }

      if (!roomId) {
        return new Response(JSON.stringify({ error: "Missing room parameter" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const uploadedItems: Array<{ id: string; url: string; type: string; userId: string; timestamp: number }> = [];

      for (const [fieldName, value] of formData.entries()) {
        let fileObj: { arrayBuffer: () => Promise<ArrayBuffer>; name?: string; type?: string } | null = null;
        if (value && typeof value === "object" && typeof (value as any).arrayBuffer === "function") {
          fileObj = value as any;
        }

        if (fileObj) {
          const fileName = fileObj.name || `${fieldName}.jpg`;
          const extension = (fileName.split(".").pop() || "jpg").toLowerCase();
          const fileId = `${crypto.randomUUID()}.${extension}`;
          const storageKey = `${roomId}/${fileId}`;
          const isVideo =
            fileObj.type?.startsWith("video/") ||
            fieldName.toLowerCase().includes("video") ||
            /\.(mp4|mov|m4v|webm|avi|mkv)$/i.test(fileName);

          let mime = fileObj.type;
          if (!mime || mime === "application/octet-stream") {
            if (isVideo) {
              mime = extension === "mov" ? "video/quicktime" : "video/mp4";
            } else if (extension === "png") {
              mime = "image/png";
            } else if (extension === "webp") {
              mime = "image/webp";
            } else if (extension === "heic") {
              mime = "image/heic";
            } else if (extension === "heif") {
              mime = "image/heif";
            } else {
              mime = "image/jpeg";
            }
          }

          const arrayBuf = await fileObj.arrayBuffer();
          if (arrayBuf.byteLength === 0) continue;

          fileMemoryStore.set(storageKey, { bytes: arrayBuf, mime });

          if (env.MEDIA_KV) {
            try {
              await env.MEDIA_KV.put(`file:${storageKey}`, arrayBuf, {
                metadata: { mime, roomId, userId, type: isVideo ? "video" : "image" },
                expirationTtl: 86400,
              });
            } catch {}
          }

          if (env.MEDIA_BUCKET) {
            try {
              await env.MEDIA_BUCKET.put(storageKey, arrayBuf, {
                httpMetadata: { contentType: mime },
                customMetadata: {
                  roomId,
                  userId,
                  uploadedAt: Date.now().toString(),
                },
              });
            } catch {}
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

      if (env.MEDIA_KV && uploadedItems.length > 0) {
        try {
          const roomKey = `room:${roomId}`;
          const existingRaw = await env.MEDIA_KV.get(roomKey, "json");
          const existingItems: Array<any> = Array.isArray(existingRaw) ? (existingRaw as any[]) : [];
          const merged = [...existingItems.filter((i: any) => i.userId !== userId), ...uploadedItems];
          await env.MEDIA_KV.put(roomKey, JSON.stringify(merged), {
            expirationTtl: 86400,
          });
        } catch {}
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
