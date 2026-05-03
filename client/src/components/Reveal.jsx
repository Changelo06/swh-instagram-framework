import { useEffect, useRef, useState } from "react";

export default function Reveal({
  as: Tag = "div",
  className = "",
  children,
  threshold = 0.15,
  delay = 0,
  ...rest
}) {
  const ref = useRef(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setRevealed(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            if (delay) {
              const t = setTimeout(() => setRevealed(true), delay);
              observer.disconnect();
              return () => clearTimeout(t);
            }
            setRevealed(true);
            observer.disconnect();
          }
        }
      },
      { threshold, rootMargin: "0px 0px -10% 0px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [threshold, delay]);

  return (
    <Tag
      ref={ref}
      className={`reveal ${className}`}
      data-revealed={revealed ? "true" : "false"}
      {...rest}
    >
      {children}
    </Tag>
  );
}
