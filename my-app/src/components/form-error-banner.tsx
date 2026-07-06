"use client";

/** Form-level error line shown above the dialog footer buttons. */
export function FormErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="w-full rounded-lg border border-danger/30 bg-danger/5 px-3 py-2.5 text-sm text-danger"
    >
      {message}
    </p>
  );
}
