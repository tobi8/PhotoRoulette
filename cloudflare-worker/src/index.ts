export interface Env {
  MEDIA_KV?: KVNamespace;
  MEDIA_BUCKET?: R2Bucket;
}

type ItemRecord = { id: string; url: string; type: string; userId: string; timestamp: number };

const roomSubscribers = new Map<string, Set<ReadableStreamDefaultController>>();
const uploadedMemoryStore = new Map<string, Array<ItemRecord>>();
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

function detectMime(fileName: string, declaredType: string | undefined, isVideo: boolean): string {
  const extension = (fileName.split(".").pop() || "jpg").toLowerCase();
  if (declaredType && declaredType !== "application/octet-stream") return declaredType;
  if (isVideo) return extension === "mov" ? "video/quicktime" : "video/mp4";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "heic") return "image/heic";
  if (extension === "heif") return "image/heif";
  return "image/jpeg";
}

function isVideoFile(declaredType: string | undefined, fieldName: string, fileName: string): boolean {
  return !!(
    declaredType?.startsWith("video/") ||
    fieldName.toLowerCase().includes("video") ||
    /\.(mp4|mov|m4v|webm|avi|mkv)$/i.test(fileName)
  );
}

function cleanParam(val: string | null): string | null {
  if (!val) return null;
  val = val.trim();
  if (val.includes("?")) {
    val = val.split("?")[0];
  }
  return val;
}

async function storeFile(
  env: Env,
  storageKey: string,
  arrayBuf: ArrayBuffer,
  mime: string,
  roomId: string,
  userId: string,
  isVideo: boolean,
): Promise<void> {
  // Only keep in memory if KV is not available (avoids worker OOM)
  if (!env.MEDIA_KV && !env.MEDIA_BUCKET) {
    fileMemoryStore.set(storageKey, { bytes: arrayBuf, mime });
  }

  if (env.MEDIA_KV) {
    try {
      await env.MEDIA_KV.put(`file:${storageKey}`, arrayBuf, {
        metadata: { mime, roomId, userId, type: isVideo ? "video" : "image" },
        expirationTtl: 86400,
      });
    } catch (e) {
      fileMemoryStore.set(storageKey, { bytes: arrayBuf, mime });
    }
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
}

function appendToRoom(roomId: string, item: ItemRecord): void {
  if (!uploadedMemoryStore.has(roomId)) {
    uploadedMemoryStore.set(roomId, []);
  }
  uploadedMemoryStore.get(roomId)!.push(item);
}

async function persistRoomManifest(env: Env, roomId: string, userId: string, newItems: ItemRecord[]): Promise<void> {
  if (!env.MEDIA_KV || newItems.length === 0) return;
  try {
    const roomKey = `room:${roomId}`;
    const existingRaw = await env.MEDIA_KV.get(roomKey, "json");
    const existingItems: Array<any> = Array.isArray(existingRaw) ? (existingRaw as any[]) : [];
    const merged = [...existingItems.filter((i: any) => i.userId !== userId), ...newItems];
    await env.MEDIA_KV.put(roomKey, JSON.stringify(merged), {
      expirationTtl: 86400,
    });
  } catch {}
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

      let allRoomItems: Array<ItemRecord> = [];

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

    // ─── Single-file upload (for iOS Shortcuts) ─────────────────────────
    // POST /upload-single?room=X&userId=Y&index=N&total=T
    // Accepts one file per request to stay within Worker CPU/size limits.
    if (request.method === "POST" && url.pathname === "/upload-single") {
      let roomId = url.searchParams.get("room") || url.searchParams.get("roomId");
      let userId = url.searchParams.get("userId") || "anonymous";
      const index = parseInt(url.searchParams.get("index") || "0", 10);
      const total = parseInt(url.searchParams.get("total") || "1", 10);

      const contentType = request.headers.get("content-type") || "";

      let arrayBuf: ArrayBuffer;
      let fileName = "photo.jpg";
      let declaredType: string | undefined;
      let fieldName = "file";

      if (contentType.includes("multipart/form-data")) {
        const formData = await request.formData();
        if (!roomId) {
          roomId = (formData.get("room") as string) || (formData.get("roomId") as string) || null;
        }
        if (userId === "anonymous") {
          const formUserId = formData.get("userId") as string;
          if (formUserId) userId = formUserId;
        }

        let fileObj: File | null = null;
        for (const [key, value] of formData.entries()) {
          if (value && typeof value === "object" && typeof (value as any).arrayBuffer === "function") {
            fileObj = value as File;
            fieldName = key;
            break;
          }
        }

        if (!fileObj) {
          return new Response(JSON.stringify({ error: "No file found in form data" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        arrayBuf = await fileObj.arrayBuffer();
        fileName = fileObj.name || fileName;
        declaredType = fileObj.type;
      } else {
        // Raw body upload with Content-Type header
        arrayBuf = await request.arrayBuffer();
        declaredType = contentType || undefined;
        const ext = declaredType?.startsWith("video/") ? "mp4" : "jpg";
        fileName = `upload_${index}.${ext}`;
      }

      if (!roomId) {
        return new Response(JSON.stringify({ error: "Missing room parameter" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (arrayBuf.byteLength === 0) {
        return new Response(JSON.stringify({ error: "Empty file" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Reject files larger than 10MB to stay within KV limits
      if (arrayBuf.byteLength > 10 * 1024 * 1024) {
        return new Response(JSON.stringify({ error: "File too large (max 10MB)" }), {
          status: 413,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const isVideo = isVideoFile(declaredType, fieldName, fileName);
      const extension = (fileName.split(".").pop() || "jpg").toLowerCase();
      const fileId = `${crypto.randomUUID()}.${extension}`;
      const storageKey = `${roomId}/${fileId}`;
      const mime = detectMime(fileName, declaredType, isVideo);

      await storeFile(env, storageKey, arrayBuf, mime, roomId, userId, isVideo);

      const itemRecord: ItemRecord = {
        id: fileId,
        url: `${url.origin}/media/${storageKey}`,
        type: isVideo ? "video" : "image",
        userId,
        timestamp: Date.now(),
      };

      appendToRoom(roomId, itemRecord);
      await persistRoomManifest(env, roomId, userId, uploadedMemoryStore.get(roomId) || [itemRecord]);

      // Broadcast SSE on every file so the frontend can show progress,
      // but mark the last one so the UI knows the batch is complete.
      const isLast = index >= total - 1;
      broadcastToRoom(roomId, {
        type: isLast ? "MEDIA_UPLOADED" : "MEDIA_PROGRESS",
        roomId,
        userId,
        index,
        total,
        item: itemRecord,
      });

      const remaining = Math.max(0, total - index - 1);
      return new Response(
        JSON.stringify({ success: true, item: itemRecord, index, total, remaining }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ─── Batch upload (for Android / legacy) ────────────────────────────
    // ─── Batch upload (for iOS Shortcut / Android) ─────────────────────
    if (request.method === "POST" && url.pathname === "/upload") {
      let roomId = cleanParam(url.searchParams.get("room") || url.searchParams.get("roomId"));
      let userId = cleanParam(url.searchParams.get("userId"));

      const contentType = request.headers.get("content-type") || "";
      if (!contentType.includes("multipart/form-data")) {
        return new Response(JSON.stringify({ error: "Expected multipart/form-data" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const formData = await request.formData();
      if (!roomId) {
        roomId = cleanParam((formData.get("room") as string) || (formData.get("roomId") as string) || null);
      }
      if (!userId) {
        userId = cleanParam((formData.get("userId") as string) || "anonymous");
      }

      if (!roomId) {
        return new Response(JSON.stringify({ error: "Missing room parameter" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const fileTasks: Array<Promise<ItemRecord | null>> = [];

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
          const isVideo = isVideoFile(fileObj.type, fieldName, fileName);
          const mime = detectMime(fileName, fileObj.type, isVideo);

          fileTasks.push(
            (async () => {
              try {
                const arrayBuf = await fileObj!.arrayBuffer();
                if (arrayBuf.byteLength === 0) return null;
                if (arrayBuf.byteLength > 25 * 1024 * 1024) return null;

                await storeFile(env, storageKey, arrayBuf, mime, roomId!, userId!, isVideo);

                const itemRecord: ItemRecord = {
                  id: fileId,
                  url: `${url.origin}/media/${storageKey}`,
                  type: isVideo ? "video" : "image",
                  userId: userId!,
                  timestamp: Date.now(),
                };
                return itemRecord;
              } catch (e) {
                console.error("Failed to store file:", e);
                return null;
              }
            })()
          );
        }
      }

      const results = await Promise.all(fileTasks);
      const uploadedItems: Array<ItemRecord> = results.filter((item): item is ItemRecord => item !== null);

      for (const item of uploadedItems) {
        appendToRoom(roomId, item);
      }

      if (uploadedItems.length > 0) {
        await persistRoomManifest(env, roomId, userId, uploadedMemoryStore.get(roomId) || uploadedItems);

        broadcastToRoom(roomId, {
          type: "MEDIA_UPLOADED",
          roomId,
          userId,
          items: uploadedItems,
        });
      }

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

