"use client";
// CHILD-USR003 — child profile page. The view lives in components/children/child-profile-view.tsx
// so the offline app shell can render it too (a page file may only export the page itself).
import { use } from "react";
import { ChildProfileView } from "@/components/children/child-profile-view";

export default function ChildProfilePage({ params }: { params: Promise<{ childId: string }> }) {
  // Next 16 app-router: params is a Promise, unwrapped with React.use()
  const { childId } = use(params);
  return <ChildProfileView childId={childId} />;
}
