import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Users, X, ZoomIn, ZoomOut } from "lucide-react";

/**
 * Displays the passenger identification photo stored against a booking.
 * - Resolves the private file_uri to a short-lived signed URL via the platform's
 *   secure file access method (CreateFileSignedUrl).
 * - Shows a clickable thumbnail that opens a full-size lightbox with zoom.
 * - Renders an explicit placeholder when no photo exists or the image fails to load.
 */
export default function PassengerPhoto({ fileUri }) {
  const [signedUrl, setSignedUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [natural, setNatural] = useState({ w: 0, h: 0 });

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(false);
    setSignedUrl(null);
    if (!fileUri) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({
          file_uri: fileUri,
        });
        if (active) setSignedUrl(signed_url);
      } catch {
        if (active) setLoadError(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [fileUri]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const openLightbox = () => {
    setZoom(1);
    setOpen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center text-muted-foreground text-sm">
        <div className="w-4 h-4 border-2 border-muted border-t-primary rounded-full animate-spin mr-2" />
        Loading photo…
      </div>
    );
  }

  if (loadError || !signedUrl) {
    return (
      <div className="flex items-center gap-3 text-muted-foreground text-sm">
        <div className="w-16 h-16 rounded-xl border border-dashed border-border flex items-center justify-center">
          <Users className="w-6 h-6" />
        </div>
        Photo unavailable
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={openLightbox}
        className="group relative block rounded-xl overflow-hidden border border-border hover:border-accent transition-colors"
        title="Click to view full-size photo"
      >
        <img
          src={signedUrl}
          alt="Passenger identification"
          className="w-40 h-40 object-cover"
          onError={() => setLoadError(true)}
        />
        <span className="absolute inset-0 bg-black/0 group-hover:bg-black/30 flex items-center justify-center transition">
          <ZoomIn className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition" />
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute -top-3 -right-3 z-10 w-10 h-10 rounded-full bg-white text-black flex items-center justify-center shadow-lg hover:bg-muted"
              title="Close (Esc)"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="overflow-auto max-w-[90vw] max-h-[82vh] rounded-lg">
              <img
                src={signedUrl}
                alt="Passenger identification (full size)"
                onLoad={(e) =>
                  setNatural({
                    w: e.target.naturalWidth,
                    h: e.target.naturalHeight,
                  })
                }
                onClick={() =>
                  setZoom((z) => (z >= 2 ? 1 : Math.min(3, +(z + 0.5).toFixed(1))))
                }
                className="object-contain cursor-zoom-in select-none"
                style={
                  zoom === 1
                    ? { maxWidth: "90vw", maxHeight: "82vh", width: "auto", height: "auto" }
                    : {
                        width: natural.w ? natural.w * zoom : "auto",
                        height: natural.h ? natural.h * zoom : "auto",
                        maxWidth: "none",
                        maxHeight: "none",
                      }
                }
              />
            </div>

            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(1, +(z - 0.5).toFixed(1)))}
                className="w-9 h-9 rounded-full bg-white/10 text-white hover:bg-white/20 flex items-center justify-center"
                title="Zoom out"
              >
                <ZoomOut className="w-5 h-5" />
              </button>
              <span className="text-white text-xs w-12 text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(3, +(z + 0.5).toFixed(1)))}
                className="w-9 h-9 rounded-full bg-white/10 text-white hover:bg-white/20 flex items-center justify-center"
                title="Zoom in"
              >
                <ZoomIn className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}