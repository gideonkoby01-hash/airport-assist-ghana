import { useEffect, useState } from "react";

/** The id of the section that is currently across the middle of the screen, or "" near the top of the page. */
export function useActiveSection(ids) {
  const [active, setActive] = useState("");
  const key = ids.join("|");
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
      },
      { rootMargin: "-45% 0px -50% 0px" }
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    const onScroll = () => window.scrollY < 120 && setActive("");
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, [key]);
  return active;
}
