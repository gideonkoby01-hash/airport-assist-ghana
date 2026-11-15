import React, { useEffect, useRef, useState } from "react";

/** Sets the --d CSS variable (a delay in ms) that the motion styles read. */
export const delayStyle = (ms) => /** @type {any} */ ({ "--d": `${ms}ms` });

/** Props that hide a collapsed block from keyboard and screen readers (`inert` is not in React's types yet). */
export const inertWhen = (collapsed) => /** @type {any} */ (collapsed ? { inert: "" } : {});

// Lets a block rise into place the first time it scrolls into view. `delay` (ms) staggers siblings.
// Without IntersectionObserver the block is simply shown.
/** @param {any} props */
export default function Reveal({ as: Tag = "div", delay = 0, className = "", children, ...rest }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(typeof IntersectionObserver === "undefined");

  useEffect(() => {
    const node = ref.current;
    if (!node || shown) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [shown]);

  return (
    <Tag ref={ref} data-reveal data-in={shown ? "true" : "false"} style={delayStyle(delay)} className={className} {...rest}>
      {children}
    </Tag>
  );
}
