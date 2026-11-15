import { useEffect, useState } from "react";
import { api } from "@/api/db";

/**
 * Resolves a private file URI to a short-lived signed URL.
 * Shared by the photo thumbnail, the full-image viewer and the profile dialog.
 */
export default function useSignedFileUrl(fileUri) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setUrl(null);
    setFailed(false);
    if (!fileUri) return undefined;

    api.storage.createFileSignedUrl({ file_uri: fileUri })
      .then((res) => {
        if (active) setUrl(res?.signed_url || null);
      })
      .catch(() => {
        if (active) setFailed(true);
      });

    return () => {
      active = false;
    };
  }, [fileUri]);

  return { url, failed, hasPhoto: !!fileUri && !!url && !failed };
}