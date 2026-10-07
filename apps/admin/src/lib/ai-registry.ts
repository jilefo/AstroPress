/**
 * AstroPress AI Action Registry
 *
 * Central registry for all AI actions. Built-in actions are registered in
 * `ai-actions.ts`. Plugins can import `registerAIAction` to add their own.
 */

export interface ActionResult {
  success: boolean;
  message: string;
  /** URL to navigate to after this action */
  navigate?: string;
  /** Extra data returned (e.g. created post id) */
  data?: Record<string, any>;
}

export type ActionHandler = (
  params: Record<string, any>,
  db: any,
  userId: number
) => Promise<ActionResult>;

export interface AIActionDef {
  /** Unique action type string used in action blocks */
  type: string;
  /** One-line description used in the AI system prompt */
  description: string;
  /** JSON example of the full action block */
  example: string;
  /** Whether this action runs server-side (via /api/ai/execute) */
  serverSide: boolean;
  /** Server-side handler — omit for client-side actions */
  handler?: ActionHandler;
}

const _registry = new Map<string, AIActionDef>();

export function registerAIAction(def: AIActionDef): void {
  _registry.set(def.type, def);
}

export function getAIAction(type: string): AIActionDef | undefined {
  return _registry.get(type);
}

export function getAllAIActions(): AIActionDef[] {
  return Array.from(_registry.values());
}

export function getServerSideActions(): AIActionDef[] {
  return Array.from(_registry.values()).filter((a) => a.serverSide);
}

export function getClientSideActions(): AIActionDef[] {
  return Array.from(_registry.values()).filter((a) => !a.serverSide);
}
