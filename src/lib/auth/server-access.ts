import { headers } from "next/headers";
import { workspaceAccessAllowed } from "./workspace-access";

export async function assertWorkspaceAccess() {
  if (!workspaceAccessAllowed(await headers())) throw new Error("Workspace access denied.");
}
