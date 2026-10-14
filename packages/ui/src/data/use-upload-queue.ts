"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError, type EntityApi } from "./api";
import { useEntityApi } from "./context";
import {
  TransientUploadError,
  createUploadQueue,
  indexedDbStore,
  type UploadQueue,
  type UploadTask,
} from "./upload-queue";

/** Jedna fronta pro celou aplikaci (fotky se nahrávají na pozadí, i když člověk přejde jinam). */
let queue: UploadQueue | null = null;
const current: { api: EntityApi | null } = { api: null };

function getQueue(): UploadQueue {
  if (queue) return queue;
  queue = createUploadQueue({
    store: indexedDbStore(),
    async upload(task) {
      const api = current.api;
      if (!api) throw new TransientUploadError("Aplikace se ještě načítá.");
      try {
        await api.uploadFile(
          task.entity,
          task.recordId,
          new File([task.blob], task.name, { type: task.blob.type || "image/jpeg" }),
          { kind: task.kind, takenAt: task.takenAt },
        );
      } catch (err) {
        if (err instanceof ApiError && err.code === "upload_retry")
          throw new TransientUploadError(err.message);
        throw err;
      }
    },
  });
  if (typeof window !== "undefined") {
    // po návratu signálu a občas v klidu zkusit odeslat, co čeká
    window.addEventListener("online", () => void queue?.retry());
    setInterval(() => void queue?.flush(), 60_000);
    void queue.flush();
  }
  return queue;
}

/** Fronta nahrávání a její aktuální obsah (pro odznak „čeká na odeslání“ a seznam v dialogu). */
export function useUploadQueue() {
  const api = useEntityApi();
  const ref = useRef(api);
  ref.current = api;
  current.api = api;
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  useEffect(() => getQueue().subscribe(setTasks), []);
  return { queue: typeof window === "undefined" ? null : getQueue(), tasks };
}
