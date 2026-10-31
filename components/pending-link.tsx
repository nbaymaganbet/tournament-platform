"use client";

import Link, { useLinkStatus } from "next/link";
import type { ComponentProps } from "react";
import LoadingIndicator from "@/components/loading-indicator";

function Pending() {
  const { pending } = useLinkStatus();
  return pending ? <LoadingIndicator overlay /> : null;
}

export default function PendingLink({ children, ...props }: ComponentProps<typeof Link>) {
  return <Link {...props}>{children}<Pending /></Link>;
}
