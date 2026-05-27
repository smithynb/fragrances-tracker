"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown, { type Components, type Options } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

interface MarkdownContentProps {
  content: string;
  /** When true, clamps to 2 lines with a Show more / Show less toggle. */
  collapsible?: boolean;
  className?: string;
}

// Hoisted to module scope so prop identity is stable across renders.
const ALLOWED_ELEMENTS: Options["allowedElements"] = [
  "p",
  "a",
  "ul",
  "ol",
  "li",
  "strong",
  "em",
  "code",
];

const REMARK_PLUGINS: Options["remarkPlugins"] = [remarkGfm];

const MARKDOWN_COMPONENTS: Components = {
  a({ href, children }) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  },
};

export function MarkdownContent({ content, collapsible = false, className }: MarkdownContentProps) {
  const [collapsed, setCollapsed] = useState(collapsible);
  const [overflows, setOverflows] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Defer measurement until after paint and observe size changes (font load,
  // container resize) without forcing synchronous layout per render. This
  // matters when many MarkdownContent instances render in a list.
  useEffect(() => {
    // When not collapsible, `isClickable` is already false so overflow state
    // is irrelevant — skip measurement entirely.
    // When not collapsed (i.e. expanded), skip measurement so that `overflows`
    // keeps its previous `true` value and the "Show less" button stays visible.
    if (!collapsible || !collapsed) return;
    const el = contentRef.current;
    if (!el) return;

    let frame = 0;
    const measure = () => {
      // rAF batches reads with the next paint to avoid layout thrash.
      frame = requestAnimationFrame(() => {
        setOverflows(el.scrollHeight > el.clientHeight + 1);
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [content, collapsible, collapsed]);

  const isClickable = collapsible && overflows;

  return (
    <div className={cn("relative w-full", className)}>
      <div
        ref={contentRef}
        className={cn(
          "text-inherit leading-relaxed",
          "[&_p]:mb-1 last:[&_p]:mb-0",
          "[&_ul]:list-disc [&_ul]:pl-4 [&_ul]:my-1 [&_ul]:space-y-0.5",
          "[&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:my-1 [&_ol]:space-y-0.5",
          "[&_li]:leading-relaxed",
          "[&_strong]:font-semibold",
          "[&_em]:italic",
          "[&_code]:font-mono [&_code]:bg-white/10 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded",
          "[&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:opacity-80",
          collapsed && "line-clamp-2",
        )}
      >
        <ReactMarkdown
          remarkPlugins={REMARK_PLUGINS}
          allowedElements={ALLOWED_ELEMENTS}
          unwrapDisallowed
          components={MARKDOWN_COMPONENTS}
        >
          {content}
        </ReactMarkdown>
      </div>

      {isClickable && (
        <button
          type="button"
          onClick={() => setCollapsed((prev) => !prev)}
          className="mt-1.5 w-full text-left text-xs text-accent/60 hover:text-accent transition-colors cursor-pointer relative before:absolute before:-inset-y-3 before:-left-8 before:-right-[9999px]"
        >
          {collapsed ? "Show more" : "Show less"}
        </button>
      )}
    </div>
  );
}
