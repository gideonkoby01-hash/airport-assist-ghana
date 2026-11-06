import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";

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

    base44.integrations.Core.CreateFileSignedUrl({ file_uri: fileUri })
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