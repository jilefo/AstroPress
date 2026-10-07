import type { APIRoute } from "astro";
import { guard, runTransfer } from "./copy";

export const POST: APIRoute = async ({ locals, request }) => {
  const denied = guard(locals, request);
  if (denied) return denied;
  return runTransfer(request, "move");
};
